import { AppointmentStatus, ConversationDirection } from '@prisma/client';
import { subHours } from 'date-fns';
import { z } from 'zod';

import {
  appendConversationMessage,
  cancelAppointmentFromConversation,
  createAppointmentFromConversation,
  rescheduleAppointmentFromConversation,
  simpleAssistantReply,
} from '@/lib/conversation-actions';
import {
  diagnoseAppointmentRequest,
  listAvailableSlots,
  type AppointmentRequestDiagnosis,
} from '@/lib/appointments';
import { DomainError } from '@/lib/errors';
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

type ConversationState = {
  intent?: 'schedule' | 'cancel' | 'reschedule' | 'unknown' | 'social' | 'info';
  step?: 'idle' | 'awaiting_service' | 'awaiting_time' | 'awaiting_confirmation';
  selectedServiceId?: string;
  selectedServiceName?: string;
  lastAssistantQuestion?: string;
  updatedAt?: string;
};

const interpretationSchema = z.object({
  intent: z
    .enum(['schedule', 'cancel', 'reschedule', 'social', 'info', 'unknown'])
    .default('unknown'),
  socialAct: z
    .enum(['none', 'greeting', 'thanks', 'goodbye', 'affirm', 'deny'])
    .default('none'),
  conversationMove: z
    .enum(['continue', 'answer', 'ask_clarification', 'acknowledge'])
    .default('continue'),
  resolvedServiceName: z.string().nullable().default(null),
  serviceHint: z.string().nullable().default(null),
  wantsAvailableSlotsForDay: z.boolean().default(false),
  shouldListServices: z.boolean().default(false),
  keepCurrentState: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.5),
  naturalReply: z.string().nullable().default(null),
});

type Interpretation = z.infer<typeof interpretationSchema>;

function parseConversationState(value: string | null): ConversationState {
  if (!value) return { intent: 'unknown', step: 'idle' };

  try {
    return JSON.parse(value) as ConversationState;
  } catch {
    return { intent: 'unknown', step: 'idle' };
  }
}

async function saveConversationState(contactId: string, state: ConversationState) {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      conversationState: JSON.stringify({
        ...state,
        updatedAt: new Date().toISOString(),
      }),
    },
  });
}

function extractHour(text: string) {
  const match = text.match(/(?:a las|alas|a la|ala)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (Number.isNaN(hour) || hour > 23) return null;
  return { hour, minute };
}

function extractAllHours(text: string) {
  const matches = [...text.matchAll(/(?:a las|alas|a la|ala)\s*(\d{1,2})(?::(\d{2}))?/gi)];

  return matches
    .map((match) => {
      const hour = Number(match[1]);
      const minute = match[2] ? Number(match[2]) : 0;
      if (Number.isNaN(hour) || hour > 23) return null;
      return { hour, minute };
    })
    .filter((value): value is { hour: number; minute: number } => Boolean(value));
}

function inferIntent(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes('cancel')) return 'cancel';
  if (normalized.includes('reagend') || normalized.includes('mover')) return 'reschedule';
  if (normalized.includes('agendar') || normalized.includes('cita')) return 'schedule';
  return 'unknown';
}

function isShortAffirmative(text: string) {
  return /^(si|sí|simon|simón|va|ok|oki|sale|jalo|jal[oó]|porfa|sí porfa|si porfa|arre|bro)$/i.test(
    text.trim(),
  );
}

function formatHourLabel(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatSlotOptions(slots: Array<{ start: string }>) {
  return slots
    .slice(0, 3)
    .map((slot) =>
      new Date(slot.start).toLocaleString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    )
    .join(', ');
}

function formatAppointmentLabel(date: Date) {
  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function withTrailingPeriod(text: string) {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function serializeToolError(error: unknown) {
  if (error instanceof DomainError) {
    return {
      error: error.message,
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: 'Tool execution failed.',
  };
}

function buildDeterministicFailureReply({
  diagnosis,
  serviceName,
  suggestedSlots,
}: {
  diagnosis: AppointmentRequestDiagnosis;
  serviceName: string;
  suggestedSlots: Array<{ start: string }>;
}) {
  const optionsText = formatSlotOptions(suggestedSlots);
  const optionsSuffix = optionsText
    ? ` Te puedo ofrecer estas opciones: ${optionsText} ¿Cuál prefieres?`
    : ' Si quieres, puedo buscarte otras opciones cercanas.';

  if (diagnosis.reason === 'past') {
    return `Ese horario ya pasó y no puedo agendar citas en el pasado.${optionsSuffix}`;
  }

  if (diagnosis.reason === 'outside_business_hours') {
    const scheduleText = diagnosis.businessHours
      ? ` Nuestro horario es de ${formatHourLabel(diagnosis.businessHours.startTime)} a ${formatHourLabel(
          diagnosis.businessHours.endTime,
        )}`
      : '';

    return `Ese horario está fuera de nuestro horario de atención.${scheduleText}${optionsSuffix}`;
  }

  if (diagnosis.reason === 'blocked') {
    return `Ese horario no está disponible en este momento para ${serviceName}.${optionsSuffix}`;
  }

  if (diagnosis.reason === 'occupied') {
    return `Ese horario ya está ocupado para ${serviceName}.${optionsSuffix}`;
  }

  return `No encontré disponible exactamente ese horario para ${serviceName}.${optionsSuffix}`;
}

function buildServicesReply(
  services: Array<{ name: string; durationMinutes: number; description: string | null }>,
) {
  const catalog = services
    .map(
      (service) =>
        `• ${service.name} (${service.durationMinutes} min)${service.description ? ` — ${service.description}` : ''}`,
    )
    .join('\n');

  return `Claro. Ahorita manejamos estos servicios:\n${catalog}\n\n¿Cuál te interesa?`;
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

async function interpretConversationTurn(input: {
  userText: string;
  conversationState: ConversationState;
  recentMessages: Array<{ direction: string; message: string; createdAt: string }>;
  services: Array<{ id: string; name: string; description: string | null; durationMinutes: number }>;
  activeAppointments: Array<{ id: string; status: string; service: string | null; appointmentStart: string }>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.VITEST === 'true') return null;

  const instructions = [
    'Eres un interprete conversacional para una clinica dental.',
    'NO respondes al usuario final con texto libre largo: primero analizas el turno.',
    'Debes detectar intencion real, acto social y continuidad conversacional.',
    'Usa el estado previo, mensajes recientes y catalogo de servicios.',
    'Si el usuario agradece, no reinicies la conversacion ni des bienvenida otra vez.',
    'Si el usuario esta en flujo de agenda y responde con lenguaje natural sobre un procedimiento o problema, interpreta el servicio mas probable o devuelve una aclaracion natural.',
    'Si el usuario esta eligiendo servicio y escribe algo ambiguo pero relacionado, intenta sugerir el servicio mas probable en resolvedServiceName o serviceHint.',
    'Si el usuario esta pidiendo cita pero no ha dado hora exacta, puedes marcar wantsAvailableSlotsForDay=true cuando mencione un dia como hoy o mañana.',
    'Evita devolver unknown cuando haya suficiente contexto reciente para continuar la conversacion.',
    'Ejemplos: si el chat venia de agenda y el usuario dice "gracias", eso es social/thanks con acknowledge y una respuesta corta natural.',
    'Ejemplos: si el chat venia de agenda y el usuario dice "que me saquen una muela", eso normalmente es schedule con serviceHint o resolvedServiceName y ask_clarification, no unknown.',
    'Ejemplos: si el usuario dice "quiero cita mañana" sin hora exacta, eso es schedule y wantsAvailableSlotsForDay=true.',
    'Devuelve solo JSON valido con la forma pedida.',
  ].join(' ');

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: ['schedule', 'cancel', 'reschedule', 'social', 'info', 'unknown'] },
      socialAct: { type: 'string', enum: ['none', 'greeting', 'thanks', 'goodbye', 'affirm', 'deny'] },
      conversationMove: { type: 'string', enum: ['continue', 'answer', 'ask_clarification', 'acknowledge'] },
      resolvedServiceName: { type: ['string', 'null'] },
      serviceHint: { type: ['string', 'null'] },
      wantsAvailableSlotsForDay: { type: 'boolean' },
      shouldListServices: { type: 'boolean' },
      keepCurrentState: { type: 'boolean' },
      confidence: { type: 'number' },
      naturalReply: { type: ['string', 'null'] },
    },
    required: [
      'intent',
      'socialAct',
      'conversationMove',
      'resolvedServiceName',
      'serviceHint',
      'wantsAvailableSlotsForDay',
      'shouldListServices',
      'keepCurrentState',
      'confidence',
      'naturalReply',
    ],
  };

  const response = await createResponse({
    model,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: instructions }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(input),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'conversation_interpretation',
        schema,
      },
    },
  });

  const raw = (response?.output_text || '').trim();
  if (!raw) return null;

  try {
    return interpretationSchema.parse(JSON.parse(raw)) as Interpretation;
  } catch {
    return null;
  }
}

export async function runDentalAssistant(contactId: string, userText: string) {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      appointments: {
        include: { service: true },
        orderBy: { appointmentStart: 'asc' },
        take: 10,
      },
      conversationMessages: {
        where: {
          createdAt: {
            gte: subHours(new Date(), 1),
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 30,
      },
    },
  });

  if (!contact) throw new Error('Contacto no encontrado.');

  const serviceCatalog = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const state = parseConversationState(contact.conversationState);
  const normalizedText = userText.toLowerCase().trim();
  const inferredService = serviceCatalog.find((service) => {
    const name = service.name.toLowerCase();
    return normalizedText.includes(name)
      || name.split(' ').some((part) => part.length > 4 && normalizedText.includes(part));
  });

  const baseIntent = inferIntent(userText);
  const inferredHour = extractHour(userText);
  const inferredHours = extractAllHours(userText);
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

  const activeAppointments = contact.appointments.filter((appointment) =>
    [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED].includes(
      appointment.status,
    ),
  );

  const recentMessages = contact.conversationMessages.map((message) => ({
    direction: message.direction,
    message: message.message,
    createdAt: message.createdAt.toISOString(),
  }));

  const interpretation = hasApiKey
    ? await interpretConversationTurn({
        userText,
        conversationState: state,
        recentMessages,
        services: serviceCatalog.map((service) => ({
          id: service.id,
          name: service.name,
          description: service.description,
          durationMinutes: service.durationMinutes,
        })),
        activeAppointments: activeAppointments.map((appointment) => ({
          id: appointment.id,
          status: appointment.status,
          service: appointment.service?.name ?? null,
          appointmentStart: appointment.appointmentStart.toISOString(),
        })),
      })
    : null;

  const effectiveIntent = (() => {
    if (interpretation?.intent && interpretation.intent !== 'unknown') return interpretation.intent;
    if (baseIntent !== 'unknown') return baseIntent;
    if (state.intent) return state.intent;
    return 'unknown';
  })();

  const selectedService = inferredService
    || (interpretation?.resolvedServiceName
      ? serviceCatalog.find(
          (service) => service.name.toLowerCase() === interpretation.resolvedServiceName?.toLowerCase(),
        )
      : null)
    || serviceCatalog.find((service) => service.id === state.selectedServiceId)
    || null;

  const sendReply = async (reply: string, mode: string, nextState?: Partial<ConversationState>) => {
    await appendConversationMessage({
      contactId,
      direction: ConversationDirection.OUTBOUND,
      message: reply,
    });

    await saveConversationState(contactId, {
      ...state,
      ...nextState,
    });

    return { reply, mode };
  };

  if (!hasApiKey) {
    const reply = await simpleAssistantReply(contactId, userText);
    await saveConversationState(contactId, {
      ...state,
      intent: effectiveIntent,
      step: effectiveIntent === 'schedule' ? 'awaiting_service' : 'idle',
    });
    return { reply, mode: 'fallback-local' as const };
  }

  if (interpretation?.socialAct === 'thanks' || normalizedText === 'gracias') {
    const reply = interpretation?.naturalReply
      || (state.intent === 'schedule' && state.step === 'awaiting_service'
        ? 'Con gusto. Dime qué servicio te interesa y seguimos.'
        : state.intent === 'schedule' && state.step === 'awaiting_time'
          ? 'Con gusto. Si quieres, dime qué horario prefieres y seguimos.'
          : 'Con gusto 🙂');

    return sendReply(reply, 'deterministic-social', {
      intent: state.intent ?? 'social',
      step: state.step ?? 'idle',
      selectedServiceId: state.selectedServiceId,
      selectedServiceName: state.selectedServiceName,
    });
  }

  if (interpretation?.socialAct === 'greeting' && !state.lastAssistantQuestion) {
    return sendReply(
      interpretation.naturalReply || 'Hola 👋 Soy el asistente de Dental La Molar. ¿Te ayudo con una cita?',
      'deterministic-social',
      {
        intent: 'unknown',
        step: 'idle',
      },
    );
  }

  if (interpretation?.shouldListServices || normalizedText.includes('servicios')) {
    return sendReply(buildServicesReply(serviceCatalog), 'deterministic-services', {
      intent: 'schedule',
      step: 'awaiting_service',
      lastAssistantQuestion: '¿Cuál servicio te interesa?',
    });
  }

  if (
    effectiveIntent === 'schedule'
    && (normalizedText === 'agendar' || normalizedText === 'quiero agendar' || isShortAffirmative(userText))
  ) {
    return sendReply(buildServicesReply(serviceCatalog), 'deterministic-services', {
      intent: 'schedule',
      step: 'awaiting_service',
      lastAssistantQuestion: '¿Cuál servicio te interesa?',
    });
  }

  if (effectiveIntent === 'schedule' && !selectedService && state.step === 'awaiting_service') {
    const clarificationReply = interpretation?.naturalReply
      || (interpretation?.serviceHint
        ? `Por lo que me dices, podría ayudarte con ${interpretation.serviceHint}. Si quieres, te explico esa opción o te ofrezco una valoración. ¿Cuál prefieres?`
        : 'Cuéntame qué tratamiento o problema dental traes y te digo cuál servicio te conviene más.');

    return sendReply(clarificationReply, 'deterministic-service-clarification', {
      intent: 'schedule',
      step: 'awaiting_service',
      lastAssistantQuestion: clarificationReply,
    });
  }

  if (effectiveIntent === 'schedule' && selectedService && !inferredDate) {
    if (interpretation?.naturalReply && interpretation.conversationMove === 'ask_clarification') {
      return sendReply(interpretation.naturalReply, 'deterministic-followup', {
        intent: 'schedule',
        step: 'awaiting_time',
        selectedServiceId: selectedService.id,
        selectedServiceName: selectedService.name,
        lastAssistantQuestion: interpretation.naturalReply,
      });
    }

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 2);
    const slots = await listAvailableSlots({ serviceId: selectedService.id, from, to }).catch(() => []);
    const options = formatSlotOptions(slots);
    const reply = options
      ? `Perfecto. Ya tengo ${selectedService.name}. Para hoy o mañana te puedo ofrecer estos horarios: ${options}. ¿Cuál prefieres?`
      : `Perfecto. Ya tengo ${selectedService.name}. ¿Qué día u horario prefieres? Por ejemplo: mañana a las 6:00 p.m.`;

    return sendReply(reply, 'deterministic-followup', {
      intent: 'schedule',
      step: 'awaiting_time',
      selectedServiceId: selectedService.id,
      selectedServiceName: selectedService.name,
      lastAssistantQuestion: reply,
    });
  }

  if (effectiveIntent === 'cancel' && activeAppointments.length === 1) {
    try {
      const { message } = await cancelAppointmentFromConversation(contactId, activeAppointments[0].id, {
        appendConfirmation: false,
      });
      return sendReply(message, 'deterministic-cancel', {
        intent: 'cancel',
        step: 'idle',
        selectedServiceId: undefined,
        selectedServiceName: undefined,
      });
    } catch {}
  }

  if (effectiveIntent === 'reschedule' && activeAppointments.length === 1 && inferredHours.length >= 2) {
    const targetAppointment = activeAppointments[0];
    const newHour = inferredHours[inferredHours.length - 1];
    const requestedStart = new Date(targetAppointment.appointmentStart);
    requestedStart.setHours(newHour.hour, newHour.minute, 0, 0);

    try {
      const dayStart = new Date(requestedStart);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const [diagnosis, slots] = await Promise.all([
        diagnoseAppointmentRequest({
          serviceId: targetAppointment.serviceId ?? '',
          appointmentStart: requestedStart,
          ignoreAppointmentId: targetAppointment.id,
        }),
        listAvailableSlots({
          serviceId: targetAppointment.serviceId ?? '',
          from: dayStart,
          to: dayEnd,
        }),
      ]);
      const exactSlot = slots.find((slot) => {
        const start = new Date(slot.start);
        return start.getHours() === newHour.hour && start.getMinutes() === newHour.minute;
      });
      if (diagnosis.ok && exactSlot) {
        const { message } = await rescheduleAppointmentFromConversation(
          contactId,
          targetAppointment.id,
          { appointmentStart: new Date(exactSlot.start) },
          { appendConfirmation: false },
        );
        return sendReply(message, 'deterministic-reschedule', {
          intent: 'reschedule',
          step: 'idle',
          selectedServiceId: undefined,
          selectedServiceName: undefined,
        });
      }
      return sendReply(
        buildDeterministicFailureReply({
          diagnosis,
          serviceName: targetAppointment.service?.name ?? 'tu cita',
          suggestedSlots: slots,
        }),
        'deterministic-slots',
        { intent: 'reschedule', step: 'awaiting_time' },
      );
    } catch {}
  }

  if (effectiveIntent === 'schedule' && selectedService && inferredDate) {
    const from = new Date(inferredDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    try {
      const [diagnosis, slots] = await Promise.all([
        diagnoseAppointmentRequest({
          serviceId: selectedService.id,
          appointmentStart: inferredDate,
        }),
        listAvailableSlots({
          serviceId: selectedService.id,
          from,
          to,
        }),
      ]);
      if (interpretation?.wantsAvailableSlotsForDay && !inferredHour) {
        const reply = slots.length > 0
          ? `Para ${normalizedText.includes('mañana') ? 'mañana' : 'ese día'} tengo disponibles estos horarios para ${selectedService.name}: ${formatSlotOptions(slots)}. ¿Cuál prefieres?`
          : `No encontré horarios disponibles para ${selectedService.name} en ese día. Si quieres, te busco otras opciones cercanas.`;
        return sendReply(reply, 'deterministic-day-slots', {
          intent: 'schedule',
          step: 'awaiting_time',
          selectedServiceId: selectedService.id,
          selectedServiceName: selectedService.name,
        });
      }
      const exactSlot = inferredHour
        ? slots.find((slot) => {
            const start = new Date(slot.start);
            return start.getHours() === inferredHour.hour && start.getMinutes() === inferredHour.minute;
          })
        : null;
      if (diagnosis.ok && exactSlot) {
        const { appointment } = await createAppointmentFromConversation(
          contactId,
          {
            contact: { name: contact.name, phone: contact.phone, email: contact.email ?? undefined },
            serviceId: selectedService.id,
            appointmentStart: new Date(exactSlot.start),
            notes: 'Creada por preprocesamiento determinista',
          },
          { appendConfirmation: false },
        );
        return sendReply(
          `Perfecto. Ya quedó agendada tu cita de ${appointment.service?.name ?? selectedService.name} para ${formatAppointmentLabel(new Date(appointment.appointmentStart))}`,
          'deterministic-schedule',
          { intent: 'schedule', step: 'idle', selectedServiceId: undefined, selectedServiceName: undefined },
        );
      }
      return sendReply(
        buildDeterministicFailureReply({ diagnosis, serviceName: selectedService.name, suggestedSlots: slots }),
        'deterministic-slots',
        { intent: 'schedule', step: 'awaiting_time', selectedServiceId: selectedService.id, selectedServiceName: selectedService.name },
      );
    } catch (error) {
      if (error instanceof DomainError) {
        return sendReply(
          `${withTrailingPeriod('No pude revisar ese horario por un problema con la solicitud')} ${withTrailingPeriod(error.message)}`,
          'deterministic-error',
          { intent: 'schedule', step: 'awaiting_time' },
        );
      }
    }
  }

  const instructions = [
    'Eres el asistente de Dental La Molar.',
    'Responde siempre en español.',
    'Ayudas a agendar, reagendar y cancelar citas.',
    'Usa tools cuando necesites operar agenda o consultar contexto.',
    'Debes aprovechar el conversationState, la interpretation y los recentMessages para mantener continuidad y no reiniciar la conversación sin motivo.',
    'Si el usuario agradece o saluda, responde natural y breve; no reinicies el onboarding.',
    'Si el usuario habla de un posible procedimiento o problema dental, interpreta qué servicio podría corresponder y responde natural.',
    'Si el usuario pide disponibilidad de un día, prioriza mostrar horarios disponibles.',
    'Si falta información, pide solo lo necesario y de forma breve.',
    'No inventes disponibilidad ni confirmaciones.',
  ].join(' ');

  const tools = [
    { type: 'function', name: 'get_patient_context', description: 'Obtiene contexto del paciente, citas recientes y datos de contacto.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
    { type: 'function', name: 'get_services', description: 'Obtiene el catálogo de servicios disponibles.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
    { type: 'function', name: 'get_available_slots', description: 'Consulta horarios disponibles para un servicio dentro de una ventana de tiempo.', parameters: { type: 'object', additionalProperties: false, required: ['serviceId', 'from', 'to'], properties: { serviceId: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } } },
    { type: 'function', name: 'create_appointment', description: 'Crea una nueva cita para el paciente actual.', parameters: { type: 'object', additionalProperties: false, required: ['serviceId', 'appointmentStart'], properties: { serviceId: { type: 'string' }, appointmentStart: { type: 'string' }, notes: { type: 'string' } } } },
    { type: 'function', name: 'cancel_appointment', description: 'Cancela una cita existente del paciente actual.', parameters: { type: 'object', additionalProperties: false, required: ['appointmentId'], properties: { appointmentId: { type: 'string' } } } },
    { type: 'function', name: 'reschedule_appointment', description: 'Reagenda una cita existente del paciente actual.', parameters: { type: 'object', additionalProperties: false, required: ['appointmentId', 'appointmentStart'], properties: { appointmentId: { type: 'string' }, appointmentStart: { type: 'string' } } } },
  ];

  let response = await createResponse({
    model,
    instructions,
    tools,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify({
          contact: { id: contact.id, name: contact.name, phone: contact.phone },
          conversationState: state,
          interpretation,
          recentAppointments: contact.appointments.map((appointment) => ({ id: appointment.id, status: appointment.status, service: appointment.service?.name, appointmentStart: appointment.appointmentStart.toISOString() })),
          recentMessages,
          userMessage: userText,
          inferredIntent: effectiveIntent,
          inferredService: selectedService ? { id: selectedService.id, name: selectedService.name } : null,
          inferredDateTime: inferredDate ? inferredDate.toISOString() : null,
        }) }],
      },
    ],
  });

  if (!response) {
    const reply = await simpleAssistantReply(contactId, userText);
    await saveConversationState(contactId, {
      ...state,
      intent: effectiveIntent,
      step: effectiveIntent === 'schedule' ? 'awaiting_service' : state.step ?? 'idle',
      selectedServiceId: selectedService?.id,
      selectedServiceName: selectedService?.name,
    });
    return { reply, mode: 'fallback-local' as const };
  }

  let lastToolReply: string | null = null;
  for (let step = 0; step < 6; step += 1) {
    const functionCalls = (response.output || []).filter((item: ToolCall) => item.type === 'function_call');
    if (functionCalls.length === 0) break;
    const toolOutputs = [] as Array<Record<string, unknown>>;
    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments || '{}');
      let result: unknown = null;
      if (call.name === 'get_patient_context') {
        result = { contact: { id: contact.id, name: contact.name, phone: contact.phone }, appointments: contact.appointments.map((appointment) => ({ id: appointment.id, status: appointment.status, service: appointment.service?.name, appointmentStart: appointment.appointmentStart.toISOString() })), conversationState: state, recentMessages, interpretation };
      }
      if (call.name === 'get_services') {
        result = serviceCatalog.map((service) => ({ id: service.id, name: service.name, durationMinutes: service.durationMinutes, description: service.description }));
      }
      if (call.name === 'get_available_slots') {
        try {
          const slots = await listAvailableSlots({ serviceId: String(args.serviceId), from: new Date(String(args.from)), to: new Date(String(args.to)) });
          result = slots.slice(0, 8);
        } catch (error) {
          result = serializeToolError(error);
        }
      }
      if (call.name === 'create_appointment') {
        try {
          const { appointment, message } = await createAppointmentFromConversation(contactId, { contact: { name: contact.name, phone: contact.phone, email: contact.email ?? undefined }, serviceId: String(args.serviceId), appointmentStart: new Date(String(args.appointmentStart)), notes: typeof args.notes === 'string' ? args.notes : 'Creada por asistente OpenAI' }, { appendConfirmation: false });
          lastToolReply = message;
          result = { id: appointment.id, status: appointment.status, appointmentStart: appointment.appointmentStart.toISOString(), service: appointment.service?.name, confirmationMessage: message };
        } catch (error) {
          result = serializeToolError(error);
        }
      }
      if (call.name === 'cancel_appointment') {
        try {
          const { appointment, message } = await cancelAppointmentFromConversation(contactId, String(args.appointmentId), { appendConfirmation: false });
          lastToolReply = message;
          result = { id: appointment.id, status: appointment.status, confirmationMessage: message };
        } catch (error) {
          result = serializeToolError(error);
        }
      }
      if (call.name === 'reschedule_appointment') {
        try {
          const { appointment, message } = await rescheduleAppointmentFromConversation(contactId, String(args.appointmentId), { appointmentStart: new Date(String(args.appointmentStart)) }, { appendConfirmation: false });
          lastToolReply = message;
          result = { id: appointment.id, status: appointment.status, appointmentStart: appointment.appointmentStart.toISOString(), confirmationMessage: message };
        } catch (error) {
          result = serializeToolError(error);
        }
      }
      toolOutputs.push({ type: 'function_call_output', call_id: call.call_id || call.id, output: JSON.stringify(result ?? { ok: true }) });
    }
    response = await createResponse({ model, instructions, tools, previous_response_id: response.id, input: toolOutputs });
    if (!response) break;
  }

  const usedFallback = !(response.output_text || '').trim() && !lastToolReply;
  const fallbackReply = usedFallback ? await simpleAssistantReply(contactId, userText) : null;
  const reply = (response.output_text || '').trim() || lastToolReply || fallbackReply || '';
  if (!usedFallback) {
    await appendConversationMessage({ contactId, direction: ConversationDirection.OUTBOUND, message: reply });
  }
  await saveConversationState(contactId, {
    ...state,
    intent: effectiveIntent,
    step: selectedService ? 'awaiting_time' : state.step ?? 'idle',
    selectedServiceId: selectedService?.id,
    selectedServiceName: selectedService?.name,
    lastAssistantQuestion: reply,
  });
  return { reply, mode: 'openai-tools' as const };
}
