import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';

export default async function HubServerPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  return (
    <Suspense>
      <HubApp mode="server" serverId={serverId} />
    </Suspense>
  );
}
