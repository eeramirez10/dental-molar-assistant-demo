import { NextResponse } from 'next/server';

import { ConversationDirection } from '@prisma/client';

import { runDentalAssistant } from '@/lib/ai/dental-assistant';
import { appendConversationMessage } from '@/lib/conversation-actions';
import { prisma } from '@/lib/prisma';

function normalizePhone(input: string) {
  return input.replace(/^whatsapp:/i, '').trim();
}

export async function POST(request: Request) {
  const payload = await request.json();
  const contactIdInput = String(payload.contactId ?? '');
  const phone = normalizePhone(String(payload.phone ?? '').trim());
  const text = String(payload.text ?? '');
  const persistInbound = payload.persistInbound !== false;

  if (!text || (!phone && !contactIdInput)) {
    return NextResponse.json(
      { error: 'Debes enviar text y phone (preferido) o contactId.' },
      { status: 400 },
    );
  }

  let contactId = contactIdInput;

  if (phone) {
    const contact = await prisma.contact.upsert({
      where: { phone },
      update: {},
      create: {
        name: payload.name ? String(payload.name) : 'Paciente',
        phone,
      },
    });

    contactId = contact.id;
  }

  if (persistInbound) {
    await appendConversationMessage({
      contactId,
      direction: ConversationDirection.INBOUND,
      message: text,
      channel: 'whatsapp',
    });
  }

  const result = await runDentalAssistant(contactId, text);

  return NextResponse.json({ data: { ...result, contactId } });
}
