import { ConversationDirection } from '@prisma/client';

import {
  appendConversationMessage,
  cancelAppointmentFromConversation,
  createAppointmentFromConversation,
  rescheduleAppointmentFromConversation,
  simpleAssistantReply,
} from '@/lib/conversation-actions';
import { listAvailableSlots } from '@/lib/appointments';
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

function extractHour(text: string) {
  const match = text.match(/(?:a las|alas|a la|ala)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (Number.isNaN(hour) || hour > 23) return null;
  return { hour, minute };
}

function inferIntent(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes('cancel')) return 'cancel';
  if (normalized.includes('reagend') || normalized.includes('mover')) return 'reschedule';
  if (normalized.includes('agendar') || normalized.includes('cita')) return 'schedule';
  return 'unknown';
}

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

  const normalizedText = userText.toLowerCase();
  const inferredService = serviceCatalog.find((service) => {
    const name = service.name.toLowerCase();
    return normalizedText.includes(name) || name.split(' ').some((part) => part.length > 4 && normalizedText.includes(part));
  });

  const inferredHour = extractHour(userText);
  const inferredIntent = inferIntent(userText);
  const inferredDate = (() => {
    const base = new Date();
    if (normalizedText.includes('mañana')) {
      const tomorrow = new Date(base);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (inferredHour) tomorrow.setHours(inferredHour.hour, inferredHour.minute, 0, 0);
      return tomorrow;
    }
    if (normalizedText.includes('hoy')) {
      const today = new Date(base);
      if (inferredHour) today.setHours(inferredHour.hour, inferredHour.minute, 0, 0);
      return today;
    }
    return null;
  })();

  if (inferredIntent === 'schedule' && inferredService && inferredDate) {
    const from = new Date(inferredDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    try {
      const slots = await listAvailableSlots({
        serviceId: inferredService.id,
        from,
        to,
      });

      const exactSlot = inferredHour
        ? slots.find((slot) => {
            const start = new Date(slot.start);
            return start.getHours() === inferredHour.hour && start.getMinutes() === inferredHour.minute;
          })
        : null;

      if (exactSlot) {
        const appointment = await createAppointmentFromConversation(contactId, {
          contact: {
            name: contact.name,
            phone: contact.phone,
            email: contact.email ?? undefined,
          },
          serviceId: inferredService.id,
          appointmentStart: new Date(exactSlot.start),
          notes: 'Creada por preprocesamiento determinista',
        });

        const reply = `Perfecto. Ya quedó agendada tu cita de ${appointment.service?.name ?? inferredService.name} para ${new Date(appointment.appointmentStart).toLocaleString('es-MX')}.`;

        await appendConversationMessage({
          contactId,
          direction: ConversationDirection.OUTBOUND,
          message: reply,
        });

        return { reply, mode: 'deterministic-schedule' as const };
      }

      if (slots.length > 0) {
        const options = slots.slice(0, 3).map((slot) => new Date(slot.start).toLocaleString('es-MX')).join(', ');
        const reply = `No encontré libre exactamente ese horario para ${inferredService.name}, pero sí tengo estas opciones: ${options}. ¿Cuál prefieres?`;

        await appendConversationMessage({
          contactId,
          direction: ConversationDirection.OUTBOUND,
          message: reply,
        });

        return { reply, mode: 'deterministic-slots' as const };
      }
    } catch {
      // Si falla el flujo determinista, dejamos que OpenAI tome el control.
    }
  }

  const instructions = [
    'Eres el asistente de Dental La Molar.',
    'Responde siempre en español.',
    'Ayudas a agendar, reagendar y cancelar citas.',
    'Usa tools cuando necesites operar agenda o consultar contexto.',
    'Si el usuario ya menciona servicio y horario, intenta consultar disponibilidad o crear la cita.',
    'Presta mucha atención a inferredIntent, inferredService e inferredDateTime cuando vengan en el contexto.',
    'Si el usuario pide reagendar o cancelar, intenta usar las tools correspondientes.',
    'Si falta información, pide solo lo necesario y de forma breve.',
    'No inventes disponibilidad ni confirmaciones.',
    'Si hay ambigüedad, ofrece opciones concretas basadas en servicios y horarios disponibles.',
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
      name: 'get_available_slots',
      description: 'Consulta horarios disponibles para un servicio dentro de una ventana de tiempo.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceId', 'from', 'to'],
        properties: {
          serviceId: { type: 'string' },
          from: { type: 'string', description: 'Fecha ISO-8601 inicial' },
          to: { type: 'string', description: 'Fecha ISO-8601 final' },
        },
      },
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
              inferredIntent,
              inferredService: inferredService
                ? {
                    id: inferredService.id,
                    name: inferredService.name,
                  }
                : null,
              inferredDateTime: inferredDate ? inferredDate.toISOString() : null,
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

      if (call.name === 'get_available_slots') {
        const slots = await listAvailableSlots({
          serviceId: String(args.serviceId),
          from: new Date(String(args.from)),
          to: new Date(String(args.to)),
        });

        result = slots.slice(0, 8);
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
