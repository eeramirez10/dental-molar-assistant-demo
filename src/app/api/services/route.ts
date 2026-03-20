import { NextResponse } from 'next/server';

import { serializeError } from '@/lib/appointments';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ data: services });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(serialized.body, { status: serialized.status });
  }
}
