/*
 * Moo Macro Library
 * Lightweight GUI, hat buttons, session timer, death notice, logs and keybind.
 * No Auto-Heal, MooMoo.js, MooMod, or network/protocol code.
 */
(() => {
  'use strict';

  const LIBRARY_VERSION = '1.0.0';
  const ROOT_ID = 'moo-macro-root';
  const KEY_STORAGE = 'mooMacroKey';
  const MAX_LOGS = 60;

  function init(options = {}) {
    if (document.getElementById(ROOT_ID)) return false;

    const scriptVersion = String(options.version || '1.3.7');
    const startedAt = Date.now();
    const logs = [];

    let lastKilledBy = 'Not detected';
    let deathActive = false;
    let waitingForKey = false;
    let keybind = 'F6';

    try {
      keybind = localStorage.getItem(KEY_STORAGE) || 'F6';
    } catch (_) {
      // Local storage may be unavailable.
    }

    const host = document.createElement('div');
    host.id = ROOT_ID;
    Object.assign(host.style, {
      position: 'fixed',
      top: '18px',
      left: '18px',
      zIndex: '2147483000'
    });
    (document.body || document.documentElement).appendChild(host);

    const ui = host.attachShadow({ mode: 'open' });

    ui.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        button {
          font: inherit;
          color: inherit;
          background: #263449;
          border: 1px solid #46566f;
          border-radius: 7px;
          padding: 8px;
          cursor: pointer;
        }
        button:hover { background: #34465f; }
        .panel {
          width: 340px;
          color: #eef2f7;
          background: #111827;
          border: 1px solid #39465a;
          border-radius: 13px;
          box-shadow: 0 14px 40px #0009;
          font: 13px/1.4 Arial, sans-serif;
          overflow: hidden;
        }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #1b2637;
          cursor: move;
          user-select: none;
        }
        .brand { font-weight: 800; letter-spacing: 1px; }
        .ver { display: block; color: #9eacc0; font-size: 10px; }
        .head button { padding: 3px 9px; margin-left: 5px; }
        .tabs { display: flex; gap: 4px; padding: 8px; background: #151f2e; }
        .tab { flex: 1; padding: 7px 3px; font-size: 11px; }
        .tab.active { background: #496b9d; border-color: #7296c9; }
        main { height: 310px; overflow: auto; padding: 12px; }
        [hidden] { display: none !important; }
        .stat {
          padding: 12px;
          margin-bottom: 9px;
          background: #1b2738;
          border: 1px solid #35445a;
          border-radius: 9px;
        }
        .label { color: #aebbd0; font-size: 11px; }
        .value {
          display: block;
          margin-top: 4px;
          font-size: 20px;
          font-weight: bold;
          overflow-wrap: anywhere;
        }
        .note { color: #aebbd0; font-size: 11px; }
        .actions { display: flex; gap: 7px; margin-bottom: 8px; }
        .actions button { flex: 1; }
        .hat {
          display: flex;
          width: 100%;
          margin: 8px 0;
          justify-content: space-between;
        }
        .logs {
          height: 220px;
          overflow: auto;
          background: #0b1220;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 8px;
        }
        .entry {
          padding: 6px 2px;
          border-bottom: 1px solid #263449;
          overflow-wrap: anywhere;
        }
        .entry small { color: #9eacc0; }
        .status {
          padding: 10px 12px;
          border-top: 1px solid #344257;
          background: #192638;
        }
        .status b, .status small { display: block; }
        .status small { color: #b6c3d6; margin-top: 3px; }
        .ok { color: #83d7a5; }
        .warn { color: #f6cd75; }
        .bad { color: #ff9292; }
        .panel.min .tabs,
        .panel.min main,
        .panel.min .status { display: none; }
        .key { font-weight: bold; color: #f6cd75; }
      </style>

      <div class="panel">
        <header class="head">
          <div class="brand">
            MOO MACRO
            <span class="ver">v${scriptVersion} · MooMoo.io · Library ${LIBRARY_VERSION}</span>
          </div>
          <div>
            <button id="min" title="Minimize">—</button>
            <button id="hide" title="Hide">×</button>
          </div>
        </header>

        <nav class="tabs">
          <button class="tab active" data-tab="stats">Stats</button>
          <button class="tab" data-tab="combat">Combat</button>
          <button class="tab" data-tab="hat">Hat</button>
          <button class="tab" data-tab="logs">Logs</button>
          <button class="tab" data-tab="settings">Settings</button>
        </nav>

        <main>
          <section data-pane="stats">
            <div class="stat">
              <span class="label">SESSION TIME</span>
              <strong class="value" id="time">00:00:00</strong>
            </div>
            <div class="stat">
              <span class="label">LAST KILLED BY</span>
              <strong class="value" id="killer">Not detected</strong>
            </div>
            <p class="note">
              Lightweight death detection is active. Animal identity is not
              available from the visible death message.
            </p>
          </section>

          <section data-pane="combat" hidden>
            <div class="stat">
              <strong>Combat</strong>
              <p class="note">No automated combat actions are included.</p>
            </div>
          </section>

          <section data-pane="hat" hidden>
            <div class="stat">
              <strong>Manual hat switching</strong>
              <p class="note">Uses the game's exposed helper if available.</p>
            </div>
            <button class="hat" id="apple">🍎 Apple Cap <span>›</span></button>
            <button class="hat" id="moo">🐮 Moo Cap <span>›</span></button>
          </section>

          <section data-pane="logs" hidden>
            <div class="actions">
              <button id="copy">Copy report</button>
              <button id="clear">Clear logs</button>
            </div>
            <div class="logs" id="logs"></div>
          </section>

          <section data-pane="settings" hidden>
            <div class="stat">
              <strong>GUI Controls</strong>
              <p class="note">Show or hide the Moo Macro panel.</p>
              <button id="toggle" style="width:100%">Hide GUI</button>
            </div>
            <div class="stat">
              <strong>Keyboard Shortcut</strong>
              <p class="note">
                Current key: <span class="key" id="key"></span>
              </p>
              <button id="bind" style="width:100%">Change Keybind</button>
              <p class="note" id="bindHelp">Press a key to assign it.</p>
            </div>
          </section>
        </main>

        <footer class="status">
          <b id="status" class="ok">Moo Macro initialized</b>
          <small id="detail">Ready.</small>
        </footer>
      </div>
    `;

    const $ = selector => ui.querySelector(selector);
    const panel = $('.panel');

    function renderLogs() {
      const box = $('#logs');
      box.replaceChildren();

      if (!logs.length) {
        box.textContent = 'No events yet.';
        return;
      }

      for (const item of logs) {
        const row = document.createElement('div');
        row.className = 'entry';

        const small = document.createElement('small');
        small.textContent = item.time;

        const text = document.createElement('div');
        text.textContent = item.message;

        row.append(small, text);
        box.appendChild(row);
      }
    }

    function log(message) {
      logs.unshift({
        time: new Date().toLocaleTimeString(),
        message: String(message)
      });
      if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
      renderLogs();
    }

    function setStatus(title, detail = '', level = 'ok') {
      $('#status').textContent = title;
      $('#status').className = level;
      $('#detail').textContent = detail;
      log(title + (detail ? ' — ' + detail : ''));
    }

    function formatTime(ms) {
      const seconds = Math.floor(ms / 1000);
      return [
        Math.floor(seconds / 3600),
        Math.floor((seconds % 3600) / 60),
        seconds % 60
      ].map(number => String(number).padStart(2, '0')).join(':');
    }

    function checkDeath() {
      const element = document.querySelector('#diedText');
      const style = element ? getComputedStyle(element) : null;
      const visible = Boolean(element) &&
        /you died/i.test(element.textContent || '') &&
        element.getClientRects().length > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';

      if (visible && !deathActive) {
        deathActive = true;
        lastKilledBy = 'Not detected';
        $('#killer').textContent = lastKilledBy;
        setStatus(
          'Death detected',
          'Killer information is not available in the visible death message.',
          'warn'
        );
      } else if (!visible) {
        deathActive = false;
      }
    }

    function equipHat(id, name) {
      const equip = window.storeEquip;

      if (typeof equip !== 'function') {
        setStatus(name + ' unavailable', 'Game helper was not exposed.', 'bad');
        return;
      }

      try {
        const result = equip.call(window, id);
        if (result === false) {
          setStatus(name + ' rejected', 'Game helper returned false.', 'bad');
        } else {
          setStatus(
            name + ' request sent',
            'Check in-game; server confirmation is unavailable.',
            'warn'
          );
        }
      } catch (error) {
        setStatus(name + ' failed', error.message || 'Unknown error.', 'bad');
      }
    }

    function setKey(key) {
      keybind = key;
      $('#key').textContent = key;

      try {
        localStorage.setItem(KEY_STORAGE, key);
      } catch (_) {
        // Saving the keybind is optional.
      }

      setStatus('Keybind saved', 'GUI toggle: ' + key);
    }

    ui.querySelectorAll('.tab').forEach(button => {
      button.addEventListener('click', () => {
        ui.querySelectorAll('.tab').forEach(tab => {
          tab.classList.toggle('active', tab === button);
        });

        ui.querySelectorAll('[data-pane]').forEach(pane => {
          pane.hidden = pane.dataset.pane !== button.dataset.tab;
        });
      });
    });

    $('#apple').addEventListener('click', () => equipHat(50, 'Apple Cap'));
    $('#moo').addEventListener('click', () => equipHat(51, 'Moo Cap'));

    $('#min').addEventListener('click', () => {
      panel.classList.toggle('min');
    });

    $('#hide').addEventListener('click', () => {
      host.style.display = 'none';
      log('GUI hidden. Press ' + keybind + ' to show it.');
    });

    $('#toggle').addEventListener('click', () => {
      host.style.display = 'none';
      log('GUI hidden. Press ' + keybind + ' to show it.');
    });

    $('#bind').addEventListener('click', () => {
      waitingForKey = true;
      $('#bindHelp').textContent = 'Press a key now. Escape cancels.';
      setStatus('Waiting for keybind', 'Press your preferred key.', 'warn');
    });

    $('#key').textContent = keybind;

    $('#clear').addEventListener('click', () => {
      logs.length = 0;
      renderLogs();
      setStatus('Logs cleared');
    });

    $('#copy').addEventListener('click', async () => {
      const report =
        'Moo Macro ' + scriptVersion +
        '\nLibrary: ' + LIBRARY_VERSION +
        '\nSession: ' + formatTime(Date.now() - startedAt) +
        '\nLast Killed By: ' + lastKilledBy +
        '\nKeybind: ' + keybind + '\n' +
        logs.map(item => '[' + item.time + '] ' + item.message).join('\n');

      try {
        await navigator.clipboard.writeText(report);
        setStatus('Report copied', 'Copied to clipboard.');
      } catch (_) {
        setStatus('Copy failed', 'Clipboard access was blocked.', 'bad');
      }
    });

    document.addEventListener('keydown', event => {
      if (waitingForKey) {
        event.preventDefault();
        event.stopPropagation();

        if (event.key === 'Escape') {
          waitingForKey = false;
          $('#bindHelp').textContent = 'Keybind unchanged.';
          return;
        }

        if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

        waitingForKey = false;
        setKey(event.key);
        $('#bindHelp').textContent = 'Press the key to toggle the GUI.';
        return;
      }

      if (event.key === keybind) {
        const target = event.target;
        if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;

        host.style.display = host.style.display === 'none' ? '' : 'none';
        event.preventDefault();
      }
    }, true);

    let drag = null;

    $('.head').addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = host.getBoundingClientRect();
      drag = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top
      };
      $('.head').setPointerCapture(event.pointerId);
    });

    $('.head').addEventListener('pointermove', event => {
      if (!drag) return;
      host.style.left = Math.max(0, drag.left + event.clientX - drag.x) + 'px';
      host.style.top = Math.max(0, drag.top + event.clientY - drag.y) + 'px';
    });

    $('.head').addEventListener('pointerup', () => { drag = null; });
    $('.head').addEventListener('pointercancel', () => { drag = null; });

    const timer = window.setInterval(() => {
      if (!host.isConnected) {
        window.clearInterval(timer);
        return;
      }
      $('#time').textContent = formatTime(Date.now() - startedAt);
      checkDeath();
    }, 750);

    log('Lightweight death detector enabled (750 ms polling).');
    log('Animal killer scanning is disabled.');
    log('Moo Macro ' + scriptVersion + ' initialized.');
    setStatus('Moo Macro ready', 'Session timer started.');
    console.info('[Moo Macro ' + scriptVersion + '] Library ' + LIBRARY_VERSION + ' loaded.');

    return true;
  }

  Object.defineProperty(window, 'MooMacroLib', {
    value: Object.freeze({
      version: LIBRARY_VERSION,
      init
    }),
    configurable: true
  });
})();
