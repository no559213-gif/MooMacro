
/* MooMacroLib.js — read-only API connection test v0.3.1
 * Uses the existing moomoo.js:api handshake. Sends no game actions.
 */
(() => {
  'use strict';

  const VERSION = '0.3.1';
  const API_EVENT = 'moomoo.js:api';
  const CARD_ID = 'moo-macro-api-status';
  const logs = [];
  const unsubscribers = [];
  let game = null, loader = null, busy = false, errorText = '';
  let lastEvent = 'Not checked yet.';
  let statusEl, reportEl, logEl, connectBtn, copyBtn, clearBtn;
  let shadowObserver = null;

  const safe = (fn, fallback = null) => {
    try { return fn(); } catch (_) { return fallback; }
  };

  function state() {
    if (!game) return { apiFound: false, ready: false };
    const me = safe(() => game.self, {}) || {};
    const transport = loader ? safe(() => loader.active(), null) : null;
    return {
      apiFound: true,
      ready: safe(() => game.isReady() === true, false),
      transport: !transport ? 'unknown / inactive' :
        transport.failed ? 'failed' : transport.ready ? 'ready' : 'not ready',
      alive: typeof me.alive === 'boolean' ? me.alive : null,
      sid: Number.isFinite(me.sid) && me.sid >= 0 ? me.sid : null,
      health: Number.isFinite(me.health) ? me.health : null,
      items: Array.isArray(me.items) ? me.items.slice() : [],
      weapons: Array.isArray(me.weapons) ? me.weapons.slice() : [],
      weaponIndex: Number.isFinite(me.weaponIndex) ? me.weaponIndex : null
    };
  }

  function makeReport() {
    const s = state();
    return [
      'MOO MACRO — API CONNECTION REPORT',
      'Library: ' + VERSION,
      'API found: ' + !!s.apiFound,
      'Runtime ready: ' + !!s.ready,
      'Transport: ' + (s.transport || 'unknown'),
      'Alive: ' + (s.alive ?? 'unknown'),
      'Player SID: ' + (s.sid ?? 'unknown'),
      'Health: ' + (s.health ?? 'unknown'),
      'Food/items: ' + JSON.stringify(s.items || []),
      'Weapons: ' + JSON.stringify(s.weapons || []),
      'Weapon index: ' + (s.weaponIndex ?? 'unknown'),
      'Last event: ' + lastEvent,
      'Connection error: ' + (errorText || 'none'),
      'Game actions sent: NO',
      '', 'EVENT LOG',
      ...(logs.length ? logs.slice().reverse() : ['(empty)'])
    ].join('\n');
  }

  function render() {
    if (!statusEl || !reportEl) return;
    const s = state();
    statusEl.textContent = busy ? 'Checking connection…' :
      !s.apiFound ? (errorText ? 'API NOT FOUND' : 'NOT CONNECTED') :
      s.ready ? 'API CONNECTED · GAME READY' : 'API FOUND · WAITING FOR GAME';
    reportEl.textContent = makeReport();
    logEl.textContent = logs.length ? logs.join('\n') : 'No connection events yet.';
    connectBtn.disabled = busy;

    // Always allow copying, even when the API lookup failed.
    copyBtn.disabled = false;
    clearBtn.disabled = logs.length === 0;
  }

  function log(message) {
    lastEvent = String(message);
    logs.unshift('[' + new Date().toLocaleTimeString() + '] ' + lastEvent);
    if (logs.length > 40) logs.length = 40;
    render();
  }

  function validApi(api, apiLoader) {
    return !!api && !!api.self &&
      typeof api.on === 'function' &&
      typeof api.onReady === 'function' &&
      typeof api.isReady === 'function' &&
      !!apiLoader && typeof apiLoader.active === 'function';
  }

  function requestApi(timeout = 600) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(
          'No response to "moomoo.js:api". The provider may not be loaded in this page context.'
        ));
      }, timeout);

      try {
        window.dispatchEvent(new window.CustomEvent(API_EVENT, {
          detail: {
            resolve(api, apiLoader) {
              if (done) return;
              done = true;
              window.clearTimeout(timer);
              if (!validApi(api, apiLoader)) {
                reject(new Error(
                  'API replied, but required read-only methods were missing.'
                ));
              } else resolve({ api, apiLoader });
            }
          }
        }));
      } catch (error) {
        window.clearTimeout(timer);
        reject(error);
      }
    });
  }

  function listen() {
    const healthOff = game.on('health', event => {
      if (event && event.sid === game.self.sid) {
        log('Your health changed: ' + event.value);
      }
    });

    const inventoryOff = game.on('inventory', event =>
      log('Inventory updated: ' +
        (event && event.isWeapon ? 'weapons' : 'food/items'))
    );

    const deathOff = game.on('died', () =>
      log('Player death event received.')
    );

    [healthOff, inventoryOff, deathOff].forEach(fn => {
      if (typeof fn === 'function') unsubscribers.push(fn);
    });

    game.onReady(() => log('Game runtime reports ready.'));
  }

  async function connect() {
    if (game) {
      errorText = '';
      log('Existing API connection checked.');
      return state();
    }

    if (busy) return state();

    busy = true;
    errorText = '';
    log('Looking for the existing MooMoo.js API…');

    try {
      let found = null, lastError = null;

      for (let i = 0; i < 3; i++) {
        try {
          found = await requestApi(600);
          break;
        } catch (error) {
          lastError = error;
          if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      if (!found) {
        throw lastError || new Error('MooMoo.js API was not found.');
      }

      game = found.api;
      loader = found.apiLoader;
      listen();
      log('Read-only API handshake succeeded.');
      return state();

    } catch (error) {
      errorText = error && error.message ? error.message : String(error);
      log('Connection failed: ' + errorText);
      throw error;

    } finally {
      busy = false;
      render();
    }
  }

  async function copyReport() {
    const text = makeReport();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.readOnly = true;
        area.style.cssText =
          'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        if (!ok) throw new Error('Clipboard copy was blocked.');
      }

      copyBtn.textContent = 'Copied';

    } catch (error) {
      copyBtn.textContent = 'Copy unavailable';
      log('Could not copy report: ' + (error.message || String(error)));
    }
  }

  function clearLog() {
    logs.length = 0;
    lastEvent = 'Log cleared by user.';
    render();

    // Preserve the connection error in the report.
  }

  // Remove only the Run Diagnostic button from Combat.
  function removeCombatDiagnostic(shadow) {
    const pane = shadow && shadow.querySelector('[data-pane="combat"]');
    if (!pane) return;

    pane.querySelectorAll('button').forEach(button => {
      const label = (button.textContent || '')
        .replace(/\s+/g, ' ').trim();

      if (/^run\s+(?:(?:connection|api)\s+)?diagnostic$/i.test(label)) {
        const parent = button.parentElement;
        button.remove();

        if (parent &&
            parent.matches('.stat, .mm-note') &&
            !parent.textContent.trim()) {
          parent.remove();
        }
      }
    });
  }

  function attachLogs() {
    const host = document.getElementById('moo-macro-root');
    const shadow = host && host.shadowRoot;
    if (!shadow) return false;

    removeCombatDiagnostic(shadow);

    const pane = shadow.querySelector('[data-pane="logs"]');
    if (!pane || shadow.querySelector('#' + CARD_ID)) return !!pane;

    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'stat';

    const title = document.createElement('strong');
    title.textContent = 'Game API connection';

    statusEl = document.createElement('p');
    statusEl.className = 'note';

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent =
      'Read-only check. No food selection, attacks, or other game actions.';

    const actions = document.createElement('div');
    actions.className = 'actions';

    connectBtn = document.createElement('button');
    connectBtn.textContent = 'Check connection';
    connectBtn.addEventListener('click', () =>
      connect().catch(() => {})
    );

    copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy report';
    copyBtn.addEventListener('click', copyReport);

    clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear log';
    clearBtn.addEventListener('click', clearLog);

    actions.append(connectBtn, copyBtn, clearBtn);

    reportEl = document.createElement('pre');
    reportEl.style.cssText =
      'white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;' +
      'overflow:auto;padding:9px;background:#0b1220;color:#dbe5f2;' +
      'border-radius:7px;font:11px/1.45 monospace;';

    const eventTitle = document.createElement('strong');
    eventTitle.textContent = 'Connection log';
    eventTitle.style.display = 'block';
    eventTitle.style.marginTop = '9px';

    logEl = document.createElement('pre');
    logEl.style.cssText =
      'white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;' +
      'overflow:auto;padding:9px;background:#0b1220;color:#dbe5f2;' +
      'border-radius:7px;font:11px/1.45 monospace;';

    card.append(title, statusEl, note, actions, reportEl, eventTitle, logEl);

    const oldLogs = pane.querySelector(
      '#logs, .logs, #mm-log-list, .mm-log-list'
    );

    if (oldLogs) oldLogs.insertAdjacentElement('afterend', card);
    else pane.appendChild(card);

    if (!shadowObserver) {
      shadowObserver = new MutationObserver(() =>
        removeCombatDiagnostic(shadow)
      );
      shadowObserver.observe(shadow, {
        childList: true,
        subtree: true
      });
    }

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
    report: makeReport
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Automatic read-only connection attempt.
  connect().catch(() => {});
})();
