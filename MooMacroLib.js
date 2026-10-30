
/* MooMacroLib.js — read-only API connection test v0.3.0
 * Uses the existing moomoo.js:api handshake.
 * No game actions are sent.
 * This is an adapter, not a standalone network connector.
 */
(() => {
  'use strict';

  const VERSION = '0.3.0';
  const API_EVENT = 'moomoo.js:api';
  let game = null, loader = null, busy = false, errorText = '';
  let lastEvent = 'No live events received yet.';
  const unsubs = [];
  let statusEl, reportEl, connectBtn, copyBtn;

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safe = (fn, fallback = null) => {
    try { return fn(); } catch (_) { return fallback; }
  };

  function state() {
    if (!game) return { apiFound: false, ready: false };

    const me = safe(() => game.self, {}) || {};
    const transport = loader
      ? safe(() => loader.active(), null)
      : null;

    return {
      apiFound: true,
      ready: safe(() => game.isReady() === true, false),
      transportReady: !!(transport && transport.ready),
      transportFailed: !!(transport && transport.failed),
      alive: typeof me.alive === 'boolean' ? me.alive : null,
      sid: Number.isFinite(me.sid) && me.sid >= 0 ? me.sid : null,
      health: Number.isFinite(me.health) ? me.health : null,
      items: Array.isArray(me.items) ? me.items.slice() : [],
      weapons: Array.isArray(me.weapons) ? me.weapons.slice() : [],
      weaponIndex: Number.isFinite(me.weaponIndex) ? me.weaponIndex : null
    };
  }

  function report() {
    const s = state();

    return [
      'MOO MACRO — API CONNECTION TEST',
      'Library: ' + VERSION,
      'API found: ' + !!s.apiFound,
      'Runtime ready: ' + !!s.ready,
      'Transport ready: ' + (s.transportReady ?? 'unknown'),
      'Transport failed: ' + (s.transportFailed ?? 'unknown'),
      'Alive: ' + (s.alive ?? 'unknown'),
      'Player SID: ' + (s.sid ?? 'unknown'),
      'Health: ' + (s.health ?? 'unknown'),
      'Food/items: ' + JSON.stringify(s.items || []),
      'Weapons: ' + JSON.stringify(s.weapons || []),
      'Weapon index: ' + (s.weaponIndex ?? 'unknown'),
      'Last event: ' + lastEvent,
      'Connection error: ' + (errorText || 'none'),
      'Game actions sent: NO'
    ].join('\n');
  }

  function render() {
    if (!statusEl || !reportEl) return;

    const s = state();

    statusEl.textContent = busy
      ? 'Checking connection…'
      : !s.apiFound
        ? 'API NOT FOUND'
        : s.ready
          ? 'API CONNECTED · GAME READY'
          : 'API FOUND · WAITING FOR GAME';

    reportEl.textContent = report();
    connectBtn.disabled = busy;
    copyBtn.disabled = !s.apiFound;
  }

  function update(message) {
    if (message) lastEvent = message;
    render();
  }

  function validApi(api, apiLoader) {
    return !!api &&
      !!api.self &&
      typeof api.on === 'function' &&
      typeof api.onReady === 'function' &&
      typeof api.isReady === 'function' &&
      !!apiLoader &&
      typeof apiLoader.active === 'function';
  }

  function requestApi(timeout = 500) {
    return new Promise((resolve, reject) => {
      let done = false;

      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error('No response to moomoo.js:api.'));
        }
      }, timeout);

      const detail = {
        resolve(api, apiLoader) {
          if (done) return;

          done = true;
          clearTimeout(timer);

          if (!validApi(api, apiLoader)) {
            reject(new Error(
              'API replied, but required read-only methods were missing.'
            ));
          } else {
            resolve({ api, apiLoader });
          }
        }
      };

      try {
        window.dispatchEvent(
          new window.CustomEvent(API_EVENT, { detail })
        );
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  function listen() {
    unsubs.splice(0).forEach(fn => safe(fn));

    unsubs.push(game.on('health', event => {
      if (event && event.sid === game.self.sid) {
        update('Your health changed: ' + event.value);
      }
    }));

    unsubs.push(game.on('inventory', event => {
      update(
        'Inventory updated: ' +
        (event && event.isWeapon ? 'weapons' : 'food/items')
      );
    }));

    unsubs.push(game.on('died', () => {
      update('Player death event received.');
    }));

    game.onReady(() => {
      update('Game runtime reports ready.');
    });
  }

  async function connect() {
    if (game) {
      update('Existing API connection checked.');
      return state();
    }

    if (busy) {
      throw new Error('Connection check is already running.');
    }

    busy = true;
    errorText = '';
    update('Looking for the existing MooMoo.js API…');

    try {
      let found = null;
      let lastError = null;

      // Retry briefly in case the loader starts after this library.
      for (let i = 0; i < 10; i++) {
        try {
          found = await requestApi(450);
          break;
        } catch (e) {
          lastError = e;
          if (i < 9) await delay(250);
        }
      }

      if (!found) {
        throw lastError || new Error('MooMoo.js API was not found.');
      }

      game = found.api;
      loader = found.apiLoader;

      listen();
      update('Read-only API connection established.');

      return state();

    } catch (e) {
      errorText = e && e.message ? e.message : String(e);
      update('Connection failed.');
      throw e;

    } finally {
      busy = false;
      render();
    }
  }

  function attachLogs() {
    const host = document.getElementById('moo-macro-root');
    const shadow = host && host.shadowRoot;
    const pane = shadow &&
      shadow.querySelector('[data-pane="logs"]');

    if (!pane || shadow.querySelector('#moo-macro-api-status')) {
      return !!pane;
    }

    const card = document.createElement('div');
    card.id = 'moo-macro-api-status';
    card.className = 'stat';

    const title = document.createElement('strong');
    title.textContent = 'Game API connection';

    statusEl = document.createElement('p');
    statusEl.className = 'note';

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent =
      'Read-only test. No food selection, attacks, or other game actions.';

    const actions = document.createElement('div');
    actions.className = 'actions';

    connectBtn = document.createElement('button');
    connectBtn.textContent = 'Check connection';
    connectBtn.addEventListener('click', () => connect().catch(() => {}));

    copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy report';
    copyBtn.disabled = true;

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(report());
        copyBtn.textContent = 'Copied';
      } catch (_) {
        copyBtn.textContent = 'Copy unavailable';
      }
    });

    actions.append(connectBtn, copyBtn);

    reportEl = document.createElement('pre');
    reportEl.textContent = 'Click Check connection to begin.';

    Object.assign(reportEl.style, {
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      maxHeight: '220px',
      overflow: 'auto',
      padding: '9px',
      background: '#0b1220',
      color: '#dbe5f2',
      borderRadius: '7px',
      font: '11px/1.45 monospace'
    });

    card.append(title, statusEl, note, actions, reportEl);

    const logs = pane.querySelector('#logs, .logs');

    if (logs) logs.insertAdjacentElement('afterend', card);
    else pane.appendChild(card);

    render();
    return true;
  }

  function boot() {
    if (attachLogs()) return;

    const observer = new MutationObserver(() => {
      if (attachLogs()) observer.disconnect();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  window.MooMacroLib = Object.freeze({
    version: VERSION,
    connect,
    getState: state,
    report
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Automatic read-only connection check.
  connect().catch(() => {});
})();
