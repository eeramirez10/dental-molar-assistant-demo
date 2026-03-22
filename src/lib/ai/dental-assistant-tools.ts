import { AppointmentStatus, type Contact } from '@prisma/client';
import { addDays, format } from 'date-fns';

import {
  cancelAppointmentFromConversation,
  createAppointmentFromConversation,
  rescheduleAppointmentFromConversation,
} from '@/lib/conversation-actions';
import { listAvailableSlots } from '@/lib/appointments';
import { prisma } from '@/lib/prisma';

export function dentalAssistantToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'get_patient_context',
        description: 'Obtiene contexto del paciente, citas activas, mensajes recientes y estado conversacional.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_services',
        description: 'Obtiene el catálogo de servicios disponibles.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_available_slots',
        description: 'Consulta horarios disponibles para un servicio en un rango de fechas.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['serviceId', 'from', 'to'],
          properties: {
            serviceId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_day_availability',
        description: 'Obtiene si la clínica abre ese día, el horario de apertura/cierre y los slots reales disponibles para un servicio en una fecha concreta.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['serviceId', 'date'],
          properties: {
            serviceId: { type: 'string' },
            date: { type: 'string', description: 'Fecha ISO o YYYY-MM-DD del día consultado' },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_clinic_info',
        description: 'Obtiene dirección, horario general, indicaciones básicas y link de mapa demo de la clínica.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'create_appointment',
        description: 'Crea una nueva cita para el paciente actual.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['serviceId', 'appointmentStart'],
          properties: {
            serviceId: { type: 'string' },
            appointmentStart: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'cancel_appointment',
        description: 'Cancela una cita existente del paciente actual.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['appointmentId'],
          properties: { appointmentId: { type: 'string' } },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'reschedule_appointment',
        description: 'Reagenda una cita existente del paciente actual.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['appointmentId', 'appointmentStart'],
          properties: {
            appointmentId: { type: 'string' },
            appointmentStart: { type: 'string' },
          },
        },
      },
    },
  ];
}

export class DentalAssistantToolRouter {
  async executeTool(name: string, args: Record<string, unknown>, contact: Contact) {
    switch (name) {
      case 'get_patient_context':
        return this.getPatientContext(contact.id);
      case 'get_services':
        return this.getServices();
      case 'get_available_slots':
        return this.getAvailableSlots(args);
      case 'get_day_availability':
        return this.getDayAvailability(args);
      case 'get_clinic_info':
        return this.getClinicInfo();
      case 'create_appointment':
        return this.createAppointment(args, contact);
      case 'cancel_appointment':
        return this.cancelAppointment(args, contact.id);
      case 'reschedule_appointment':
        return this.rescheduleAppointment(args, contact.id);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  }

  private async getPatientContext(contactId: string) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        appointments: {
          include: { service: true },
          orderBy: { appointmentStart: 'asc' },
        },
        conversationMessages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    return {
      contact: contact
        ? {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            conversationState: contact.conversationState,
          }
        : null,
      appointments: (contact?.appointments ?? []).map((appointment) => ({
        id: appointment.id,
        status: appointment.status,
        service: appointment.service?.name,
        appointmentStart: appointment.appointmentStart.toISOString(),
      })),
      recentMessages: (contact?.conversationMessages ?? []).reverse().map((message) => ({
        direction: message.direction,
        message: message.message,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  private async getServices() {
    const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
    }));
  }

  private async getAvailableSlots(args: Record<string, unknown>) {
    const serviceId = String(args.serviceId ?? '');
    const fromInput = args.from ? new Date(String(args.from)) : new Date();
    const toInput = args.to ? new Date(String(args.to)) : addDays(new Date(fromInput), 1);
    const slots = await listAvailableSlots({ serviceId, from: fromInput, to: toInput });
    return slots.slice(0, 8);
  }

  private getClinicInfo() {
    return {
      clinicName: 'Dental La Molar',
      address: 'Av. Insurgentes Sur 1234, Col. Del Valle, Benito Juárez, CDMX',
      generalHours: 'Lunes a sábado de 9:00 a.m. a 9:00 p.m.',
      directions: 'Estamos en planta baja, junto a la farmacia demo de la esquina.',
      mapUrl: 'https://maps.google.com/?q=Av.+Insurgentes+Sur+1234,+Col.+Del+Valle,+Benito+Ju%C3%A1rez,+CDMX',
    };
  }

  private async getDayAvailability(args: Record<string, unknown>) {
    const serviceId = String(args.serviceId ?? '');
    const rawDate = String(args.date ?? '');
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date for get_day_availability');
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const businessHour = await prisma.businessHour.findUnique({
      where: { dayOfWeek: dayStart.getDay() },
    });

    const dayName = format(dayStart, 'EEEE');

    if (!businessHour || !businessHour.isActive) {
      return {
        date: dayStart.toISOString(),
        dayName,
        isOpen: false,
        businessHours: null,
        availableSlots: [],
      };
    }

    const slots = await listAvailableSlots({
      serviceId,
      from: dayStart,
      to: dayEnd,
    });

    return {
      date: dayStart.toISOString(),
      dayName,
      isOpen: true,
      businessHours: {
        startTime: businessHour.startTime,
        endTime: businessHour.endTime,
      },
      availableSlots: slots.map((slot) => slot.start),
    };
  }

  private async createAppointment(args: Record<string, unknown>, contact: Contact) {
    const { appointment, message } = await createAppointmentFromConversation(
      contact.id,
      {
        contact: {
          name: contact.name,
          phone: contact.phone,
          email: contact.email ?? undefined,
        },
        serviceId: String(args.serviceId),
        appointmentStart: new Date(String(args.appointmentStart)),
        notes: typeof args.notes === 'string' ? args.notes : 'Creada por assistant API',
      },
      { appendConfirmation: false },
    );

    return {
      id: appointment.id,
      status: appointment.status,
      appointmentStart: appointment.appointmentStart.toISOString(),
      message,
    };
  }

  private async cancelAppointment(args: Record<string, unknown>, contactId: string) {
    const appointmentId = String(args.appointmentId ?? '');
    const { appointment, message } = await cancelAppointmentFromConversation(contactId, appointmentId, {
      appendConfirmation: false,
    });
    return { id: appointment.id, status: appointment.status, message };
  }

  private async rescheduleAppointment(args: Record<string, unknown>, contactId: string) {
    const appointmentId = String(args.appointmentId ?? '');
    const { appointment, message } = await rescheduleAppointmentFromConversation(
      contactId,
      appointmentId,
      { appointmentStart: new Date(String(args.appointmentStart)) },
      { appendConfirmation: false },
    );
    return {
      id: appointment.id,
      status: appointment.status,
      appointmentStart: appointment.appointmentStart.toISOString(),
      message,
    };
  }
}

export function getActiveAppointmentsSummary(appointments: Array<{ id: string; status: AppointmentStatus; serviceId: string | null; appointmentStart: Date; service?: { name: string } | null }>) {
  return appointments
    .filter((appointment) => [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED].includes(appointment.status))
    .map((appointment) => ({
      id: appointment.id,
      status: appointment.status,
      service: appointment.service?.name ?? null,
      appointmentStart: appointment.appointmentStart.toISOString(),
    }));
}
