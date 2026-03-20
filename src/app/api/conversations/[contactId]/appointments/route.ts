import { NextResponse } from 'next/server';

import {
  createAppointmentFromConversation,
} from '@/lib/conversation-actions';
import { serializeError } from '@/lib/appointments';

export async function POST(
  request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  try {
    const payload = await request.json();
    const { contactId } = await context.params;
    const appointment = await createAppointmentFromConversation(contactId, payload);

    return NextResponse.json({ data: appointment }, { status: 201 });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}
