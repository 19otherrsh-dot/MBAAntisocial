import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';
import { hubInitial } from '@/server/modules/hub/initial';

export default async function HubChannelPage({ params }: { params: Promise<{ serverId: string; channelId: string }> }) {
  const { serverId, channelId } = await params;
  const initial = await hubInitial(serverId);
  return (
    <Suspense>
      <HubApp mode="server" serverId={serverId} channelId={channelId} initial={initial} />
    </Suspense>
  );
}
