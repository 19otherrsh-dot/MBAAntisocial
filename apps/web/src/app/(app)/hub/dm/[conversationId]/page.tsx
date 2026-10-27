import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';

export default async function HubConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return (
    <Suspense>
      <HubApp mode="dm" conversationId={conversationId} />
    </Suspense>
  );
}
