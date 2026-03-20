import { NextResponse } from 'next/server';

import { ConversationDirection } from '@prisma/client';

import { runDentalAssistant } from '@/lib/ai/dental-assistant';
import { appendConversationMessage } from '@/lib/conversation-actions';

export async function POST(request: Request) {
  const payload = await request.json();
  const contactId = String(payload.contactId ?? '');
  const text = String(payload.text ?? '');
  const persistInbound = payload.persistInbound !== false;

  if (!contactId || !text) {
    return NextResponse.json({ error: 'contactId y text son requeridos.' }, { status: 400 });
  }

  if (persistInbound) {
    await appendConversationMessage({
      contactId,
      direction: ConversationDirection.INBOUND,
      message: text,
    });
  }

  const result = await runDentalAssistant(contactId, text);

  return NextResponse.json({ data: result });
}
