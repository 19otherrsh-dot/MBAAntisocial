# MBA Antisocial game SDK

This SDK connects a game to the MBA Antisocial player page. It works for Godot 4 web exports and for plain HTML/JS games.

The platform handles:
- lobbies, invites and matchmaking;
- spectators and tournaments;
- ratings and points;
- the network itself.

Your game handles three things:
1. Read the `init` payload: who is playing, in what mode, and at which seat.
2. Connect with the transport the platform picked.
3. Report the final standings.

```
packages/game-sdk/
├── godot/addons/antisocial_sdk/   ← Godot 4 addon (autoload "Antisocial")
├── antisocial-sdk.js              ← the same protocol for plain-JS games
└── examples/tic-tac-toe/          ← reference game, published with the platform
```

## 1. Add the addon (Godot 4.2+)

1. Copy `godot/addons/antisocial_sdk` into your project's `addons/` folder.
2. Go to **Project → Project Settings → Plugins** and enable **MBA Antisocial SDK**. This registers the `Antisocial` autoload.
3. Handle `init`:

```gdscript
func _ready():
    Antisocial.initialized.connect(_on_init)

func _on_init(init: Dictionary):
    match init.mode:
        "online", "tournament":
            Antisocial.multiplayer_ready.connect(_start_online)
            Antisocial.multiplayer_failed.connect(func(reason): $Error.text = reason)
            Antisocial.connect_multiplayer()
        "bot":
            _start_vs_bot(init.bot.difficulty)   # "easy" | "medium" | "hard"
        "local":
            _start_pass_and_play()
```

4. When the game ends, report every seated player once. Placement 1 wins, and equal placements are a tie. Bots appear as `"bot-<seat>"`:

```gdscript
Antisocial.report_result([
    { "playerId": winner_id, "placement": 1 },
    { "playerId": loser_id,  "placement": 2 },
], "Checkmate in 34 moves")
```

Each client reports, and the platform accepts the standings that a majority of the seated players agree on. Mismatched reports never move a rating. Bot and pass-and-play results are recorded and earn completion points, but they are never rated.

### Other calls

| Call | What it does |
|---|---|
| `Antisocial.started()` | Hides the platform's loading overlay. Call it after your splash or countdown. |
| `Antisocial.status("Your turn")` | Shows a single line in the player's top bar. |
| `Antisocial.haptic("light"/"medium"/"heavy")` | Vibrates the device on phones. |
| `Antisocial.invite()` | Copies an invite link to the table. |
| `Antisocial.exit_game()` | Leaves the game. |
| `Antisocial.achievement(key, label)` | Shows a toast in the player. |
| `Antisocial.me()`, `players()`, `is_host()`, `is_spectating()`, `player_for_peer(id)` | Convenience getters over `init`. |

The addon also emits these signals:
- `paused`, `resumed` (the tab was hidden, then shown again);
- `mute_changed(muted)`, `theme_changed("light"|"dark")`;
- `player_left(player_id)`. When a player leaves mid-game, the platform counts it as a resignation.

## 2. Networking

The transport is set per game in `apps/web/src/server/modules/games/catalog.ts`. Your game never configures servers itself.

| Transport | Use it for | What `connect_multiplayer()` does |
|---|---|---|
| `webrtc` | Turn-based and casual real-time games (board games) | Sets `multiplayer.multiplayer_peer` to a WebRTC mesh. The host is peer **1**, and seat *n* is peer **n + 2**, so "server is 1" RPC code works unchanged. The signaling server speaks the protocol of Godot's official `webrtc_signaling` demo. |
| `relay` | Hidden information (cards, fleets), or games with their own protocol | Opens a room relay. Use `Antisocial.send_relay(text, to_peer = -1)` / `send_relay_bytes()` with the `relay_opened`, `relay_message(from, data)`, `relay_peer_joined` and `relay_peer_left` signals. |
| `dedicated` | Authoritative real-time games (markets, physics) | Connects a `WebSocketMultiplayerPeer` to the room's headless server and authenticates you to it. |

### Dedicated servers

Export a second, headless build of your game as a `.pck`. The realtime service launches one process per room:

```
godot --headless --main-pack server.pck -- --port=… --room=… --max-players=… --report-url=… --verify-url=… --server-token=…
```

In your server scene:

```gdscript
func _ready():
    if Antisocial.is_dedicated_server():
        Antisocial.start_dedicated_server()
        Antisocial.player_authenticated.connect(func(peer_id, player): seat(peer_id, player.userId, player.seat))

# when the match ends — trusted as-is, no consensus needed:
await Antisocial.server_report_result(standings, "Market closed at 3,412")
```

The process listens only on `127.0.0.1`. Players reach it through the realtime service's authenticated proxy, so the server never needs a public port.

## 3. Export settings

- **Export template:** Web. Single-threaded builds are recommended: turn off *Thread Support*. Single-threaded builds run in every browser and inside the iOS and Android app's WebView without cross-origin isolation. Threaded builds also work, because `/player` and `/game-builds` are served cross-origin isolated, but they need a browser with `SharedArrayBuffer`.
- **Orientation:** set `orientation` in the catalog entry (`landscape`, `portrait` or `any`). The player locks the screen orientation in full screen on phones and shows a rotate hint.
- **Size:** keep exports small. The player warns before downloading anything over 25 MB on mobile data.

## 4. Publish

```bash
npm run publish-game -w @mba/web -- --id ludo --dir ~/exports/ludo --version 1.0.0
# dedicated-server game:
npm run publish-game -w @mba/web -- --id market-maker --dir ~/exports/mm-web --server-pack ~/exports/mm-server.pck --version 1.0.0
# already on a CDN:
npm run publish-game -w @mba/web -- --id chess --cdn https://cdn.example.com/chess/1.2.0 --version 1.2.0
```

The script does three things:
1. Validates the manifest.
2. Copies the build to `apps/web/public/game-builds/<id>/<version>/`.
3. Records it in `published.json`.

Commit both and deploy. Server packs go to `game-servers/`, which is never public.

To make a CDN build live without a redeploy, publish it from **Admin → Games** instead.

## 5. Plain-JS games

Load `antisocial-sdk.js` and use the same calls in camelCase:

```html
<script src="antisocial-sdk.js"></script>
<script>
  const sdk = AntisocialSDK.create({ sdk: 'my-game/1.0' });
  sdk.on('init', (init) => { /* … */ });
  sdk.ready();
  // relay: const conn = sdk.connectRelay(); conn.on('message', ({ from, data }) => …); conn.send('…');
  // end:   sdk.reportResult({ standings: [...], summary: '…' });
</script>
```

`examples/tic-tac-toe` is a complete example covering online play, vs-bot, pass-and-play, spectators and reconnects.

## Protocol reference

All messages are `postMessage` with `{ ns: "antisocial", type, payload }`, version 1. The full types live in `packages/shared/src/games.ts` (`BridgeInit`, `HostToGame`, `GameToHost`, `GameResult`).

To test locally, open a build directly in a browser. Outside the player page, the SDK emits a pass-and-play `init`. In the Godot editor, the addon does the same; pass `--antisocial-init='<json>'` to simulate any init.
