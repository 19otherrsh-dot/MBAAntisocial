import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';

export default async function HubChannelPage({ params }: { params: Promise<{ serverId: string; channelId: string }> }) {
  const { serverId, channelId } = await params;
  return (
    <Suspense>
      <HubApp mode="server" serverId={serverId} channelId={channelId} />
    </Suspense>
  );
}
