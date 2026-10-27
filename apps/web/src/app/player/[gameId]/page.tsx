import { Suspense } from 'react';
import GamePlayer from '@/components/games/GamePlayer';

export default async function PlayerPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return (
    <Suspense>
      <GamePlayer gameId={gameId} />
    </Suspense>
  );
}
