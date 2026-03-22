import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function resetDatabase() {
  await prisma.conversationMessage.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.blockedSlot.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.businessHour.deleteMany();
  await prisma.service.deleteMany();
  await prisma.contact.deleteMany();
}

export async function seedCoreData() {
  await prisma.businessHour.createMany({
    data: Array.from({ length: 7 }).map((_, dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00',
      endTime: '21:00',
      isActive: true,
    })),
  });

  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: 'Limpieza dental',
        description: 'Limpieza general y prevención.',
        durationMinutes: 60,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Valoración',
        description: 'Primera revisión y diagnóstico general.',
        durationMinutes: 60,
      },
    }),
  ]);

  const contact = await prisma.contact.create({
    data: {
      name: 'Paciente Demo',
      phone: '+5215550000000',
      email: 'paciente@example.com',
    },
  });

  return {
    contact,
    limpieza: services[0],
    valoracion: services[1],
  };
}
