extends Node
## MBA Antisocial SDK — autoload "Antisocial".
##
## Connects a Godot 4 game to the MBA Antisocial player page. It covers
## identity, rooms, networking and results. Typical use:
##
##   func _ready():
##       Antisocial.initialized.connect(_on_init)
##
##   func _on_init(init: Dictionary):
##       match init.mode:
##           "online", "tournament":
##               Antisocial.multiplayer_ready.connect(_start_online)
##               Antisocial.connect_multiplayer()
##           "bot":   _start_vs_bot(init.bot.difficulty)
##           "local": _start_pass_and_play()
##
##   # when the game ends (every seated player must appear; placement 1 wins):
##   Antisocial.report_result([{ "playerId": id_a, "placement": 1 }, { "playerId": id_b, "placement": 2 }], "Checkmate in 34")
##
## Networking (the platform picks one per game in its manifest):
##  - "webrtc": `connect_multiplayer()` sets `multiplayer.multiplayer_peer` to
##    a WebRTCMultiplayerPeer mesh. The host is peer 1 and seat n is n + 2, so
##    the usual "server is 1" RPC patterns work unchanged.
##  - "dedicated": the same call sets a WebSocketMultiplayerPeer client that
##    reaches the room's headless server. The SDK authenticates you to it.
##  - "relay": `connect_multiplayer()` opens a room relay. Use `send_relay()`
##    and the `relay_*` signals; nothing is set on `multiplayer`.
##
## Outside the browser (editor or desktop runs) a pass-and-play init is
## emitted, or pass `--antisocial-init=<json>` on the command line to test any init.

signal initialized(init: Dictionary)
signal paused
signal resumed
signal mute_changed(muted: bool)
signal theme_changed(theme: String)
signal player_joined(player: Dictionary)
signal player_left(player_id: String)

signal multiplayer_ready
signal multiplayer_failed(reason: String)

signal relay_opened(hello: Dictionary)
signal relay_message(from_peer: int, data: String)
signal relay_binary(from_peer: int, bytes: PackedByteArray)
signal relay_peer_joined(peer: Dictionary)
signal relay_peer_left(peer_id: int)
signal relay_closed

## Dedicated servers only: a client proved who it is.
signal player_authenticated(peer_id: int, player: Dictionary)

const PROTOCOL := 1
const SDK_VERSION := "godot/1.0.0"
const NS := "antisocial"

enum Sig { JOIN, ID, PEER_CONNECT, PEER_DISCONNECT, OFFER, ANSWER, CANDIDATE, SEAL }

var init: Dictionary = {}
var is_initialized := false

var _window = null # JavaScriptObject on web
var _json = null
var _message_callback = null
var _host_origin := "*"

var _signaling := WebSocketPeer.new()
var _signaling_open := false
var _rtc: WebRTCMultiplayerPeer
var _relay := WebSocketPeer.new()
var _relay_state := WebSocketPeer.STATE_CLOSED
var _relay_active := false
var _reconnect_attempts := 0

## Dedicated server state.
var server_args: Dictionary = {}
var authenticated_players: Dictionary = {} # peer_id -> { userId, name, seat, host }


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	server_args = _parse_server_args()
	if is_dedicated_server():
		return
	if OS.has_feature("web"):
		_install_web_bridge()
		ready_to_start()
	else:
		_emit_local_init.call_deferred()


func _process(_delta: float) -> void:
	_poll_signaling()
	_poll_relay()


# ───────────────────────── Host bridge ─────────────────────────

func _install_web_bridge() -> void:
	_window = JavaScriptBridge.get_interface("window")
	_json = JavaScriptBridge.get_interface("JSON")
	var hash_text: String = str(JavaScriptBridge.eval("window.location.hash || ''", true))
	var marker := hash_text.find("host=")
	if marker != -1:
		_host_origin = hash_text.substr(marker + 5).split("&")[0].uri_decode()
	_message_callback = JavaScriptBridge.create_callback(_on_js_message)
	_window.addEventListener("message", _message_callback)


func _on_js_message(args: Array) -> void:
	var event = args[0]
	if _host_origin != "*" and str(event.origin) != _host_origin:
		return
	var parsed = JSON.parse_string(str(_json.stringify(event.data)))
	if typeof(parsed) != TYPE_DICTIONARY or parsed.get("ns") != NS:
		return
	var payload = parsed.get("payload", {})
	match parsed.get("type"):
		"init":
			init = payload
			is_initialized = true
			initialized.emit(init)
		"pause": paused.emit()
		"resume": resumed.emit()
		"mute": mute_changed.emit(bool(payload.get("muted", false)))
		"theme": theme_changed.emit(str(payload.get("theme", "light")))
		"player_joined": player_joined.emit(payload)
		"player_left": player_left.emit(str(payload.get("playerId", "")))


func _post(type: String, payload: Variant = null) -> void:
	if not OS.has_feature("web"):
		if type == "result":
			print("[Antisocial] result: ", payload)
		return
	var message := { "ns": NS, "type": type }
	if payload != null:
		message["payload"] = payload
	JavaScriptBridge.eval("window.parent.postMessage(%s, %s)" % [JSON.stringify(message), JSON.stringify(_host_origin)], true)


func _emit_local_init() -> void:
	for argument in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if argument.begins_with("--antisocial-init="):
			var custom = JSON.parse_string(argument.substr(18))
			if typeof(custom) == TYPE_DICTIONARY:
				init = custom
				is_initialized = true
				initialized.emit(init)
				return
	init = {
		"protocol": PROTOCOL, "gameId": "local", "mode": "local",
		"player": { "id": "local-1", "name": "Player 1", "avatar": "", "rating": null, "seat": 0 },
		"room": null,
		"network": { "transport": "none", "url": null, "ticket": null, "iceServers": [], "expectedPeerId": null },
		"bot": null,
		"environment": { "platform": "web", "locale": "en-IN", "theme": "light", "reducedMotion": false, "muted": false },
	}
	is_initialized = true
	initialized.emit(init)


## Tells the player page the game can receive `init`. Called automatically on web.
func ready_to_start() -> void:
	_post("ready", { "protocol": PROTOCOL, "sdk": SDK_VERSION })

## The match has actually begun (after a countdown, say).
func started() -> void:
	_post("started")

## One line shown by the player page, e.g. "Your turn".
func status(text: String) -> void:
	_post("status", { "text": text.left(120) })

## Final standings. Every seated player once; placement 1 wins; equal placements tie.
## For bot and pass-and-play games this is recorded but never rated.
func report_result(standings: Array, summary: String = "", duration_seconds: int = -1) -> void:
	var result := { "standings": standings }
	if summary != "":
		result["summary"] = summary.left(200)
	if duration_seconds >= 0:
		result["durationSeconds"] = duration_seconds
	_post("result", result)

func achievement(key: String, label: String) -> void:
	_post("achievement", { "key": key, "label": label })

func haptic(style: String = "light") -> void:
	_post("haptic", { "style": style })

## Opens the platform's invite sheet for this table.
func invite() -> void:
	_post("invite")

## Asks the player page to leave the game.
func exit_game() -> void:
	_post("exit")


# ───────────────────────── Convenience getters ─────────────────────────

func mode() -> String:
	return str(init.get("mode", "local"))

func me() -> Dictionary:
	return init.get("player", {})

func players() -> Array:
	var room = init.get("room")
	return room.get("players", []) if typeof(room) == TYPE_DICTIONARY else []

func is_host() -> bool:
	var room = init.get("room")
	return typeof(room) == TYPE_DICTIONARY and str(room.get("hostId", "")) == str(me().get("id", ""))

func is_spectating() -> bool:
	var room = init.get("room")
	return typeof(room) == TYPE_DICTIONARY and bool(room.get("spectating", false))

## Players by peer id for WebRTC/dedicated games (host = 1, seat n = n + 2).
func player_for_peer(peer_id: int) -> Dictionary:
	var room = init.get("room", {})
	for player in players():
		if player.get("seat") == null:
			continue
		var pid: int = 1 if str(player.get("id")) == str(room.get("hostId")) else int(player.get("seat")) + 2
		if pid == peer_id:
			return player
	return {}


# ───────────────────────── Networking ─────────────────────────

## Connects using the transport chosen for this game. Emits `multiplayer_ready`
## (or `relay_opened` for relay games) when usable, `multiplayer_failed` otherwise.
func connect_multiplayer() -> Error:
	var network: Dictionary = init.get("network", {})
	var transport := str(network.get("transport", "none"))
	if network.get("url") == null or network.get("ticket") == null:
		multiplayer_failed.emit("No network for this session.")
		return ERR_UNAVAILABLE
	var url := "%s?ticket=%s" % [network.url, str(network.ticket).uri_encode()]
	match transport:
		"webrtc":
			return _connect_webrtc(url)
		"relay":
			_relay_active = true
			return _relay.connect_to_url(url)
		"dedicated":
			var peer := WebSocketMultiplayerPeer.new()
			var err := peer.create_client(url)
			if err != OK:
				multiplayer_failed.emit("Could not reach the game server.")
				return err
			multiplayer.multiplayer_peer = peer
			if not multiplayer.connected_to_server.is_connected(_on_dedicated_connected):
				multiplayer.connected_to_server.connect(_on_dedicated_connected)
				multiplayer.connection_failed.connect(func(): multiplayer_failed.emit("Could not reach the game server."))
			return OK
	multiplayer_failed.emit("Unknown transport %s." % transport)
	return ERR_INVALID_PARAMETER


func _on_dedicated_connected() -> void:
	# Prove who we are to the server; it checks the ticket with the platform.
	_antisocial_auth.rpc_id(1, str(init.network.ticket))
	multiplayer_ready.emit()


func disconnect_multiplayer() -> void:
	_signaling_open = false
	_signaling.close()
	_relay_active = false
	_relay.close()
	if _rtc:
		_rtc.close()
		_rtc = null
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()


## Relay: send text to every other seat, or to one peer.
func send_relay(data: String, to_peer: int = -1) -> void:
	if _relay.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	if to_peer < 0:
		_relay.send_text(data)
	else:
		_relay.send_text(JSON.stringify({ "to": to_peer, "data": data }))

func send_relay_bytes(bytes: PackedByteArray) -> void:
	if _relay.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_relay.put_packet(bytes)


func _poll_relay() -> void:
	if not _relay_active:
		return
	_relay.poll()
	var state := _relay.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		while _relay.get_available_packet_count() > 0:
			var packet := _relay.get_packet()
			if not _relay.was_string_packet():
				var sender := packet.decode_u32(0) if packet.size() >= 4 else 0
				# Big-endian on the wire.
				sender = ((sender & 0xFF) << 24) | ((sender & 0xFF00) << 8) | ((sender >> 8) & 0xFF00) | ((sender >> 24) & 0xFF)
				relay_binary.emit(sender, packet.slice(4))
				continue
			var msg = JSON.parse_string(packet.get_string_from_utf8())
			if typeof(msg) != TYPE_DICTIONARY:
				continue
			match msg.get("type"):
				"relay_hello":
					_reconnect_attempts = 0
					relay_opened.emit(msg)
				"relay_msg": relay_message.emit(int(msg.get("from", 0)), str(msg.get("data", "")))
				"relay_peer_joined": relay_peer_joined.emit(msg)
				"relay_peer_left": relay_peer_left.emit(int(msg.get("peer", 0)))
	elif state == WebSocketPeer.STATE_CLOSED and _relay_state != WebSocketPeer.STATE_CLOSED:
		relay_closed.emit()
		_reconnect_relay()
	_relay_state = state


func _reconnect_relay() -> void:
	_reconnect_attempts += 1
	if _reconnect_attempts > 6:
		_relay_active = false
		multiplayer_failed.emit("Lost connection to the table.")
		return
	await get_tree().create_timer(min(8.0, 0.5 * pow(2, _reconnect_attempts))).timeout
	if _relay_active:
		_relay.connect_to_url("%s?ticket=%s" % [init.network.url, str(init.network.ticket).uri_encode()])


# WebRTC signaling — the protocol of Godot's official webrtc_signaling demo.

func _connect_webrtc(url: String) -> Error:
	_rtc = WebRTCMultiplayerPeer.new()
	var err := _signaling.connect_to_url(url)
	if err != OK:
		multiplayer_failed.emit("Could not reach the signaling server.")
	return err


func _send_signal(type: int, id: int, data: String = "") -> void:
	_signaling.send_text(JSON.stringify({ "type": type, "id": id, "data": data }))


func _poll_signaling() -> void:
	if _rtc == null:
		return
	_signaling.poll()
	var state := _signaling.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN and not _signaling_open:
		_signaling_open = true
		_send_signal(Sig.JOIN, 0, "") # 0 = mesh
	elif state == WebSocketPeer.STATE_CLOSED and _signaling_open:
		_signaling_open = false
	while state == WebSocketPeer.STATE_OPEN and _signaling.get_available_packet_count() > 0:
		var msg = JSON.parse_string(_signaling.get_packet().get_string_from_utf8())
		if typeof(msg) != TYPE_DICTIONARY:
			continue
		var type := int(msg.get("type", -1))
		var id := int(msg.get("id", 0))
		var data := str(msg.get("data", ""))
		match type:
			Sig.ID:
				_rtc.create_mesh(id)
				multiplayer.multiplayer_peer = _rtc
				multiplayer_ready.emit()
			Sig.PEER_CONNECT:
				_create_rtc_peer(id)
			Sig.PEER_DISCONNECT:
				if _rtc.has_peer(id):
					_rtc.remove_peer(id)
			Sig.OFFER:
				if _rtc.has_peer(id):
					_rtc.get_peer(id).connection.set_remote_description("offer", data)
			Sig.ANSWER:
				if _rtc.has_peer(id):
					_rtc.get_peer(id).connection.set_remote_description("answer", data)
			Sig.CANDIDATE:
				var parts := data.split("\n", false)
				if parts.size() == 3 and _rtc.has_peer(id):
					_rtc.get_peer(id).connection.add_ice_candidate(parts[0], int(parts[1]), parts[2])


func _create_rtc_peer(id: int) -> void:
	var peer := WebRTCPeerConnection.new()
	peer.initialize({ "iceServers": init.network.get("iceServers", []) })
	peer.session_description_created.connect(func(kind: String, sdp: String):
		peer.set_local_description(kind, sdp)
		_send_signal(Sig.OFFER if kind == "offer" else Sig.ANSWER, id, sdp))
	peer.ice_candidate_created.connect(func(media: String, index: int, candidate: String):
		_send_signal(Sig.CANDIDATE, id, "%s\n%d\n%s" % [media, index, candidate]))
	_rtc.add_peer(peer, id)
	# The lower id makes the offer, so exactly one side does.
	if id < _rtc.get_unique_id():
		peer.create_offer()


# ───────────────────────── Dedicated server ─────────────────────────

func _parse_server_args() -> Dictionary:
	var out := {}
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--") and argument.contains("="):
			var kv := argument.substr(2).split("=", true, 1)
			out[kv[0]] = kv[1]
	return out

## True when launched by the platform as a headless room server.
func is_dedicated_server() -> bool:
	return server_args.has("port") and server_args.has("server-token")

## Starts listening for the platform's proxy. Call from your server scene.
func start_dedicated_server() -> Error:
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_server(int(server_args.get("port", "0")), "127.0.0.1")
	if err != OK:
		push_error("[Antisocial] could not start server: %s" % err)
		return err
	multiplayer.multiplayer_peer = peer
	multiplayer.peer_disconnected.connect(func(id: int): authenticated_players.erase(id))
	return OK

func max_players() -> int:
	return int(server_args.get("max-players", "8"))


@rpc("any_peer", "call_remote", "reliable")
func _antisocial_auth(ticket: String) -> void:
	if not multiplayer.is_server():
		return
	var peer_id := multiplayer.get_remote_sender_id()
	var verified := await verify_ticket(ticket)
	if verified.get("valid", false):
		authenticated_players[peer_id] = verified
		player_authenticated.emit(peer_id, verified)
	else:
		multiplayer.multiplayer_peer.disconnect_peer(peer_id)


## Checks a client's ticket with the platform. Returns { valid, userId, name, seat, host }.
func verify_ticket(ticket: String) -> Dictionary:
	var response = await _server_post(str(server_args.get("verify-url", "")), { "ticket": ticket })
	return response if typeof(response) == TYPE_DICTIONARY else { "valid": false }


## The authoritative result for a dedicated-server game. Use player ids from
## `authenticated_players` (and "bot-<seat>" for bots).
func server_report_result(standings: Array, summary: String = "", duration_seconds: int = -1) -> bool:
	var result := { "standings": standings }
	if summary != "":
		result["summary"] = summary.left(200)
	if duration_seconds >= 0:
		result["durationSeconds"] = duration_seconds
	var response = await _server_post(str(server_args.get("report-url", "")), { "roomId": str(server_args.get("room", "")), "result": result })
	return typeof(response) == TYPE_DICTIONARY and response.has("status")


func _server_post(url: String, body: Dictionary) -> Variant:
	if url == "":
		return null
	var request := HTTPRequest.new()
	add_child(request)
	var headers := ["Content-Type: application/json", "Authorization: Bearer %s" % server_args.get("server-token", "")]
	var err := request.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		request.queue_free()
		return null
	var reply: Array = await request.request_completed
	request.queue_free()
	if reply[1] < 200 or reply[1] >= 300:
		return null
	return JSON.parse_string((reply[3] as PackedByteArray).get_string_from_utf8())
