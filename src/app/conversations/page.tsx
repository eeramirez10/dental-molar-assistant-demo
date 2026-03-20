import ConversationsClient from '@/app/conversations-client';
import { getConversationsData } from '@/lib/conversations-data';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  const conversations = await getConversationsData();

  return <ConversationsClient conversations={conversations} />;
}
