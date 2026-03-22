import { prisma } from '@/lib/prisma';

export async function getConversationsData() {
  const contacts = await prisma.contact.findMany({
    include: {
      conversationMessages: {
        orderBy: { createdAt: 'asc' },
      },
      appointments: {
        include: {
          service: true,
        },
        orderBy: { appointmentStart: 'asc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    appointments: contact.appointments.map((appointment) => ({
      id: appointment.id,
      status: appointment.status,
      appointmentStart: appointment.appointmentStart.toISOString(),
      appointmentEnd: appointment.appointmentEnd.toISOString(),
      service: appointment.service
        ? {
            id: appointment.service.id,
            name: appointment.service.name,
            durationMinutes: appointment.service.durationMinutes,
          }
        : null,
    })),
    messages: contact.conversationMessages.map((message) => ({
      id: message.id,
      direction: message.direction,
      channel: message.channel,
      message: message.message,
      createdAt: message.createdAt.toISOString(),
    })),
  }));
}
