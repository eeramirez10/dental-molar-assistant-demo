import { NextResponse } from 'next/server';

import {
  cancelAppointment,
  rescheduleAppointment,
  serializeError,
} from '@/lib/appointments';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const payload = await request.json();
    const { appointmentId } = await context.params;
    const appointment = await rescheduleAppointment(appointmentId, payload);

    return NextResponse.json({ data: appointment });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const { appointmentId } = await context.params;
    const appointment = await cancelAppointment(appointmentId);

    return NextResponse.json({ data: appointment });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}
