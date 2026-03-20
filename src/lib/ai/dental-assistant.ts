import { ConversationDirection } from '@prisma/client';

import {
  appendConversationMessage,
  cancelAppointmentFromConversation,
  createAppointmentFromConversation,
  rescheduleAppointmentFromConversation,
  simpleAssistantReply,
} from '@/lib/conversation-actions';
import { prisma } from '@/lib/prisma';

const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_URL = 'https://api.openai.com/v1/responses';

type ToolCall = {
  id?: string;
  call_id?: string;
  name: string;
  arguments: string;
  type: string;
};

async function createResponse(body: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${text}`);
  }

  return response.json();
}

export async function runDentalAssistant(contactId: string, userText: string) {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

  if (!hasApiKey) {
    const reply = await simpleAssistantReply(contactId, userText);
    return { reply, mode: 'fallback-local' as const };
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      appointments: {
        include: { service: true },
        orderBy: { appointmentStart: 'asc' },
        take: 10,
      },
      conversationMessages: {
        orderBy: { createdAt: 'desc' },
        take: 12,
      },
    },
  });

  if (!contact) {
    throw new Error('Contacto no encontrado.');
  }

  const serviceCatalog = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const instructions = [
    'Eres el asistente de Dental La Molar.',
    'Responde siempre en español.',
    'Ayudas a agendar, reagendar y cancelar citas.',
    'Usa tools cuando necesites operar agenda o consultar contexto.',
    'Si falta información, pide solo lo necesario.',
    'No inventes disponibilidad ni confirmaciones.',
  ].join(' ');

  const tools = [
    {
      type: 'function',
      name: 'get_patient_context',
      description: 'Obtiene contexto del paciente, citas recientes y datos de contacto.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    },
    {
      type: 'function',
      name: 'get_services',
      description: 'Obtiene el catálogo de servicios disponibles.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    },
    {
      type: 'function',
      name: 'create_appointment',
      description: 'Crea una nueva cita para el paciente actual.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceId', 'appointmentStart'],
        properties: {
          serviceId: { type: 'string' },
          appointmentStart: { type: 'string', description: 'Fecha ISO-8601' },
          notes: { type: 'string' },
        },
      },
    },
    {
      type: 'function',
      name: 'cancel_appointment',
      description: 'Cancela una cita existente del paciente actual.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['appointmentId'],
        properties: { appointmentId: { type: 'string' } },
      },
    },
    {
      type: 'function',
      name: 'reschedule_appointment',
      description: 'Reagenda una cita existente del paciente actual.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['appointmentId', 'appointmentStart'],
        properties: {
          appointmentId: { type: 'string' },
          appointmentStart: { type: 'string', description: 'Fecha ISO-8601' },
        },
      },
    },
  ];

  let response = await createResponse({
    model,
    instructions,
    tools,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              contact: { id: contact.id, name: contact.name, phone: contact.phone },
              recentAppointments: contact.appointments.map((appointment) => ({
                id: appointment.id,
                status: appointment.status,
                service: appointment.service?.name,
                appointmentStart: appointment.appointmentStart.toISOString(),
              })),
              recentMessages: contact.conversationMessages.reverse().map((message) => ({
                direction: message.direction,
                message: message.message,
                createdAt: message.createdAt.toISOString(),
              })),
              userMessage: userText,
            }),
          },
        ],
      },
    ],
  });

  if (!response) {
    const reply = await simpleAssistantReply(contactId, userText);
    return { reply, mode: 'fallback-local' as const };
  }

  for (let step = 0; step < 6; step += 1) {
    const functionCalls = (response.output || []).filter(
      (item: ToolCall) => item.type === 'function_call',
    );

    if (functionCalls.length === 0) break;

    const toolOutputs = [] as Array<Record<string, unknown>>;

    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments || '{}');
      let result: unknown = null;

      if (call.name === 'get_patient_context') {
        result = {
          contact: { id: contact.id, name: contact.name, phone: contact.phone },
          appointments: contact.appointments.map((appointment) => ({
            id: appointment.id,
            status: appointment.status,
            service: appointment.service?.name,
            appointmentStart: appointment.appointmentStart.toISOString(),
          })),
        };
      }

      if (call.name === 'get_services') {
        result = serviceCatalog.map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          description: service.description,
        }));
      }

      if (call.name === 'create_appointment') {
        const appointment = await createAppointmentFromConversation(contactId, {
          contact: {
            name: contact.name,
            phone: contact.phone,
            email: contact.email ?? undefined,
          },
          serviceId: String(args.serviceId),
          appointmentStart: new Date(String(args.appointmentStart)),
          notes: typeof args.notes === 'string' ? args.notes : 'Creada por asistente OpenAI',
        });

        result = {
          id: appointment.id,
          status: appointment.status,
          appointmentStart: appointment.appointmentStart.toISOString(),
          service: appointment.service?.name,
        };
      }

      if (call.name === 'cancel_appointment') {
        const appointment = await cancelAppointmentFromConversation(contactId, String(args.appointmentId));
        result = { id: appointment.id, status: appointment.status };
      }

      if (call.name === 'reschedule_appointment') {
        const appointment = await rescheduleAppointmentFromConversation(
          contactId,
          String(args.appointmentId),
          { appointmentStart: new Date(String(args.appointmentStart)) },
        );
        result = {
          id: appointment.id,
          status: appointment.status,
          appointmentStart: appointment.appointmentStart.toISOString(),
        };
      }

      toolOutputs.push({
        type: 'function_call_output',
        call_id: call.call_id || call.id,
        output: JSON.stringify(result ?? { ok: true }),
      });
    }

    response = await createResponse({
      model,
      instructions,
      tools,
      previous_response_id: response.id,
      input: toolOutputs,
    });

    if (!response) break;
  }

  const reply = (response.output_text || '').trim() || (await simpleAssistantReply(contactId, userText));

  await appendConversationMessage({
    contactId,
    direction: ConversationDirection.OUTBOUND,
    message: reply,
  });

  return { reply, mode: 'openai-tools' as const };
}
