
/* MooMacroLib.js — Read-only diagnostic v0.1.0
 * No game actions. No network interception.
 */
(() => {
  'use strict';

  const VERSION = '0.1.0';
  const ROOT_ID = 'moo-macro-root';
  const CARD_ID = 'moo-macro-readonly-diagnostic';
  const MATCH = /health|inventory|item|weapon|player|self|game|client|socket|store|follmoo|state|engine|protocol/i;
  const KNOWN = [
    'storeEquip', 'storeBuy', 'follmoo',
    'showItemInfo', 'changeStoreIndex', 'gameCanvas'
  ];

  function propertyType(object, name) {
    try {
      const d = Object.getOwnPropertyDescriptor(object, name);
      if (!d) return name in object ? 'inherited' : 'not exposed';
      if (!Object.prototype.hasOwnProperty.call(d, 'value')) {
        return 'accessor (skipped)';
      }
      if (d.value === null) return 'null';
      if (Array.isArray(d.value)) return 'array';
      return typeof d.value;
    } catch (_) {
      return 'unreadable';
    }
  }

  function scan() {
    const lines = [
      'MOO MACRO — READ-ONLY INTERFACE SCAN',
      'Library: ' + VERSION,
      'Page: ' + location.hostname + location.pathname,
      'No game actions were sent.',
      ''
    ];

    let names = [];

    try {
      names = Object.getOwnPropertyNames(window);
      lines.push('Window properties inspected: ' + names.length);
    } catch (_) {
      lines.push('Window properties unavailable');
    }

    lines.push('', 'KNOWN GAME HELPERS');

    KNOWN.forEach(name => {
      lines.push(name + ': ' + propertyType(window, name));
    });

    const matches = names.filter(name => MATCH.test(name)).sort();

    lines.push('', 'MATCHING WINDOW PROPERTIES (' + matches.length + ')');

    matches.slice(0, 70).forEach(name => {
      lines.push(name + ': ' + propertyType(window, name));
    });

    if (matches.length > 70) {
      lines.push('Additional names omitted: ' + (matches.length - 70));
    }

    const canvas =
      document.getElementById('gameCanvas') ||
      document.querySelector('canvas');

    lines.push('', 'PAGE ELEMENTS');
    lines.push('Game canvas: ' + (canvas ? 'found' : 'not found'));

    if (canvas) {
      lines.push(
        'Canvas size: ' + canvas.width + ' x ' + canvas.height
      );
    }

    lines.push(
      '#diedText: ' +
      (document.getElementById('diedText') ? 'found' : 'not found')
    );

    lines.push('', 'LIMITATIONS');
    lines.push('Only page-visible property names and types were checked.');
    lines.push('Functions and getters were not executed.');
    lines.push('Private module state was not inspected.');

    return lines.join('\n');
  }

  function attachToLogs() {
    const host = document.getElementById(ROOT_ID);
    const shadow = host && host.shadowRoot;
    const pane = shadow &&
      shadow.querySelector('[data-pane="logs"]');

    if (!pane || shadow.querySelector('#' + CARD_ID)) {
      return !!pane;
    }

    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'stat';

    const title = document.createElement('strong');
    title.textContent = 'Read-only game diagnostic';

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent =
      'Checks visible interface names only. No gameplay actions.';

    const run = document.createElement('button');
    run.type = 'button';
    run.textContent = 'Scan game interface';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy scan';
    copy.disabled = true;

    const output = document.createElement('pre');
    output.textContent = 'Press Scan game interface to begin.';

    Object.assign(output.style, {
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      maxHeight: '210px',
      overflow: 'auto',
      margin: '9px 0 0',
      padding: '9px',
      border: '1px solid #35445a',
      borderRadius: '7px',
      background: '#0b1220',
      color: '#dbe5f2',
      font: '11px/1.45 monospace'
    });

    run.addEventListener('click', () => {
      output.textContent = scan();
      copy.disabled = false;
    });

    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(output.textContent);
        copy.textContent = 'Copied';
      } catch (_) {
        copy.textContent = 'Select text to copy';
      }
    });

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(run, copy);

    card.append(title, note, actions, output);

    const logBox = pane.querySelector('.logs');

    if (logBox) {
      logBox.insertAdjacentElement('afterend', card);
    } else {
      pane.appendChild(card);
    }

    return true;
  }

  // Wait for Moo Macro to create its GUI.
  if (!attachToLogs() && document.documentElement) {
    const observer = new MutationObserver(() => {
      if (attachToLogs()) observer.disconnect();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  try {
    Object.defineProperty(window, 'MooMacroDiagnostic', {
      value: Object.freeze({ version: VERSION, scan }),
      configurable: true
    });
  } catch (_) {}

})();
