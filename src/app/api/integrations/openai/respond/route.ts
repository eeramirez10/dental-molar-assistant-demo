import { NextResponse } from 'next/server';

import { simpleAssistantReply } from '@/lib/conversation-actions';

export async function POST(request: Request) {
  const payload = await request.json();
  const contactId = String(payload.contactId ?? '');
  const text = String(payload.text ?? '');

  if (!contactId || !text) {
    return NextResponse.json({ error: 'contactId y text son requeridos.' }, { status: 400 });
  }

  const reply = await simpleAssistantReply(contactId, text);

  return NextResponse.json({ data: { reply, mode: 'fallback-local' } });
}
