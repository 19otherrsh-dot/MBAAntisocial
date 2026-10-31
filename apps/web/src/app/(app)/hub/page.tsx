import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';
import { hubInitial } from '@/server/modules/hub/initial';

export const metadata = { title: 'Hub' };

export default async function HubPage() {
  const initial = await hubInitial();
  return (
    <Suspense>
      <HubApp mode="server" initial={initial} />
    </Suspense>
  );
}
