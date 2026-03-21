import { addDays, setHours, setMinutes } from 'date-fns';

import { runDentalAssistant } from '@/lib/ai/dental-assistant';
import { prisma, seedCoreData } from '@/test/db';

function buildDate(daysFromNow: number, hour: number, minute = 0) {
  return setMinutes(setHours(addDays(new Date(), daysFromNow), hour), minute);
}

describe('dental assistant deterministic flow', () => {
  it('explains when the requested slot is occupied and offers alternatives', async () => {
    const { limpieza, contact } = await seedCoreData();
    const occupiedStart = buildDate(1, 12);

    await prisma.appointment.create({
      data: {
        contactId: contact.id,
        serviceId: limpieza.id,
        appointmentStart: occupiedStart,
        appointmentEnd: buildDate(1, 13),
      },
    });

    const result = await runDentalAssistant(contact.id, 'Quiero una cita de Limpieza dental mañana a las 12:00');

    expect(result.mode).toBe('deterministic-slots');
    expect(result.reply).toContain('Ese horario ya está ocupado');
    expect(result.reply).toContain('Te puedo ofrecer estas opciones');
  });

  it('explains when the requested slot is outside business hours', async () => {
    const { contact } = await seedCoreData();

    const result = await runDentalAssistant(contact.id, 'Quiero una cita de Limpieza dental mañana a las 23:00');

    expect(result.mode).toBe('deterministic-slots');
    expect(result.reply).toContain('Ese horario está fuera de nuestro horario de atención');
    expect(result.reply).toContain('Nuestro horario es de 9:00 a.m. a 9:00 p.m.');
  });

  it('explains when the requested slot is in the past', async () => {
    const { contact } = await seedCoreData();
    const pastHour = (() => {
      const date = new Date();
      date.setHours(Math.max(date.getHours() - 2, 0), 0, 0, 0);
      return date.getHours();
    })();

    const result = await runDentalAssistant(contact.id, `Quiero una cita de Limpieza dental hoy a las ${String(pastHour).padStart(2, '0')}:00`);

    expect(result.mode).toBe('deterministic-slots');
    expect(result.reply).toContain('Ese horario ya pasó');
  });

  it('creates an appointment when the requested slot is valid', async () => {
    const { contact } = await seedCoreData();

    const result = await runDentalAssistant(contact.id, 'Quiero una cita de Limpieza dental mañana a las 11:00');

    expect(result.mode).toBe('deterministic-schedule');
    expect(result.reply).toContain('Ya quedó agendada tu cita');

    const appointments = await prisma.appointment.findMany({ where: { contactId: contact.id } });
    expect(appointments).toHaveLength(1);
  });

  it('explains when the requested slot is blocked', async () => {
    const { limpieza, contact } = await seedCoreData();
    const blockedStart = buildDate(1, 14);

    await prisma.blockedSlot.create({
      data: {
        startDateTime: blockedStart,
        endDateTime: buildDate(1, 15),
        reason: 'Bloqueo de prueba',
      },
    });

    const result = await runDentalAssistant(contact.id, 'Quiero una cita de Limpieza dental mañana a las 14:00');

    expect(result.mode).toBe('deterministic-slots');
    expect(result.reply).toContain('Ese horario no está disponible en este momento');
  });
});
