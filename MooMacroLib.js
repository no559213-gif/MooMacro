/*
 * MooMacroLib.js — standalone read-only page scan + one-shot Q input test.
 * Version: 0.5.0
 *
 * - No MooMod / MooMoo.js dependency.
 * - No game-helper calls, socket inspection, packet decoding, or network requests.
 * - Scan reads public window property descriptors and visible DOM metadata only.
 * - Test Q dispatches one synthetic keydown + keyup pair for Q only.
 *   Synthetic events are untrusted; the game may ignore them.
 * - No Space key, Auto-Heal, timers, or repeated input are triggered.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.MooMacroLib = api;
    if (root && root.document) api.autoAttach(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.5.0';
  const ROOT_ID = 'moo-macro-root';
  const CARD_ID = 'moo-macro-standalone-scan';
  const GLOBAL_HINT = /(?:moomoo|game|player|health|inventory|items|weapons|self|state|store)/i;
  const STATE_FIELD = /^(?:health|hp|alive|sid|items|weapons|inventory|weaponIndex|weapon|food)$/i;
  const HELPER_NAMES = ['storeEquip', 'storeBuy', 'follmoo', 'showItemInfo', 'changeStoreIndex'];

  function ownNames(value) {
    try { return Object.getOwnPropertyNames(value); }
    catch (_) { return []; }
  }

  function ownDescriptor(value, key) {
    try { return Object.getOwnPropertyDescriptor(value, key); }
    catch (_) { return null; }
  }

  function describeValue(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array(' + value.length + ')';
    if (typeof value === 'function') return 'function';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  function safeValue(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value.slice(0, 80));
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return '[array length ' + value.length + ']';
    if (typeof value === 'function') return '[function]';
    if (typeof value === 'object') return '[object]';
    return String(value);
  }

  function readStateFields(objectValue) {
    const found = [];
    ownNames(objectValue).slice(0, 100).forEach(function (field) {
      if (!STATE_FIELD.test(field)) return;
      const descriptor = ownDescriptor(objectValue, field);
      if (!descriptor) return;
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        found.push({ name: field, value: '[accessor not invoked]' });
      } else {
        found.push({ name: field, value: safeValue(descriptor.value) });
      }
    });
    return found;
  }

  function listScripts(win) {
    const found = [];
    const seen = new Set();

    function addUrl(value) {
      let url = String(value || '');
      if (!url) return;

      try {
        const parsed = new URL(
          url,
          win.location && win.location.href || 'https://moomoo.io/'
        );
        url = parsed.origin + parsed.pathname;
      } catch (_) {}

      if (!seen.has(url)) {
        seen.add(url);
        found.push(url);
      }
    }

    try {
      Array.from(win.document.scripts || []).forEach(function (script) {
        if (script && script.src) addUrl(script.src);
      });
    } catch (_) {}

    try {
      const entries = win.performance && win.performance.getEntriesByType
        ? win.performance.getEntriesByType('resource') : [];

      Array.from(entries || []).forEach(function (entry) {
        const name = String(entry && entry.name || '');
        if (/\.m?js(?:[?#]|$)|\/p\/[^/?#]+\.js(?:[?#]|$)/i.test(name)) {
          addUrl(name);
        }
      });
    } catch (_) {}

    return found.slice(0, 40);
  }

  function scanPage(win) {
    if (!win || !win.document) {
      throw new TypeError('A browser window is required.');
    }

    const doc = win.document;
    const hostname = (win.location && win.location.hostname) || 'unknown';
    let page = 'unknown';

    try {
      page = win.location
        ? String(win.location.protocol || 'https:') +
          '//' + hostname +
          String(win.location.pathname || '/')
        : 'unknown';
    } catch (_) {}

    let canvases = [];
    let globalNames = [];

    try {
      canvases = Array.from(doc.querySelectorAll('canvas')).map(function (canvas, index) {
        let rect = null;

        try {
          const bounds = canvas.getBoundingClientRect();
          rect = {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height)
          };
        } catch (_) {}

        return {
          index,
          id: canvas.id || '',
          width: Number(canvas.width) || 0,
          height: Number(canvas.height) || 0,
          rect
        };
      });
    } catch (_) {}

    try { globalNames = ownNames(win); } catch (_) {}

    const publicGlobals = [];
    const stateCandidates = [];

    globalNames.filter(function (name) {
      return GLOBAL_HINT.test(name) &&
        !/(?:socket|websocket|\bws\b|network|transport)/i.test(name);
    }).slice(0, 120).forEach(function (name) {
      const descriptor = ownDescriptor(win, name);
      if (!descriptor) return;

      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        publicGlobals.push({ name, type: 'accessor (not invoked)' });
        return;
      }

      const value = descriptor.value;
      publicGlobals.push({ name, type: describeValue(value) });

      if (STATE_FIELD.test(name)) {
        stateCandidates.push({
          name: 'window.' + name,
          fields: [{ name, value: safeValue(value) }]
        });
        return;
      }

      if (!value || typeof value !== 'object' ||
          !/(?:moo|game|player|self|state|inventory|items|weapons)/i.test(name)) {
        return;
      }

      const fields = readStateFields(value);
      if (fields.length) stateCandidates.push({ name, fields });
    });

    const helpers = HELPER_NAMES.map(function (name) {
      const descriptor = ownDescriptor(win, name);

      if (!descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return {
          name,
          available: false,
          type: descriptor ? 'accessor (not invoked)' : 'not exposed'
        };
      }

      return {
        name,
        available: typeof descriptor.value === 'function',
        type: describeValue(descriptor.value)
      };
    });

    let diedTextFound = false;
    let gameCanvasFound = false;

    try { diedTextFound = !!doc.querySelector('#diedText'); } catch (_) {}
    try { gameCanvasFound = !!doc.querySelector('#gameCanvas'); } catch (_) {}

    const healthFound = stateCandidates.some(candidate =>
      candidate.fields.some(field => /^(health|hp)$/i.test(field.name))
    );

    return {
      libraryVersion: VERSION,
      page,
      hostname,
      officialHostMatch: /(^|\.)moomoo\.io$/i.test(hostname),
      readyState: doc.readyState || 'unknown',

      dom: {
        canvasCount: canvases.length,
        canvases,
        gameCanvasFound,
        diedTextFound
      },

      scriptUrls: listScripts(win),
      publicGlobals,
      stateCandidates,
      knownHelpers: helpers,
      publicHealthFieldFound: healthFound,

      checks: {
        providerHandshakeAttempted: false,
        gameHelpersInvoked: false,
        gameActionsSentByLibrary: false,
        socketTrafficInspected: false,
        networkRequestsInitiated: false,
        scriptBodiesFetched: false
      }
    };
  }

  function formatReport(report, inputTest) {
    if (!report || typeof report !== 'object') {
      throw new TypeError('A scan report is required.');
    }

    const lines = [
      'MOO MACRO — STANDALONE READ-ONLY PAGE SCAN',
      'Library: ' + (report.libraryVersion || VERSION),
      'Page: ' + (report.page || 'unknown'),
      'Official MooMoo.io host match: ' +
        (report.officialHostMatch ? 'YES' : 'NO / UNKNOWN'),
      'Document ready: ' + (report.readyState || 'unknown'),
      '',
      'VISIBLE GAME PAGE',
      'Canvas count: ' + ((report.dom && report.dom.canvasCount) || 0),
      'gameCanvas element: ' +
        (report.dom && report.dom.gameCanvasFound ? 'found' : 'not found'),
      'diedText element: ' +
        (report.dom && report.dom.diedTextFound ? 'found' : 'not found'),
      '',
      'PUBLIC PLAYER-STATE CHECK',
      'Public health field found: ' +
        (report.publicHealthFieldFound ? 'YES' : 'NO'),
      'Candidate state objects: ' +
        ((report.stateCandidates && report.stateCandidates.length) || 0)
    ];

    (report.stateCandidates || []).forEach(function (candidate) {
      lines.push('  ' + candidate.name + ':');
      (candidate.fields || []).forEach(function (field) {
        lines.push('    ' + field.name + ' = ' + field.value);
      });
    });

    lines.push('', 'KNOWN EXPOSED HELPERS (NOT CALLED)');
    (report.knownHelpers || []).forEach(function (helper) {
      lines.push(
        '  ' + helper.name + ': ' +
        (helper.available ? 'function exposed' : helper.type)
      );
    });

    lines.push('', 'MATCHING PUBLIC WINDOW PROPERTIES');
    (report.publicGlobals || []).forEach(function (item) {
      lines.push('  ' + item.name + ': ' + item.type);
    });

    lines.push('', 'ALREADY-LOADED JAVASCRIPT URLS (NO FILES FETCHED)');
    (report.scriptUrls || []).forEach(function (url) {
      lines.push('  ' + url);
    });

    lines.push('', 'TEST Q RESULT');

    if (!inputTest) {
      lines.push('Test Q has not been run.');
    } else {
      lines.push('Time: ' + inputTest.time);
      lines.push('Result: ' + inputTest.message);
      lines.push('Keydown dispatched: ' +
        (inputTest.keydownDispatched ? 'YES' : 'NO'));
      lines.push('Keyup dispatched: ' +
        (inputTest.keyupDispatched ? 'YES' : 'NO'));
      lines.push('Synthetic / isTrusted=false: ' +
        (inputTest.synthetic ? 'YES' : 'NO'));
      lines.push('Space key dispatched: NO');
      lines.push('Game accepted the input: NOT CONFIRMED');
    }

    lines.push(
      '',
      'SAFETY CHECKS',
      'Provider handshake attempted: NO',
      'Game helpers invoked: NO',
      'Socket frames / packet traffic inspected: NO',
      'New network requests initiated: NO',
      'Script source files fetched: NO',
      'Auto-Heal triggered: NO',
      '',
      report.publicHealthFieldFound
        ? 'Scan result: A public health-like field was found. It still needs validation before any feature can rely on it.'
        : 'Scan result: No public player-health field was found in the inspected page globals. This scan cannot access module-private state.'
    );

    return lines.join('\n');
  }

  function dispatchTestQ(win) {
    if (!win || !win.document || typeof win.KeyboardEvent !== 'function') {
      return {
        ok: false,
        message: 'KeyboardEvent support is unavailable.',
        keydownDispatched: false,
        keyupDispatched: false,
        synthetic: true
      };
    }

    const doc = win.document;
    const active = doc.activeElement;

    if (active) {
      const tag = String(active.tagName || '').toLowerCase();

      if (tag === 'input' || tag === 'textarea' ||
          tag === 'select' || active.isContentEditable === true) {
        return {
          ok: false,
          message: 'Q was not sent because a text-entry field has focus.',
          keydownDispatched: false,
          keyupDispatched: false,
          synthetic: true
        };
      }
    }

    const target = active && typeof active.dispatchEvent === 'function'
      ? active
      : (doc.body || doc.documentElement || doc);

    if (!target || typeof target.dispatchEvent !== 'function') {
      return {
        ok: false,
        message: 'No suitable page event target was found.',
        keydownDispatched: false,
        keyupDispatched: false,
        synthetic: true
      };
    }

    const init = {
      key: 'q',
      code: 'KeyQ',
      keyCode: 81,
      which: 81,
      bubbles: true,
      cancelable: true,
      composed: true,
      repeat: false
    };

    try {
      const down = new win.KeyboardEvent('keydown', init);
      const downResult = target.dispatchEvent(down);

      const up = new win.KeyboardEvent('keyup', init);
      const upResult = target.dispatchEvent(up);

      const tag = String(target.tagName || target.nodeName || 'page').toUpperCase();

      return {
        ok: true,
        message:
          'Synthetic Q keydown + keyup dispatched to ' + tag +
          '. Watch the game to see whether it responds.',
        keydownDispatched: true,
        keyupDispatched: true,
        synthetic: down.isTrusted === false && up.isTrusted === false,
        defaultPrevented: {
          keydown: !downResult,
          keyup: !upResult
        },
        target: tag
      };
    } catch (error) {
      return {
        ok: false,
        message: 'Q dispatch failed: ' +
          (error && error.message ? error.message : 'unknown error'),
        keydownDispatched: false,
        keyupDispatched: false,
        synthetic: true
      };
    }
  }

  function removeCombatDiagnostic(shadow) {
    const pane = shadow && shadow.querySelector('[data-pane="combat"]');
    if (!pane) return 0;

    const targets = new Set();

    Array.from(pane.querySelectorAll('button')).filter(function (button) {
      return /diagnostic|connection test|page scan|read-only scan/i.test(
        String(button.textContent || '').trim()
      );
    }).forEach(function (button) {
      let node = button;
      let card = null;

      while (node && node !== pane) {
        const tag = String(node.tagName || '').toLowerCase();
        const className =
          typeof node.className === 'string' ? node.className : '';

        if (
          /(^|\s)stat(\s|$)|(^|\s)card(\s|$)/i.test(className) ||
          tag === 'article' ||
          tag === 'fieldset' ||
          node.hasAttribute('data-diagnostic')
        ) {
          card = node;
          break;
        }

        node = node.parentElement;
      }

      targets.add(card || button);
    });

    let removed = 0;

    targets.forEach(function (node) {
      if (node && node !== pane && pane.contains(node)) {
        node.remove();
        removed += 1;
      }
    });

    return removed;
  }

  function removeOldConnectionCard(logsPane) {
    if (!logsPane) return;

    Array.from(logsPane.querySelectorAll(
      '[data-moo-macro-connection-card], ' +
      '#moo-macro-connection-card, ' +
      '.moo-macro-connection-card'
    )).forEach(node => node.remove());

    const oldButton = Array.from(
      logsPane.querySelectorAll('button')
    ).find(button =>
      /^check connection$/i.test(String(button.textContent || '').trim())
    );

    if (oldButton) {
      const card =
        oldButton.closest('.stat, article, fieldset, [data-card]') ||
        oldButton.parentElement;

      if (card && logsPane.contains(card)) card.remove();
    }
  }

  function makeElement(doc, tag, className, text) {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function mount(win) {
    const doc = win.document;
    const host = doc.getElementById(ROOT_ID);
    const shadow = host && host.shadowRoot;

    if (!shadow) return false;

    const logsPane = shadow.querySelector('[data-pane="logs"]');
    if (!logsPane) return false;

    if (shadow.querySelector('#' + CARD_ID)) return true;

    const removed = removeCombatDiagnostic(shadow);
    removeOldConnectionCard(logsPane);

    const card = makeElement(doc, 'div', 'stat');
    card.id = CARD_ID;
    card.setAttribute('data-moo-macro-standalone-scan', 'true');

    const style = makeElement(doc, 'style');

    style.textContent = [
      '#' + CARD_ID + '{margin-top:10px}',
      '#' + CARD_ID + ' .mm-title{font-weight:700;margin-bottom:5px}',
      '#' + CARD_ID + ' .mm-note{font-size:11px;color:#aebbd0;margin:5px 0 9px}',
      '#' + CARD_ID + ' .mm-actions{display:flex;gap:7px;margin:7px 0}',
      '#' + CARD_ID + ' .mm-actions button{flex:1;min-width:0}',
      '#' + CARD_ID + ' .mm-status{font-size:11px;color:#f6cd75;min-height:30px;margin:5px 0;overflow-wrap:anywhere}',
      '#' + CARD_ID + ' .mm-log{max-height:105px;overflow:auto;background:#0b1220;border:1px solid #334155;border-radius:7px;padding:6px;font-size:11px}',
      '#' + CARD_ID + ' .mm-log div{padding:3px 0;border-bottom:1px solid #263449;overflow-wrap:anywhere}',
      '#' + CARD_ID + ' .mm-report{display:block;width:100%;height:125px;margin-top:7px;resize:vertical;background:#0b1220;color:#e5edf8;border:1px solid #334155;border-radius:7px;padding:6px;font:10px/1.35 monospace}'
    ].join('\n');

    const title = makeElement(
      doc, 'div', 'mm-title', 'Standalone connection tests'
    );

    const note = makeElement(
      doc,
      'p',
      'mm-note',
      'Test Q sends one synthetic Q key press (keydown + keyup). It may select food. It never presses Space. The game may ignore synthetic input.'
    );

    const actions = makeElement(doc, 'div', 'mm-actions');
    const testButton = makeElement(doc, 'button', '', 'Test Q');
    const scanButton = makeElement(doc, 'button', '', 'Scan page');
    const copyButton = makeElement(doc, 'button', '', 'Copy report');
    const clearButton = makeElement(doc, 'button', '', 'Clear log');

    actions.append(testButton, scanButton, copyButton, clearButton);

    const status = makeElement(
      doc, 'div', 'mm-status', 'Ready. Test Q has not been run.'
    );

    const reportBox = makeElement(doc, 'textarea', 'mm-report');
    reportBox.readOnly = true;
    reportBox.setAttribute('aria-label', 'Moo Macro test report');
    reportBox.placeholder = 'Scan and test results will appear here.';

    const eventLog = makeElement(doc, 'div', 'mm-log');

    card.append(style, title, note, actions, status, reportBox, eventLog);
    logsPane.appendChild(card);

    let latestScan = null;
    let latestInputTest = null;
    const events = [];

    function renderEvents() {
      eventLog.replaceChildren();

      if (!events.length) {
        eventLog.textContent = 'No events yet.';
        return;
      }

      events.slice(-30).forEach(function (entry) {
        eventLog.appendChild(makeElement(
          doc,
          'div',
          '',
          '[' + entry.time + '] ' + entry.message
        ));
      });
    }

    function log(message) {
      events.push({
        time: new Date().toLocaleTimeString(),
        message: String(message)
      });

      if (events.length > 50) events.shift();
      renderEvents();
    }

    function makeReport() {
      const base = latestScan
        ? formatReport(latestScan, latestInputTest)
        : [
            'MOO MACRO — STANDALONE TEST REPORT',
            'Library: ' + VERSION,
            'Page scan has not been run yet.',
            '',
            'TEST Q RESULT',
            latestInputTest
              ? latestInputTest.message
              : 'Test Q has not been run.',
            latestInputTest ? 'Space key dispatched: NO' : ''
          ].filter(Boolean).join('\n');

      return base + '\n\nEVENT LOG\n' + (
        events.length
          ? events.map(entry =>
              '[' + entry.time + '] ' + entry.message
            ).join('\n')
          : '(empty)'
      );
    }

    testButton.addEventListener('click', function () {
      testButton.disabled = true;

      try {
        latestInputTest = Object.assign(
          { time: new Date().toLocaleTimeString() },
          dispatchTestQ(win)
        );

        status.textContent =
          latestInputTest.message + ' Space was not sent.';

        log(latestInputTest.ok
          ? 'Test Q dispatched one synthetic Q keydown + keyup pair. No Space event was sent.'
          : 'Test Q not dispatched: ' + latestInputTest.message);

        reportBox.value = makeReport();
      } finally {
        testButton.disabled = false;
      }
    });

    scanButton.addEventListener('click', function () {
      try {
        latestScan = scanPage(win);

        status.textContent = latestScan.publicHealthFieldFound
          ? 'Scan complete: a public health-like field was found; validation is still needed.'
          : 'Scan complete: no public health field found in public globals.';

        log('Read-only page scan completed.');
        log('Candidate state objects: ' + latestScan.stateCandidates.length + '.');

        reportBox.value = makeReport();
      } catch (error) {
        status.textContent = 'Scan failed: ' +
          (error && error.message ? error.message : 'unknown error');

        log('Scan failed: ' +
          (error && error.message ? error.message : 'unknown error'));
      }
    });

    copyButton.addEventListener('click', async function () {
      const report = makeReport();
      reportBox.value = report;

      try {
        if (
          !win.navigator ||
          !win.navigator.clipboard ||
          typeof win.navigator.clipboard.writeText !== 'function'
        ) {
          throw new Error('Clipboard API unavailable.');
        }

        await win.navigator.clipboard.writeText(report);
        status.textContent = 'Report copied.';
        log('Report copied to clipboard.');
      } catch (_) {
        reportBox.focus();
        reportBox.select();

        status.textContent =
          'Clipboard copy unavailable. Report selected below; press Ctrl+C.';

        log('Clipboard copy unavailable; report selected for manual copying.');
      }
    });

    clearButton.addEventListener('click', function () {
      events.length = 0;
      renderEvents();

      status.textContent =
        'Log cleared. Previous scan and Q result remain available in the report.';

      reportBox.value = makeReport();
    });

    log('Moo Macro standalone test library ' + VERSION + ' ready.');
    log(removed
      ? 'Removed ' + removed + ' Combat diagnostic card(s).'
      : 'No Combat diagnostic card found to remove.'
    );

    return true;
  }

  function autoAttach(win) {
    if (!win || !win.document) return false;
    if (mount(win)) return true;

    const doc = win.document;
    const Observer = win.MutationObserver;

    if (typeof Observer !== 'function' || !doc.documentElement) {
      return false;
    }

    const observer = new Observer(function () {
      if (mount(win)) observer.disconnect();
    });

    try {
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true
      });
      return true;
    } catch (_) {
      observer.disconnect();
      return false;
    }
  }

  return Object.freeze({
    version: VERSION,
    scanPage,
    formatReport,
    dispatchTestQ,
    removeCombatDiagnostic,
    mount,
    autoAttach
  });
});
