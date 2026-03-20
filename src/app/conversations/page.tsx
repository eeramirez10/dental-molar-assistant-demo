import ConversationsClient from '@/app/conversations-client';
import { getConversationsData } from '@/lib/conversations-data';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  const [conversations, services] = await Promise.all([
    getConversationsData(),
    prisma.service.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <ConversationsClient
      conversations={conversations}
      services={services.map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
      }))}
    />
  );
}
