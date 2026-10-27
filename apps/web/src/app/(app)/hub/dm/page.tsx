import { Suspense } from 'react';
import HubApp from '@/components/hub/HubApp';

export const metadata = { title: 'Direct messages' };

export default function HubDmPage() {
  return (
    <Suspense>
      <HubApp mode="dm" />
    </Suspense>
  );
}
