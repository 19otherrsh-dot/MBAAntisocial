'use client';

import { useState } from 'react';
import { Rocket, Undo2, Upload } from 'lucide-react';
import { Chip, EmptyState } from '@/components/ui/Display';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { formatDateTime } from '@/lib/utils';
import styles from './admin.module.css';

interface GameRow {
  id: string;
  title: string;
  category: string;
  transport: string;
  build: { version: string; assetBase: string; threads: boolean; publishedAt: string | null } | null;
}
interface ReleaseRow {
  _id: string;
  game: string;
  version: string;
  assetBase: string;
  active: boolean;
  notes: string;
  publishedBy: string | null;
  createdAt: string;
}

/**
 * Builds go live from here without a redeploy. Builds committed with the app
 * (scripts/publish-game.ts) show as live too; a release here overrides them.
 */
export default function ReleasesPanel() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, loading, refetch } = useApiQuery<{ games: GameRow[]; releases: ReleaseRow[] }>('/api/admin/games');
  const [publishing, setPublishing] = useState<GameRow | null>(null);

  const toggle = async (release: ReleaseRow) => {
    const turningOff = release.active;
    const ok = await confirm({
      title: turningOff ? `Roll back ${release.game} ${release.version}?` : `Re-activate ${release.game} ${release.version}?`,
      body: turningOff ? 'Players get the previous active release, or the committed build, within seconds. Rooms already playing finish on the old one.' : 'It becomes the live build again if it is the newest active release.',
      confirmLabel: turningOff ? 'Roll back' : 'Re-activate',
      destructive: turningOff,
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/games/${release._id}`, { active: !release.active });
      toast.success(turningOff ? 'Rolled back' : 'Re-activated');
      refetch();
    } catch (caught) {
      toast.error('That did not go through', errorMessage(caught));
    }
  };

  if (loading && !data) return <div className="skeleton" style={{ height: 300, borderRadius: 'var(--r-lg)' }} />;
  if (!data) return null;

  const releasesFor = (id: string) => data.releases.filter((r) => r.game === id);

  return (
    <div className="stack gap-4">
      <p className={styles.note}>
        A build is a Godot web export uploaded to a CDN folder (served over HTTPS with CORS, and CORP/COEP headers if it uses threads) or published with the app
        under /game-builds. The packages/game-sdk README walks through exporting.
      </p>
      <div className={styles.list}>
        {data.games.map((game) => {
          const history = releasesFor(game.id);
          return (
            <div key={game.id} className={styles.gameRow}>
              <div className={styles.personMain}>
                <div className="row gap-2 wrap">
                  <strong>{game.title}</strong>
                  {game.build ? <Chip tone="teal">Live · {game.build.version}</Chip> : <Chip tone="slate" outline>Coming soon</Chip>}
                  <span className={styles.personMeta}>{game.transport === 'none' ? 'Offline' : game.transport}</span>
                </div>
                {game.build && <span className={styles.personMeta}>{game.build.assetBase}{game.build.threads ? ' · threads' : ''}</span>}
                {history.length > 0 && (
                  <ul className={styles.releases}>
                    {history.slice(0, 4).map((r) => (
                      <li key={r._id}>
                        <span className={r.active ? undefined : styles.inactive}>
                          {r.version} · {formatDateTime(r.createdAt)}
                          {r.publishedBy ? ` · ${r.publishedBy}` : ''}
                          {r.notes ? ` · ${r.notes}` : ''}
                        </span>
                        <button type="button" className={styles.linkButton} onClick={() => void toggle(r)}>
                          {r.active ? <><Undo2 size={13} /> Roll back</> : 'Re-activate'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => setPublishing(game)}>
                Publish
              </Button>
            </div>
          );
        })}
      </div>
      {data.games.length === 0 && <EmptyState title="No games in the catalog" />}
      {publishing && <PublishDialog game={publishing} onClose={() => setPublishing(null)} onDone={() => { setPublishing(null); refetch(); }} />}
      {dialog}
    </div>
  );
}

function PublishDialog({ game, onClose, onDone }: { game: GameRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [version, setVersion] = useState('');
  const [assetBase, setAssetBase] = useState('');
  const [entry, setEntry] = useState('index.html');
  const [threads, setThreads] = useState(false);
  const [sizeMb, setSizeMb] = useState('');
  const [transport, setTransport] = useState(game.transport);
  const [serverPack, setServerPack] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const publish = async () => {
    setSaving(true);
    try {
      await api.post('/api/admin/games', {
        game: game.id,
        version,
        assetBase,
        entry,
        threads,
        sizeMb: Number(sizeMb) || 0,
        transport,
        ...(serverPack ? { serverPack } : {}),
        notes,
      });
      toast.success(`${game.title} ${version} is live`, 'Players get it within seconds.');
      onDone();
    } catch (caught) {
      toast.error('Not published', errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`Publish ${game.title}`}
      description="Checked against the game manifest before it goes live, so a bad build is refused here rather than breaking the catalog."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={<Rocket size={15} />} loading={saving} disabled={!version.trim() || !assetBase.trim()} onClick={publish}>
            Publish
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <div className={styles.grid2}>
          <Input label="Version" placeholder="1.2.0" value={version} maxLength={32} onChange={(e) => setVersion(e.target.value)} />
          <Input label="Entry file" value={entry} onChange={(e) => setEntry(e.target.value)} />
        </div>
        <Input label="Build folder" placeholder="https://cdn.example.com/ludo/1.2.0" hint="An https:// folder, or /game-builds/<game>/<version> on this site." value={assetBase} onChange={(e) => setAssetBase(e.target.value)} />
        <div className={styles.grid2}>
          <Select
            label="Networking"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            options={[
              { value: 'none', label: 'None (offline, bot, pass-and-play)' },
              { value: 'webrtc', label: 'WebRTC (Godot peer-to-peer)' },
              { value: 'relay', label: 'Relay (WebSocket through us)' },
              { value: 'dedicated', label: 'Dedicated server' },
            ]}
          />
          <Input label="Download size (MB)" type="number" min={0} value={sizeMb} onChange={(e) => setSizeMb(e.target.value)} hint="Shown as a warning on mobile data." />
        </div>
        {transport === 'dedicated' && <Input label="Server pack" placeholder="ludo/1.2.0/server.pck" hint="Relative to the realtime service's game-servers folder." value={serverPack} onChange={(e) => setServerPack(e.target.value)} />}
        <Switch checked={threads} onChange={setThreads} label="Threaded export" hint="Needs cross-origin isolation; the CDN must send CORP and COEP headers." />
        <Textarea label="Release notes" optional rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
