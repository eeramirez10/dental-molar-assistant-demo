import { ConversationDirection } from '@prisma/client';

import {
  cancelAppointment,
  createAppointment,
  rescheduleAppointment,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
} from '@/lib/appointments';
import { prisma } from '@/lib/prisma';

function formatAppointmentSummary(date: Date, serviceName?: string | null) {
  return `${serviceName ? `${serviceName} · ` : ''}${date.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export async function appendConversationMessage(input: {
  contactId: string;
  message: string;
  direction: ConversationDirection;
  channel?: string;
}) {
  return prisma.conversationMessage.create({
    data: {
      contactId: input.contactId,
      channel: input.channel ?? 'whatsapp',
      direction: input.direction,
      message: input.message,
    },
  });
}

export async function createAppointmentFromConversation(
  contactId: string,
  input: CreateAppointmentInput,
) {
  const appointment = await createAppointment(input);

  await appendConversationMessage({
    contactId,
    direction: ConversationDirection.OUTBOUND,
    message: `Listo. Tu cita quedó agendada para ${formatAppointmentSummary(
      appointment.appointmentStart,
      appointment.service?.name,
    )}.`,
  });

  return appointment;
}

export async function cancelAppointmentFromConversation(contactId: string, appointmentId: string) {
  const appointment = await cancelAppointment(appointmentId);
  const service = 'serviceId' in appointment && appointment.serviceId
    ? await prisma.service.findUnique({ where: { id: appointment.serviceId } })
    : null;

  await appendConversationMessage({
    contactId,
    direction: ConversationDirection.OUTBOUND,
    message: `Tu cita ${service ? `de ${service.name} ` : ''}ha sido cancelada correctamente.`,
  });

  return appointment;
}

export async function rescheduleAppointmentFromConversation(
  contactId: string,
  appointmentId: string,
  input: RescheduleAppointmentInput,
) {
  const appointment = await rescheduleAppointment(appointmentId, input);

  await appendConversationMessage({
    contactId,
    direction: ConversationDirection.OUTBOUND,
    message: `Tu cita fue reagendada para ${formatAppointmentSummary(
      appointment.appointmentStart,
      appointment.service?.name,
    )}.`,
  });

  return appointment;
}

export async function simpleAssistantReply(contactId: string, inboundText: string) {
  const normalized = inboundText.toLowerCase();

  let reply =
    'Gracias por tu mensaje. Puedo ayudarte a agendar, reagendar o cancelar una cita.';

  if (normalized.includes('agendar') || normalized.includes('cita')) {
    reply =
      'Claro. Puedo ayudarte a agendar. Indícame el servicio que buscas y el horario que prefieres.';
  } else if (normalized.includes('cancel')) {
    reply = 'Entendido. Puedo ayudarte a cancelar tu cita. Confírmame cuál deseas cancelar.';
  } else if (normalized.includes('reagend')) {
    reply = 'Con gusto. Dime qué cita quieres mover y qué nuevo horario prefieres.';
  } else if (normalized.includes('hola')) {
    reply = 'Hola 👋 Soy el asistente de Dental La Molar. ¿Te ayudo con una cita?';
  }

  await appendConversationMessage({
    contactId,
    direction: ConversationDirection.OUTBOUND,
    message: reply,
  });

  return reply;
}
