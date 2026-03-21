import { AppointmentStatus } from '@prisma/client';
import { addDays, setHours, setMinutes } from 'date-fns';

import {
  cancelAppointmentFromConversation,
  createAppointmentFromConversation,
  rescheduleAppointmentFromConversation,
} from '@/lib/conversation-actions';
import { DomainError } from '@/lib/errors';
import { prisma, seedCoreData } from '@/test/db';

function buildDate(daysFromNow: number, hour: number, minute = 0) {
  return setMinutes(setHours(addDays(new Date(), daysFromNow), hour), minute);
}

describe('conversation appointment actions', () => {
  it('creates an appointment from conversation and logs an outbound confirmation message', async () => {
    const { contact, limpieza } = await seedCoreData();
    const appointmentStart = buildDate(1, 11);

    const result = await createAppointmentFromConversation(contact.id, {
      contact: {
        name: contact.name,
        phone: contact.phone,
        email: contact.email ?? undefined,
      },
      serviceId: limpieza.id,
      appointmentStart,
      notes: 'Creada en test',
    });

    expect(result.appointment.service?.name).toBe('Limpieza dental');
    expect(result.message).toContain('Tu cita quedó agendada para');

    const messages = await prisma.conversationMessage.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('Tu cita quedó agendada para');
    expect(messages[0]?.message).toContain('Limpieza dental');
  });

  it('cancels an appointment from conversation and logs an outbound confirmation message', async () => {
    const { contact, limpieza } = await seedCoreData();
    const appointmentStart = buildDate(1, 12);

    const appointment = await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart,
        appointmentEnd: buildDate(1, 13),
        status: AppointmentStatus.CONFIRMED,
      },
      include: {
        contact: true,
        service: true,
      },
    });

    const result = await cancelAppointmentFromConversation(contact.id, appointment.id);

    expect(result.appointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(result.message).toContain('ha sido cancelada correctamente');

    const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updated?.status).toBe(AppointmentStatus.CANCELLED);

    const messages = await prisma.conversationMessage.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('ha sido cancelada correctamente');
    expect(messages[0]?.message).toContain('Limpieza dental');
  });

  it('reschedules an appointment from conversation and logs an outbound confirmation message', async () => {
    const { contact, limpieza } = await seedCoreData();

    const appointment = await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart: buildDate(1, 10),
        appointmentEnd: buildDate(1, 11),
        status: AppointmentStatus.CONFIRMED,
      },
      include: {
        contact: true,
        service: true,
      },
    });

    const newStart = buildDate(1, 16);
    const result = await rescheduleAppointmentFromConversation(contact.id, appointment.id, {
      appointmentStart: newStart,
    });

    expect(result.appointment.status).toBe(AppointmentStatus.RESCHEDULED);
    expect(result.appointment.appointmentStart.toISOString()).toBe(newStart.toISOString());
    expect(result.message).toContain('Tu cita fue reagendada para');

    const messages = await prisma.conversationMessage.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('Tu cita fue reagendada para');
    expect(messages[0]?.message).toContain('Limpieza dental');
  });

  it('rejects rescheduling an appointment from conversation to an occupied slot', async () => {
    const { contact, limpieza } = await seedCoreData();

    const appointment = await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart: buildDate(1, 10),
        appointmentEnd: buildDate(1, 11),
        status: AppointmentStatus.CONFIRMED,
      },
    });

    await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart: buildDate(1, 12),
        appointmentEnd: buildDate(1, 13),
        status: AppointmentStatus.CONFIRMED,
      },
    });

    await expect(
      rescheduleAppointmentFromConversation(contact.id, appointment.id, {
        appointmentStart: buildDate(1, 12),
      }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      message: 'Ese horario ya no está disponible.',
      code: 'SLOT_OCCUPIED',
    });

    const messages = await prisma.conversationMessage.findMany({
      where: { contactId: contact.id },
    });

    expect(messages).toHaveLength(0);
  });

  it('rejects cancelling a missing appointment from conversation', async () => {
    const { contact } = await seedCoreData();

    await expect(
      cancelAppointmentFromConversation(contact.id, 'cm-appointment-inexistente'),
    ).rejects.toMatchObject<Partial<DomainError>>({
      message: 'La cita no existe.',
      code: 'APPOINTMENT_NOT_FOUND',
    });
  });
});
