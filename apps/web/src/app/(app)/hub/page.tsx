import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';

export const metadata = { title: 'Hub' };

export default function HubPage() {
  return (
    <Suspense>
      <HubApp mode="server" />
    </Suspense>
  );
}
