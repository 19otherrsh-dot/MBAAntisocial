import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';
import { hubInitial } from '@/server/modules/hub/initial';

export default async function HubServerPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const initial = await hubInitial(serverId);
  return (
    <Suspense>
      <HubApp mode="server" serverId={serverId} initial={initial} />
    </Suspense>
  );
}
