import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.service.createMany({
    data: [
      {
        name: 'Valoración',
        description: 'Primera revisión y diagnóstico general.',
        durationMinutes: 60,
      },
      {
        name: 'Limpieza dental',
        description: 'Limpieza general y prevención.',
        durationMinutes: 60,
      },
      {
        name: 'Urgencia dental',
        description: 'Atención prioritaria para dolor o molestias.',
        durationMinutes: 60,
      },
      {
        name: 'Blanqueamiento',
        description: 'Servicio estético con valoración inicial.',
        durationMinutes: 60,
      },
    ],
    skipDuplicates: true,
  });

  const businessHours = Array.from({ length: 7 }).map((_, dayOfWeek) => ({
    dayOfWeek,
    startTime: '09:00',
    endTime: '21:00',
    isActive: true,
  }));

  for (const hour of businessHours) {
    await prisma.businessHour.upsert({
      where: { dayOfWeek: hour.dayOfWeek },
      update: {
        startTime: hour.startTime,
        endTime: hour.endTime,
        isActive: hour.isActive,
      },
      create: hour,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
