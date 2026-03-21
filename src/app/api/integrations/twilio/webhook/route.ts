import { NextResponse } from 'next/server';

import { ConversationDirection } from '@prisma/client';

import { runDentalAssistant } from '@/lib/ai/dental-assistant';
import { appendConversationMessage } from '@/lib/conversation-actions';
import { prisma } from '@/lib/prisma';

function normalizePhone(input: string) {
  return input.replace(/^whatsapp:/i, '').trim();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const body = Object.fromEntries(formData.entries());

  const fromRaw = String(body.From ?? '');
  const from = normalizePhone(fromRaw);
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

  const result = await runDentalAssistant(contact.id, text);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${result.reply}</Message></Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
