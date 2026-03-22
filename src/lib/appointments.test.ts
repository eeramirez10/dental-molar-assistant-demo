import { addDays, setHours, setMinutes } from 'date-fns';

import {
  createAppointment,
  diagnoseAppointmentRequest,
  rescheduleAppointment,
} from '@/lib/appointments';
import { DomainError } from '@/lib/errors';
import { prisma, seedCoreData } from '@/test/db';

function buildDate(daysFromNow: number, hour: number, minute = 0) {
  return setMinutes(setHours(addDays(new Date(), daysFromNow), hour), minute);
}

describe('appointments domain', () => {
  it('diagnoses a slot in the past', async () => {
    const { limpieza } = await seedCoreData();

    const diagnosis = await diagnoseAppointmentRequest({
      serviceId: limpieza.id,
      appointmentStart: buildDate(-1, 10),
    });

    expect(diagnosis).toMatchObject({ ok: false, reason: 'past' });
  });

  it('diagnoses a slot outside business hours', async () => {
    const { limpieza } = await seedCoreData();

    const diagnosis = await diagnoseAppointmentRequest({
      serviceId: limpieza.id,
      appointmentStart: buildDate(1, 23),
    });

    expect(diagnosis).toMatchObject({
      ok: false,
      reason: 'outside_business_hours',
      businessHours: { startTime: '09:00', endTime: '21:00' },
    });
  });

  it('diagnoses an occupied slot', async () => {
    const { limpieza, contact } = await seedCoreData();
    const appointmentStart = buildDate(1, 12);

    await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart,
        appointmentEnd: buildDate(1, 13),
      },
    });

    const diagnosis = await diagnoseAppointmentRequest({
      serviceId: limpieza.id,
      appointmentStart,
    });

    expect(diagnosis).toMatchObject({ ok: false, reason: 'occupied' });
  });

  it('diagnoses a blocked slot', async () => {
    const { limpieza } = await seedCoreData();
    const appointmentStart = buildDate(1, 14);

    await prisma.blockedSlot.create({
      data: {
        startDateTime: appointmentStart,
        endDateTime: buildDate(1, 15),
        reason: 'Comida',
      },
    });

    const diagnosis = await diagnoseAppointmentRequest({
      serviceId: limpieza.id,
      appointmentStart,
    });

    expect(diagnosis).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('creates a valid appointment', async () => {
    const { limpieza } = await seedCoreData();
    const appointmentStart = buildDate(1, 11);

    const appointment = await createAppointment({
      contact: {
        name: 'Paciente Demo',
        phone: '+5215550000000',
        email: 'paciente@example.com',
      },
      serviceId: limpieza.id,
      appointmentStart,
    });

    expect(appointment.service?.name).toBe('Limpieza dental');
    expect(appointment.appointmentStart.toISOString()).toBe(appointmentStart.toISOString());
  });

  it('rejects creating an appointment outside business hours', async () => {
    const { limpieza } = await seedCoreData();

    await expect(
      createAppointment({
        contact: {
          name: 'Paciente Demo',
          phone: '+5215550000000',
          email: 'paciente@example.com',
        },
        serviceId: limpieza.id,
        appointmentStart: buildDate(1, 23),
      }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      message: 'La cita cae fuera del horario de atención.',
      code: 'OUTSIDE_BUSINESS_HOURS',
    });
  });

  it('rejects rescheduling to an occupied slot', async () => {
    const { limpieza, contact } = await seedCoreData();
    const originalStart = buildDate(1, 10);
    const occupiedStart = buildDate(1, 12);

    const appointment = await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart: originalStart,
        appointmentEnd: buildDate(1, 11),
      },
    });

    await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart: occupiedStart,
        appointmentEnd: buildDate(1, 13),
      },
    });

    await expect(
      rescheduleAppointment(appointment.id, { appointmentStart: occupiedStart }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      message: 'Ese horario ya no está disponible.',
      code: 'SLOT_OCCUPIED',
    });
  });
});
