import { afterAll, beforeEach } from 'vitest';

import { prisma, resetDatabase } from '@/test/db';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});
