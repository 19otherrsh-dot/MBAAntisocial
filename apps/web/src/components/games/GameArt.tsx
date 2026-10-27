import { artFor } from './types';
import styles from './games.module.css';

/** Thumbnail when the build ships one, emoji art otherwise. */
export default function GameArt({ id, thumbnail, title, className }: { id: string; thumbnail?: string; title: string; className?: string }) {
  const art = artFor(id);
  return (
    <div className={className ?? styles.cardArt} style={{ background: `color-mix(in srgb, ${art.tint} 70%, var(--surface))` }}>
      {thumbnail ? (
        // Builds live on our origin or a CDN we do not configure in next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" loading="lazy" />
      ) : (
        <span role="img" aria-label={title}>{art.emoji}</span>
      )}
    </div>
  );
}
