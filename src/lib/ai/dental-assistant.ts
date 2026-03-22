import { ConversationDirection } from '@prisma/client';

import { appendConversationMessage, simpleAssistantReply } from '@/lib/conversation-actions';
import { dentalAssistantPrompt } from '@/lib/ai/dental-assistant.prompt';
import {
  DentalAssistantToolRouter,
  dentalAssistantToolDefinitions,
  getActiveAppointmentsSummary,
} from '@/lib/ai/dental-assistant-tools';
import { AssistantClient } from '@/lib/integrations/openai/assistant-client';
import { prisma } from '@/lib/prisma';

function normalizeAssistantText(text: string) {
  return text.replace(/\b(a\.m\.|p\.m\.)\./gi, '$1').trim();
}

async function getOrCreateThreadId(client: AssistantClient, contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contacto no encontrado.');

  if (contact.assistantThreadId) return contact.assistantThreadId;

  const thread = await client.createThread();
  await prisma.contact.update({
    where: { id: contactId },
    data: { assistantThreadId: thread.id },
  });

  return thread.id;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDentalAssistant(contactId: string, userText: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const reply = await simpleAssistantReply(contactId, userText);
    return { reply, mode: 'fallback-local' as const };
  }

  const client = new AssistantClient(apiKey);
  const assistantId = process.env.OPENAI_DENTAL_ASSISTANT_ID
    || (await client.createAssistant({
      name: 'Dental La Molar Reception',
      instructions: dentalAssistantPrompt,
      tools: dentalAssistantToolDefinitions(),
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    })).id;
  const toolRouter = new DentalAssistantToolRouter();

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

  if (!contact) throw new Error('Contacto no encontrado.');

  const threadId = await getOrCreateThreadId(client, contactId);

  const input = JSON.stringify(
    {
      system_prompt: dentalAssistantPrompt,
      context: {
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          conversationState: contact.conversationState,
        },
        activeAppointments: getActiveAppointmentsSummary(contact.appointments),
        recentMessages: contact.conversationMessages.reverse().map((message) => ({
          direction: message.direction,
          message: message.message,
          createdAt: message.createdAt.toISOString(),
        })),
      },
      userMessage: userText,
    },
    null,
    2,
  );

  await client.appendUserMessage(threadId, input);

  let run = await client.createRun(threadId, assistantId);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (run.status === 'completed') break;

    if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
      const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
      const toolOutputs = [] as Array<{ tool_call_id: string; output: string }>;

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;

        try {
          const result = await toolRouter.executeTool(name, args, contact);
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({ ok: true, result }),
          });
        } catch (error) {
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          });
        }
      }

      run = await client.submitToolOutputs({
        threadId,
        runId: run.id,
        toolOutputs,
      });
      continue;
    }

    if (['failed', 'cancelled', 'expired', 'incomplete'].includes(run.status)) {
      const lastError = run.last_error?.message || run.incomplete_details?.reason || run.status;
      throw new Error(`Assistant run failed: ${lastError}`);
    }

    await wait(1000);
    run = await client.retrieveRun(threadId, run.id);
  }

  if (run.status !== 'completed') {
    throw new Error(`Assistant run finished with status: ${run.status}`);
  }

  const messages = await client.listMessages(threadId);
  const assistantMessage = messages.data.find((message) => message.role === 'assistant');

  let reply = '';
  if (assistantMessage) {
    for (const content of assistantMessage.content) {
      if (content.type === 'text') {
        reply = content.text.value;
        break;
      }
    }
  }

  const normalizedReply = normalizeAssistantText(reply) || (await simpleAssistantReply(contactId, userText));

  if (normalizedReply !== reply) {
    // no-op, just normalized formatting
  }

  if (normalizedReply) {
    await appendConversationMessage({
      contactId,
      direction: ConversationDirection.OUTBOUND,
      message: normalizedReply,
    });
  }

  return { reply: normalizedReply, mode: 'assistants-api' as const, threadId };
}
