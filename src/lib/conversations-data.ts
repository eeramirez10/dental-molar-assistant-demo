import { prisma } from '@/lib/prisma';

export async function getConversationsData() {
  const contacts = await prisma.contact.findMany({
    include: {
      conversationMessages: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    messages: contact.conversationMessages.map((message) => ({
      id: message.id,
      direction: message.direction,
      channel: message.channel,
      message: message.message,
      createdAt: message.createdAt.toISOString(),
    })),
  }));
}
