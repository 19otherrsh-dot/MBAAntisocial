/*!
 * MBA Antisocial game SDK (plain JS) — protocol v1.
 *
 * Drop this file next to a web game's index.html and load it with a <script>
 * tag; it defines `window.AntisocialSDK`. Godot games use the GDScript addon in
 * ./godot instead, which speaks the same protocol through JavaScriptBridge.
 *
 *   const sdk = AntisocialSDK.create({ sdk: 'my-game/1.0' });
 *   sdk.on('init', (init) => start(init));
 *   sdk.ready();
 *
 * Opened directly (not inside the player page) the SDK fakes a pass-and-play
 * init after a moment, so a build can be tried with a static file server.
 */
(function (global) {
  'use strict';

  var NS = 'antisocial';
  var PROTOCOL = 1;

  function hostOrigin() {
    var match = /[#&]host=([^&]+)/.exec(global.location.hash || '');
    return match ? decodeURIComponent(match[1]) : null;
  }

  function create(options) {
    options = options || {};
    var listeners = {};
    var origin = hostOrigin();
    var embedded = global.parent && global.parent !== global;
    var initPayload = null;

    function emit(type, payload) {
      (listeners[type] || []).slice().forEach(function (fn) {
        try {
          fn(payload);
        } catch (error) {
          console.error('[antisocial-sdk] listener failed', error);
        }
      });
    }

    function post(type, payload) {
      if (!embedded) return;
      var message = { ns: NS, type: type };
      if (payload !== undefined) message.payload = payload;
      global.parent.postMessage(message, origin || '*');
    }

    global.addEventListener('message', function (event) {
      if (origin && event.origin !== origin) return;
      if (event.source !== global.parent) return;
      var data = event.data;
      if (!data || data.ns !== NS || typeof data.type !== 'string') return;
      if (data.type === 'init') initPayload = data.payload;
      emit(data.type, data.payload);
    });

    var sdk = {
      protocol: PROTOCOL,
      get init() {
        return initPayload;
      },
      on: function (type, fn) {
        (listeners[type] = listeners[type] || []).push(fn);
        if (type === 'init' && initPayload) fn(initPayload);
        return function () {
          listeners[type] = (listeners[type] || []).filter(function (f) {
            return f !== fn;
          });
        };
      },
      /** Call once the game can receive `init`. */
      ready: function () {
        post('ready', { protocol: PROTOCOL, sdk: options.sdk || 'js' });
        if (!embedded) {
          setTimeout(function () {
            initPayload = {
              protocol: PROTOCOL,
              gameId: options.gameId || 'local',
              mode: 'local',
              player: { id: 'local-1', name: 'Player 1', avatar: '', rating: null, seat: 0 },
              room: null,
              network: { transport: 'none', url: null, ticket: null, iceServers: [], expectedPeerId: null },
              bot: null,
              environment: { platform: 'web', locale: 'en-IN', theme: 'light', reducedMotion: false, muted: false },
            };
            emit('init', initPayload);
          }, 50);
        }
      },
      started: function () {
        post('started');
      },
      status: function (text) {
        post('status', { text: String(text).slice(0, 120) });
      },
      /**
       * Final standings: [{ playerId, placement, score? }], placement 1 wins,
       * equal placements tie. Every seated player must appear.
       */
      reportResult: function (result) {
        post('result', result);
      },
      achievement: function (key, label) {
        post('achievement', { key: key, label: label });
      },
      haptic: function (style) {
        post('haptic', { style: style || 'light' });
      },
      invite: function () {
        post('invite');
      },
      exit: function () {
        post('exit');
      },
      log: function (level, message) {
        post('log', { level: level, message: String(message).slice(0, 500) });
      },

      /**
       * Relay transport: every text message goes to the other seats (or one
       * peer with `to`). Returns a connection with `send`, `close`, and events
       * `open(hello)`, `message({from, data})`, `binary({from, bytes})`,
       * `peer_joined`, `peer_left`, `close`.
       */
      connectRelay: function () {
        if (!initPayload || !initPayload.network || initPayload.network.transport !== 'relay' || !initPayload.network.url) {
          throw new Error('This session has no relay transport.');
        }
        var url = initPayload.network.url + '?ticket=' + encodeURIComponent(initPayload.network.ticket);
        var relayListeners = {};
        var socket = null;
        var closedByUs = false;
        var attempts = 0;

        function relayEmit(type, payload) {
          (relayListeners[type] || []).forEach(function (fn) {
            fn(payload);
          });
        }

        function open() {
          socket = new WebSocket(url);
          socket.binaryType = 'arraybuffer';
          socket.onmessage = function (event) {
            if (typeof event.data !== 'string') {
              var view = new DataView(event.data);
              relayEmit('binary', { from: view.getUint32(0), bytes: new Uint8Array(event.data, 4) });
              return;
            }
            var msg;
            try {
              msg = JSON.parse(event.data);
            } catch (e) {
              return;
            }
            if (msg.type === 'relay_hello') {
              attempts = 0;
              relayEmit('open', msg);
            } else if (msg.type === 'relay_msg') relayEmit('message', { from: msg.from, data: msg.data });
            else if (msg.type === 'relay_peer_joined') relayEmit('peer_joined', msg);
            else if (msg.type === 'relay_peer_left') relayEmit('peer_left', msg);
          };
          socket.onclose = function () {
            if (closedByUs) return relayEmit('close', { final: true });
            relayEmit('close', { final: false });
            // Reconnect with backoff; the ticket stays valid for the session.
            attempts += 1;
            if (attempts <= 6) setTimeout(open, Math.min(8000, 500 * Math.pow(2, attempts)));
          };
        }
        open();

        return {
          on: function (type, fn) {
            (relayListeners[type] = relayListeners[type] || []).push(fn);
          },
          send: function (data, to) {
            if (!socket || socket.readyState !== 1) return false;
            if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) socket.send(data);
            else socket.send(to === undefined ? String(data) : JSON.stringify({ to: to, data: String(data) }));
            return true;
          },
          close: function () {
            closedByUs = true;
            if (socket) socket.close();
          },
        };
      },
    };
    return sdk;
  }

  global.AntisocialSDK = { create: create, PROTOCOL: PROTOCOL };
})(typeof window !== 'undefined' ? window : this);
