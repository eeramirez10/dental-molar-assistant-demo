import {
  AppointmentSource,
  AppointmentStatus,
  ConversationDirection,
  PrismaClient,
} from '@prisma/client';
import { addDays, addHours, setHours, setMinutes } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  await prisma.service.createMany({
    data: [
      {
        name: 'Valoración',
        description: 'Primera revisión y diagnóstico general.',
        durationMinutes: 60,
      },
      {
        name: 'Limpieza dental',
        description: 'Limpieza general y prevención.',
        durationMinutes: 60,
      },
      {
        name: 'Urgencia dental',
        description: 'Atención prioritaria para dolor o molestias.',
        durationMinutes: 60,
      },
      {
        name: 'Blanqueamiento',
        description: 'Servicio estético con valoración inicial.',
        durationMinutes: 60,
      },
    ],
    skipDuplicates: true,
  });

  const businessHours = Array.from({ length: 7 }).map((_, dayOfWeek) => ({
    dayOfWeek,
    startTime: '09:00',
    endTime: '21:00',
    isActive: true,
  }));

  for (const hour of businessHours) {
    await prisma.businessHour.upsert({
      where: { dayOfWeek: hour.dayOfWeek },
      update: {
        startTime: hour.startTime,
        endTime: hour.endTime,
        isActive: hour.isActive,
      },
      create: hour,
    });
  }

  const [valoracion, limpieza] = await prisma.service.findMany({
    where: { name: { in: ['Valoración', 'Limpieza dental'] } },
    orderBy: { name: 'asc' },
  });

  const contactAna = await prisma.contact.upsert({
    where: { phone: '+5215511111111' },
    update: { name: 'Ana Martínez', email: 'ana@example.com' },
    create: {
      name: 'Ana Martínez',
      phone: '+5215511111111',
      email: 'ana@example.com',
    },
  });

  const contactLuis = await prisma.contact.upsert({
    where: { phone: '+5215522222222' },
    update: { name: 'Luis Ramírez', email: 'luis@example.com' },
    create: {
      name: 'Luis Ramírez',
      phone: '+5215522222222',
      email: 'luis@example.com',
    },
  });

  const tomorrowAt10 = setMinutes(setHours(addDays(new Date(), 1), 10), 0);
  const tomorrowAt12 = setMinutes(setHours(addDays(new Date(), 1), 12), 0);

  const appointment1 = await prisma.appointment.upsert({
    where: { id: 'cm-demo-appointment-1' },
    update: {
      contactId: contactAna.id,
      serviceId: valoracion?.id,
      appointmentStart: tomorrowAt10,
      appointmentEnd: addHours(tomorrowAt10, 1),
      status: AppointmentStatus.CONFIRMED,
      source: AppointmentSource.DEMO,
      notes: 'Paciente nueva, primera visita.',
    },
    create: {
      id: 'cm-demo-appointment-1',
      contactId: contactAna.id,
      serviceId: valoracion?.id,
      appointmentStart: tomorrowAt10,
      appointmentEnd: addHours(tomorrowAt10, 1),
      status: AppointmentStatus.CONFIRMED,
      source: AppointmentSource.DEMO,
      notes: 'Paciente nueva, primera visita.',
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'cm-demo-appointment-2' },
    update: {
      contactId: contactLuis.id,
      serviceId: limpieza?.id,
      appointmentStart: tomorrowAt12,
      appointmentEnd: addHours(tomorrowAt12, 1),
      status: AppointmentStatus.SCHEDULED,
      source: AppointmentSource.DEMO,
      notes: 'Seguimiento de limpieza anual.',
    },
    create: {
      id: 'cm-demo-appointment-2',
      contactId: contactLuis.id,
      serviceId: limpieza?.id,
      appointmentStart: tomorrowAt12,
      appointmentEnd: addHours(tomorrowAt12, 1),
      status: AppointmentStatus.SCHEDULED,
      source: AppointmentSource.DEMO,
      notes: 'Seguimiento de limpieza anual.',
    },
  });

  const conversationMessages = [
    {
      id: 'cm-demo-msg-1',
      contactId: contactAna.id,
      channel: 'whatsapp',
      direction: ConversationDirection.INBOUND,
      message: 'Hola, quisiera agendar una valoración para mañana en la mañana.',
      providerMessageId: 'demo-1',
    },
    {
      id: 'cm-demo-msg-2',
      contactId: contactAna.id,
      channel: 'whatsapp',
      direction: ConversationDirection.OUTBOUND,
      message: 'Claro, tengo disponible mañana a las 10:00 AM. ¿Te funciona?',
      providerMessageId: 'demo-2',
    },
    {
      id: 'cm-demo-msg-3',
      contactId: contactAna.id,
      channel: 'whatsapp',
      direction: ConversationDirection.INBOUND,
      message: 'Sí, perfecto. Me llamo Ana Martínez.',
      providerMessageId: 'demo-3',
    },
    {
      id: 'cm-demo-msg-4',
      contactId: contactAna.id,
      channel: 'whatsapp',
      direction: ConversationDirection.OUTBOUND,
      message: `Listo Ana, tu cita quedó confirmada para ${tomorrowAt10.toLocaleString()}.`,
      providerMessageId: 'demo-4',
    },
    {
      id: 'cm-demo-msg-5',
      contactId: contactLuis.id,
      channel: 'whatsapp',
      direction: ConversationDirection.INBOUND,
      message: 'Buenas tardes, quiero una limpieza dental este fin.',
      providerMessageId: 'demo-5',
    },
    {
      id: 'cm-demo-msg-6',
      contactId: contactLuis.id,
      channel: 'whatsapp',
      direction: ConversationDirection.OUTBOUND,
      message: 'Te puedo ofrecer mañana a las 12:00 PM. ¿Deseas reservarla?',
      providerMessageId: 'demo-6',
    },
  ];

  for (const message of conversationMessages) {
    await prisma.conversationMessage.upsert({
      where: { id: message.id },
      update: message,
      create: message,
    });
  }

  await prisma.contact.update({
    where: { id: contactAna.id },
    data: { updatedAt: appointment1.updatedAt },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
