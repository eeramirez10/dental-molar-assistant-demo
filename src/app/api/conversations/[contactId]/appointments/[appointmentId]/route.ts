import { NextResponse } from 'next/server';

import {
  cancelAppointmentFromConversation,
  rescheduleAppointmentFromConversation,
} from '@/lib/conversation-actions';
import { serializeError } from '@/lib/appointments';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ contactId: string; appointmentId: string }> },
) {
  try {
    const payload = await request.json();
    const { contactId, appointmentId } = await context.params;
    const appointment = await rescheduleAppointmentFromConversation(contactId, appointmentId, payload);

    return NextResponse.json({ data: appointment });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ contactId: string; appointmentId: string }> },
) {
  try {
    const { contactId, appointmentId } = await context.params;
    const appointment = await cancelAppointmentFromConversation(contactId, appointmentId);

    return NextResponse.json({ data: appointment });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}
