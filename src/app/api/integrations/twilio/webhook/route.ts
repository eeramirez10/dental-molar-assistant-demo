import { NextResponse } from 'next/server';

import { ConversationDirection } from '@prisma/client';

import { appendConversationMessage, simpleAssistantReply } from '@/lib/conversation-actions';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const formData = await request.formData();
  const body = Object.fromEntries(formData.entries());

  const from = String(body.From ?? '');
  const text = String(body.Body ?? '');

  if (!from || !text) {
    return new NextResponse('Missing From/Body', { status: 400 });
  }

  const contact = await prisma.contact.upsert({
    where: { phone: from },
    update: {},
    create: {
      name: from,
      phone: from,
    },
  });

  await appendConversationMessage({
    contactId: contact.id,
    direction: ConversationDirection.INBOUND,
    message: text,
    channel: 'whatsapp',
  });

  const reply = await simpleAssistantReply(contact.id, text);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
