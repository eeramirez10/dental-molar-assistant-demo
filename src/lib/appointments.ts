import { AppointmentStatus, type Appointment, type Contact, type Service } from '@prisma/client';
import { addMinutes, getDay, isBefore, isValid } from 'date-fns';
import { z } from 'zod';

import { DomainError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULED,
];

const dateValue = z.coerce.date().refine((value) => isValid(value), 'Fecha inválida.');

export const availabilityQuerySchema = z
  .object({
    serviceId: z.string().cuid(),
    from: dateValue,
    to: dateValue,
  })
  .superRefine((value, ctx) => {
    if (value.to <= value.from) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'El rango final debe ser posterior al inicial.',
      });
    }
  });

export const createAppointmentSchema = z.object({
  contact: z.object({
    name: z.string().trim().min(2),
    phone: z.string().trim().min(8),
    email: z.string().trim().email().optional(),
    notes: z.string().trim().min(1).optional(),
  }),
  serviceId: z.string().cuid(),
  appointmentStart: dateValue,
  notes: z.string().trim().min(1).optional(),
});

export const rescheduleAppointmentSchema = z.object({
  appointmentStart: dateValue,
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export type AvailableSlot = {
  start: string;
  end: string;
};

export type SlotFailureReason = 'past' | 'outside_business_hours' | 'blocked' | 'occupied';

export type AppointmentRequestDiagnosis = {
  ok: boolean;
  reason?: SlotFailureReason;
  businessHours?: {
    startTime: string;
    endTime: string;
  };
};

export type AppointmentWithRelations = Appointment & {
  contact: Contact;
  service: Service | null;
};

function intersects(
  rangeAStart: Date,
  rangeAEnd: Date,
  rangeBStart: Date,
  rangeBEnd: Date,
): boolean {
  return rangeAStart < rangeBEnd && rangeAEnd > rangeBStart;
}

async function getServiceOrThrow(serviceId: string) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });

  if (!service || !service.isActive) {
    throw new DomainError('El servicio no existe o no está activo.', 404, {
      code: 'SERVICE_NOT_FOUND',
    });
  }

  return service;
}

export async function diagnoseAppointmentRequest({
  serviceId,
  appointmentStart,
  ignoreAppointmentId,
}: {
  serviceId: string;
  appointmentStart: Date;
  ignoreAppointmentId?: string;
}): Promise<AppointmentRequestDiagnosis> {
  const service = await getServiceOrThrow(serviceId);
  const appointmentEnd = addMinutes(appointmentStart, service.durationMinutes);

  if (isBefore(appointmentStart, new Date())) {
    return { ok: false, reason: 'past' };
  }

  const businessHour = await prisma.businessHour.findUnique({
    where: { dayOfWeek: getDay(appointmentStart) },
  });

  if (!businessHour || !businessHour.isActive) {
    return { ok: false, reason: 'outside_business_hours' };
  }

  const [startHour, startMinute] = businessHour.startTime.split(':').map(Number);
  const [endHour, endMinute] = businessHour.endTime.split(':').map(Number);

  const businessStart = new Date(appointmentStart);
  businessStart.setHours(startHour, startMinute, 0, 0);

  const businessEnd = new Date(appointmentStart);
  businessEnd.setHours(endHour, endMinute, 0, 0);

  if (appointmentStart < businessStart || appointmentEnd > businessEnd) {
    return {
      ok: false,
      reason: 'outside_business_hours',
      businessHours: {
        startTime: businessHour.startTime,
        endTime: businessHour.endTime,
      },
    };
  }

  const blockedSlots = await prisma.blockedSlot.findMany({
    where: {
      startDateTime: { lt: appointmentEnd },
      endDateTime: { gt: appointmentStart },
    },
  });

  if (blockedSlots.length > 0) {
    return { ok: false, reason: 'blocked' };
  }

  const conflictingAppointment = await prisma.appointment.findFirst({
    where: {
      id: ignoreAppointmentId ? { not: ignoreAppointmentId } : undefined,
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
      appointmentStart: { lt: appointmentEnd },
      appointmentEnd: { gt: appointmentStart },
    },
  });

  if (conflictingAppointment) {
    return { ok: false, reason: 'occupied' };
  }

  return { ok: true };
}

async function ensureSlotAvailability({
  serviceId,
  appointmentStart,
  ignoreAppointmentId,
}: {
  serviceId: string;
  appointmentStart: Date;
  ignoreAppointmentId?: string;
}) {
  const service = await getServiceOrThrow(serviceId);
  const appointmentEnd = addMinutes(appointmentStart, service.durationMinutes);
  const diagnosis = await diagnoseAppointmentRequest({
    serviceId,
    appointmentStart,
    ignoreAppointmentId,
  });

  if (!diagnosis.ok) {
    if (diagnosis.reason === 'past') {
      throw new DomainError('No se puede agendar una cita en el pasado.', 400, {
        code: 'APPOINTMENT_IN_PAST',
      });
    }

    if (diagnosis.reason === 'outside_business_hours') {
      throw new DomainError('La cita cae fuera del horario de atención.', 400, {
        code: 'OUTSIDE_BUSINESS_HOURS',
        details: diagnosis.businessHours,
      });
    }

    if (diagnosis.reason === 'blocked') {
      throw new DomainError('Ese horario está bloqueado.', 409, {
        code: 'BLOCKED_SLOT',
      });
    }

    if (diagnosis.reason === 'occupied') {
      throw new DomainError('Ese horario ya no está disponible.', 409, {
        code: 'SLOT_OCCUPIED',
      });
    }
  }

  return {
    service,
    appointmentEnd,
  };
}

export async function listAvailableSlots(input: AvailabilityQuery): Promise<AvailableSlot[]> {
  const { serviceId, from, to } = availabilityQuerySchema.parse(input);
  const service = await getServiceOrThrow(serviceId);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
      appointmentStart: { lt: to },
      appointmentEnd: { gt: from },
    },
    select: {
      appointmentStart: true,
      appointmentEnd: true,
    },
  });

  const blockedSlots = await prisma.blockedSlot.findMany({
    where: {
      startDateTime: { lt: to },
      endDateTime: { gt: from },
    },
    select: {
      startDateTime: true,
      endDateTime: true,
    },
  });

  const slots: AvailableSlot[] = [];

  for (
    let cursor = new Date(from);
    cursor < to;
    cursor = addMinutes(cursor, service.durationMinutes)
  ) {
    const candidateStart = new Date(cursor);
    const candidateEnd = addMinutes(candidateStart, service.durationMinutes);

    if (candidateEnd > to) {
      break;
    }

    const businessHour = await prisma.businessHour.findUnique({
      where: { dayOfWeek: getDay(candidateStart) },
    });

    if (!businessHour || !businessHour.isActive) {
      continue;
    }

    const [startHour, startMinute] = businessHour.startTime.split(':').map(Number);
    const [endHour, endMinute] = businessHour.endTime.split(':').map(Number);

    const businessStart = new Date(candidateStart);
    businessStart.setHours(startHour, startMinute, 0, 0);

    const businessEnd = new Date(candidateStart);
    businessEnd.setHours(endHour, endMinute, 0, 0);

    const insideBusinessHours = candidateStart >= businessStart && candidateEnd <= businessEnd;

    if (!insideBusinessHours) {
      continue;
    }

    const hasAppointmentConflict = appointments.some((appointment) =>
      intersects(
        candidateStart,
        candidateEnd,
        appointment.appointmentStart,
        appointment.appointmentEnd,
      ),
    );

    if (hasAppointmentConflict) {
      continue;
    }

    const hasBlockedConflict = blockedSlots.some((blockedSlot) =>
      intersects(candidateStart, candidateEnd, blockedSlot.startDateTime, blockedSlot.endDateTime),
    );

    if (hasBlockedConflict) {
      continue;
    }

    slots.push({
      start: candidateStart.toISOString(),
      end: candidateEnd.toISOString(),
    });
  }

  return slots;
}

export async function createAppointment(input: CreateAppointmentInput) {
  const parsedInput = createAppointmentSchema.parse(input);
  const { service, appointmentEnd } = await ensureSlotAvailability({
    serviceId: parsedInput.serviceId,
    appointmentStart: parsedInput.appointmentStart,
  });

  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.upsert({
      where: { phone: parsedInput.contact.phone },
      update: {
        name: parsedInput.contact.name,
        email: parsedInput.contact.email,
        notes: parsedInput.contact.notes,
      },
      create: {
        name: parsedInput.contact.name,
        phone: parsedInput.contact.phone,
        email: parsedInput.contact.email,
        notes: parsedInput.contact.notes,
      },
    });

    return tx.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: service.id,
        appointmentStart: parsedInput.appointmentStart,
        appointmentEnd,
        notes: parsedInput.notes,
      },
      include: {
        contact: true,
        service: true,
      },
    });
  });
}

export async function cancelAppointment(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

  if (!appointment) {
    throw new DomainError('La cita no existe.', 404, {
      code: 'APPOINTMENT_NOT_FOUND',
    });
  }

  if (appointment.status === AppointmentStatus.CANCELLED) {
    return appointment;
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: AppointmentStatus.CANCELLED },
    include: {
      contact: true,
      service: true,
    },
  });
}

export async function rescheduleAppointment(
  appointmentId: string,
  input: RescheduleAppointmentInput,
) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

  if (!appointment) {
    throw new DomainError('La cita no existe.', 404, {
      code: 'APPOINTMENT_NOT_FOUND',
    });
  }

  const parsedInput = rescheduleAppointmentSchema.parse(input);
  const { appointmentEnd } = await ensureSlotAvailability({
    serviceId: appointment.serviceId ?? '',
    appointmentStart: parsedInput.appointmentStart,
    ignoreAppointmentId: appointmentId,
  });

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      appointmentStart: parsedInput.appointmentStart,
      appointmentEnd,
      status: AppointmentStatus.RESCHEDULED,
    },
    include: {
      contact: true,
      service: true,
    },
  });
}

export async function listAppointments() {
  return prisma.appointment.findMany({
    orderBy: { appointmentStart: 'asc' },
    include: {
      contact: true,
      service: true,
    },
  });
}

export function serializeError(error: unknown) {
  if (error instanceof DomainError) {
    return {
      status: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: 'Solicitud inválida.',
        details: z.flattenError(error),
      },
    };
  }

  console.error(error);

  return {
    status: 500,
    body: { error: 'Ocurrió un error interno.' },
  };
}
