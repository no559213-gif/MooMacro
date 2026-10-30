
/* MooMacroLib.js — Read-only connection diagnostic v0.2.0 */
(function (w, d) {
  'use strict';

  const VERSION = '0.2.0';
  const IDS = [
    'storeEquip', 'storeBuy', 'follmoo',
    'showItemInfo', 'changeStoreIndex'
  ];
  const MATCH = /health|inventory|item|weapon|player|self|game|client|socket|store|state|engine|protocol/i;

  function typeOf(name) {
    try {
      const p = Object.getOwnPropertyDescriptor(w, name);
      if (!p) return 'not an own property';
      if (!Object.prototype.hasOwnProperty.call(p, 'value'))
        return 'accessor (not invoked)';
      if (p.value === null) return 'null';
      if (Array.isArray(p.value)) return 'array';
      return typeof p.value;
    } catch (e) {
      return 'unreadable: ' + e.message;
    }
  }

  function functionSource(name) {
    try {
      const p = Object.getOwnPropertyDescriptor(w, name);
      if (!p || !Object.prototype.hasOwnProperty.call(p, 'value'))
        return name + ': not a direct data property';
      if (typeof p.value !== 'function')
        return name + ': ' + typeOf(name);

      let s = Function.prototype.toString.call(p.value)
        .replace(/\s+/g, ' ').trim();

      return name + ' (not executed): ' +
        (s.length > 700 ? s.slice(0, 700) + ' …[truncated]' : s);
    } catch (e) {
      return name + ': source unavailable (' + e.message + ')';
    }
  }

  function scan() {
    const out = [
      'MOO MACRO — READ-ONLY CONNECTION DIAGNOSTIC',
      'Library: ' + VERSION,
      'Page: ' + location.origin + location.pathname,
      'No game functions executed.',
      'No game actions sent.',
      'No socket interception.',
      ''
    ];

    let names = [];

    try {
      names = Object.getOwnPropertyNames(w);
      out.push('Window own properties inspected: ' + names.length);
    } catch (e) {
      out.push('Window enumeration failed: ' + e.message);
    }

    out.push('', 'KNOWN GAME HELPERS');

    IDS.concat([
      'gameCanvas', 'game', 'gameState', 'player',
      'players', 'myPlayer', 'health', 'inventory',
      'items', 'weapons', 'socket', 'ws'
    ]).forEach(n => out.push(n + ': ' + typeOf(n)));

    const matches = names.filter(n => MATCH.test(n)).sort();

    out.push('', 'MATCHING WINDOW NAMES (' + matches.length + ')');
    matches.slice(0, 100).forEach(n =>
      out.push(n + ': ' + typeOf(n))
    );

    if (matches.length > 100)
      out.push('Omitted: ' + (matches.length - 100));

    out.push('', 'EXPOSED HELPER SOURCE (READ ONLY)');
    IDS.forEach(n => out.push(functionSource(n)));

    const scripts = Array.from(d.scripts || []);
    const external = scripts.filter(s => s.src).map(s => s.src);

    out.push('', 'LOADED JAVASCRIPT FILES');
    out.push('Script elements: ' + scripts.length);
    out.push('External scripts: ' + external.length);

    external.forEach((src, i) =>
      out.push((i + 1) + '. ' + src)
    );

    const inline = scripts.filter(
      s => !s.src && (s.textContent || '').trim()
    );

    out.push('Inline scripts with content: ' + inline.length);

    inline.slice(0, 10).forEach((s, i) => {
      const sample = s.textContent.replace(/\s+/g, ' ').trim();
      out.push(
        'Inline ' + (i + 1) + ': ' +
        sample.slice(0, 160) +
        (sample.length > 160 ? ' …' : '')
      );
    });

    const canvas =
      d.getElementById('gameCanvas') ||
      d.querySelector('canvas');

    out.push('', 'PAGE ELEMENTS');
    out.push('Game canvas: ' + (canvas ? 'found' : 'not found'));

    if (canvas)
      out.push('Canvas size: ' + canvas.width + ' x ' + canvas.height);

    out.push(
      '#diedText: ' +
      (d.getElementById('diedText') ? 'found' : 'not found')
    );

    out.push('', 'LIMITATIONS');
    out.push('Property names/types and function source only.');
    out.push('Getters and functions are never invoked.');
    out.push('Private closure/module state cannot be discovered by a window scan.');

    return out.join('\n');
  }

  function attach() {
    const host = d.getElementById('moo-macro-root');
    const shadow = host && host.shadowRoot;
    const pane = shadow &&
      shadow.querySelector('[data-pane="logs"]');

    if (!pane ||
        shadow.querySelector('#moo-macro-connection-diagnostic'))
      return !!pane;

    const card = d.createElement('div');
    card.id = 'moo-macro-connection-diagnostic';
    card.className = 'stat';

    const title = d.createElement('strong');
    title.textContent = 'Read-only connection diagnostic';

    const note = d.createElement('p');
    note.className = 'note';
    note.textContent =
      'Inspects exposed names, helper source and loaded scripts. No game functions are executed.';

    const actions = d.createElement('div');
    actions.className = 'actions';

    const run = d.createElement('button');
    run.textContent = 'Run connection scan';
    run.type = 'button';

    const copy = d.createElement('button');
    copy.textContent = 'Copy scan';
    copy.type = 'button';
    copy.disabled = true;

    const output = d.createElement('pre');
    output.textContent = 'Click Run connection scan to begin.';

    Object.assign(output.style, {
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      maxHeight: '260px',
      overflow: 'auto',
      padding: '9px',
      background: '#0b1220',
      color: '#dbe5f2',
      borderRadius: '7px',
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
        copy.textContent = 'Clipboard unavailable';
      }
    });

    actions.append(run, copy);
    card.append(title, note, actions, output);

    const logBox = pane.querySelector('#logs, .logs');

    if (logBox)
      logBox.insertAdjacentElement('afterend', card);
    else
      pane.appendChild(card);

    return true;
  }

  function boot() {
    if (attach()) return;

    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect();
    });

    observer.observe(d.documentElement, {
      childList: true,
      subtree: true
    });
  }

  try {
    Object.defineProperty(w, 'MooMacroDiagnostic', {
      value: Object.freeze({ version: VERSION, scan }),
      configurable: true
    });
  } catch (_) {}

  if (d.readyState === 'loading')
    d.addEventListener('DOMContentLoaded', boot, { once: true });
  else
    boot();

})(window, document);
