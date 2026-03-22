import { NextResponse } from 'next/server';

import {
  createAppointment,
  listAppointments,
  serializeError,
} from '@/lib/appointments';

export async function GET() {
  try {
    const appointments = await listAppointments();
    return NextResponse.json({ data: appointments });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const appointment = await createAppointment(payload);

    return NextResponse.json({ data: appointment }, { status: 201 });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}
