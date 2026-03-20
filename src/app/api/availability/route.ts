import { NextResponse } from 'next/server';

import {
  availabilityQuerySchema,
  listAvailableSlots,
  serializeError,
} from '@/lib/appointments';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = availabilityQuerySchema.parse({
      serviceId: searchParams.get('serviceId'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });

    const slots = await listAvailableSlots(query);

    return NextResponse.json({ data: slots });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}
