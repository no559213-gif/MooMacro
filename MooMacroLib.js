/*
 * MooMacroLib.js — standalone, read-only page scanner for Moo Macro.
 * Version: 0.4.0
 *
 * Purpose:
 *   Inventory public page globals and visible game-page assets so we can
 *   determine whether the official page exposes a usable state interface.
 *
 * Safety / scope:
 *   - Does NOT require MooMod or MooMoo.js.
 *   - Does NOT invoke game helpers or read their function source.
 *   - Does NOT invoke game-page global getters; globals are inspected via
 *     own property descriptors only.
 *   - Does NOT inspect WebSocket objects, frames, packets, or socket traffic.
 *   - Lists already-loaded script URL metadata, but never fetches script bodies.
 *   - Does NOT dispatch keyboard/mouse events or send game actions.
 */
(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MooMacroLib = api;
    if (root && root.document) api.autoAttach(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.4.0';
  const ROOT_ID = 'moo-macro-root';
  const CARD_ID = 'moo-macro-standalone-scan';

  const GLOBAL_HINT =
    /(?:moomoo|game|player|health|inventory|items|weapons|self|state|store)/i;

  const STATE_FIELD =
    /^(?:health|hp|alive|sid|items|weapons|inventory|weaponIndex|weapon|food)$/i;

  const HELPER_NAMES = [
    'storeEquip',
    'storeBuy',
    'follmoo',
    'showItemInfo',
    'changeStoreIndex'
  ];

  function ownNames(value) {
    try {
      return Object.getOwnPropertyNames(value);
    } catch (_) {
      return [];
    }
  }

  function ownDescriptor(value, key) {
    try {
      return Object.getOwnPropertyDescriptor(value, key);
    } catch (_) {
      return null;
    }
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

    if (typeof value === 'string') {
      return JSON.stringify(value.slice(0, 80));
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return '[array length ' + value.length + ']';
    }

    if (typeof value === 'function') return '[function]';
    if (typeof value === 'object') return '[object]';

    return String(value);
  }

  function readStateFields(objectValue) {
    const found = [];
    let names;

    try {
      names = ownNames(objectValue);
    } catch (_) {
      return found;
    }

    names.slice(0, 100).forEach(function (field) {
      if (!STATE_FIELD.test(field)) return;

      const descriptor = ownDescriptor(objectValue, field);
      if (!descriptor) return;

      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        found.push({
          name: field,
          value: '[accessor not invoked]'
        });
        return;
      }

      found.push({
        name: field,
        value: safeValue(descriptor.value)
      });
    });

    return found;
  }

  function listScripts(win) {
    const found = [];
    const seen = new Set();

    try {
      Array.from(win.document.scripts || []).forEach(function (script) {
        if (!script || !script.src) return;

        let src = String(script.src);

        try {
          const parsed = new URL(
            src,
            win.location && win.location.href || 'https://moomoo.io/'
          );

          src = parsed.origin + parsed.pathname;
        } catch (_) {}

        if (!seen.has(src)) {
          seen.add(src);
          found.push(src);
        }
      });
    } catch (_) {}

    // Lists URLs for already-loaded JavaScript resources only.
    // It does not make requests or read response bodies.
    try {
      const entries =
        win.performance && win.performance.getEntriesByType
          ? win.performance.getEntriesByType('resource')
          : [];

      Array.from(entries || []).forEach(function (entry) {
        let name = String(entry && entry.name || '');

        if (!/\.m?js(?:[?#]|$)|\/p\/[^/?#]+\.js(?:[?#]|$)/i.test(name)) {
          return;
        }

        try {
          const parsed = new URL(
            name,
            win.location && win.location.href || 'https://moomoo.io/'
          );

          name = parsed.origin + parsed.pathname;
        } catch (_) {}

        if (!seen.has(name)) {
          seen.add(name);
          found.push(name);
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
    const hostname =
      (win.location && win.location.hostname) || 'unknown';

    let page = 'unknown';

    try {
      page = win.location
        ? String(win.location.protocol || 'https:') +
          '//' +
          hostname +
          String(win.location.pathname || '/')
        : 'unknown';
    } catch (_) {}

    const isMooMooHost = /(^|\.)moomoo\.io$/i.test(hostname);

    let canvases = [];
    let globalNames = [];
    let scriptUrls = [];

    try {
      canvases = Array.from(doc.querySelectorAll('canvas')).map(
        function (canvas, index) {
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
            index: index,
            id: canvas.id || '',
            width: Number(canvas.width) || 0,
            height: Number(canvas.height) || 0,
            rect: rect
          };
        }
      );
    } catch (_) {}

    try {
      globalNames = ownNames(win);
    } catch (_) {}

    try {
      scriptUrls = listScripts(win);
    } catch (_) {}

    const publicGlobals = [];
    const stateCandidates = [];

    globalNames
      .filter(function (name) {
        return (
          GLOBAL_HINT.test(name) &&
          !/(?:socket|websocket|\bws\b|network|transport)/i.test(name)
        );
      })
      .slice(0, 120)
      .forEach(function (name) {
        const descriptor = ownDescriptor(win, name);
        if (!descriptor) return;

        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          publicGlobals.push({
            name: name,
            type: 'accessor (not invoked)'
          });

          return;
        }

        const value = descriptor.value;

        publicGlobals.push({
          name: name,
          type: describeValue(value)
        });

        if (STATE_FIELD.test(name)) {
          stateCandidates.push({
            name: 'window.' + name,
            fields: [{
              name: name,
              value: safeValue(value)
            }]
          });

          return;
        }

        if (
          !value ||
          typeof value !== 'object' ||
          !/(?:moo|game|player|self|state|inventory|items|weapons)/i.test(name)
        ) {
          return;
        }

        const fields = readStateFields(value);

        if (fields.length) {
          stateCandidates.push({
            name: name,
            fields: fields
          });
        }
      });

    const helpers = HELPER_NAMES.map(function (name) {
      const descriptor = ownDescriptor(win, name);

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return {
          name: name,
          available: false,
          type: descriptor
            ? 'accessor (not invoked)'
            : 'not exposed'
        };
      }

      return {
        name: name,
        available: typeof descriptor.value === 'function',
        type: describeValue(descriptor.value)
      };
    });

    let diedTextFound = false;
    let gameCanvasFound = false;

    try {
      diedTextFound = !!doc.querySelector('#diedText');
    } catch (_) {}

    try {
      gameCanvasFound = !!doc.querySelector('#gameCanvas');
    } catch (_) {}

    const hasHealthField = stateCandidates.some(function (candidate) {
      return candidate.fields.some(function (field) {
        return /^(health|hp)$/i.test(field.name);
      });
    });

    return {
      libraryVersion: VERSION,
      page: page,
      hostname: hostname,
      officialHostMatch: isMooMooHost,
      readyState: doc.readyState || 'unknown',

      dom: {
        canvasCount: canvases.length,
        canvases: canvases,
        gameCanvasFound: gameCanvasFound,
        diedTextFound: diedTextFound
      },

      scriptUrls: scriptUrls,
      publicGlobals: publicGlobals,
      stateCandidates: stateCandidates,
      knownHelpers: helpers,
      publicHealthFieldFound: hasHealthField,

      checks: {
        providerHandshakeAttempted: false,
        gameHelpersInvoked: false,
        gameActionsSent: false,
        socketTrafficInspected: false,
        networkRequestsInitiated: false,
        loadedScriptUrlMetadataListed: true,
        scriptBodiesFetched: false
      }
    };
  }

  function formatReport(report) {
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
      'Canvas count: ' +
        ((report.dom && report.dom.canvasCount) || 0),
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
        '  ' +
          helper.name +
          ': ' +
          (helper.available ? 'function exposed' : helper.type)
      );
    });

    lines.push('', 'MATCHING PUBLIC WINDOW PROPERTIES');

    (report.publicGlobals || []).forEach(function (item) {
      lines.push('  ' + item.name + ': ' + item.type);
    });

    lines.push(
      '',
      'ALREADY-LOADED JAVASCRIPT URLS (NO FILES FETCHED)'
    );

    (report.scriptUrls || []).forEach(function (url) {
      lines.push('  ' + url);
    });

    lines.push(
      '',
      'SAFETY CHECKS',
      'Provider handshake attempted: NO',
      'Game helpers invoked: NO',
      'Game actions sent: NO',
      'Socket frames / packet traffic inspected: NO',
      'New network requests initiated: NO',
      'Already-loaded script URL metadata listed: YES',
      'Script source files fetched: NO',
      '',
      report.publicHealthFieldFound
        ? 'Result: A public health-like field was found. It still needs careful validation before any feature can rely on it.'
        : 'Result: No public player-health field was found in the inspected page globals. This scan cannot access module-private state.'
    );

    return lines.join('\n');
  }

  function removeCombatDiagnostic(shadow) {
    const pane = shadow &&
      shadow.querySelector('[data-pane="combat"]');

    if (!pane) return 0;

    const targets = new Set();

    const matches = Array.from(pane.querySelectorAll('*')).filter(
      function (element) {
        const text = String(element.textContent || '').trim();
        const isButton =
          String(element.tagName || '').toLowerCase() === 'button';

        return (
          (isButton && /diagnostic|connection test|page scan/i.test(text)) ||
          (
            !element.children.length &&
            /diagnostic section|connection diagnostic/i.test(text)
          )
        );
      }
    );

    matches.forEach(function (element) {
      let node = element;
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

      targets.add(card || element);
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

    const oldMarked = logsPane.querySelectorAll(
      '[data-moo-macro-connection-card], ' +
      '#moo-macro-connection-card, ' +
      '.moo-macro-connection-card'
    );

    Array.from(oldMarked).forEach(function (node) {
      node.remove();
    });

    const oldButton = Array.from(
      logsPane.querySelectorAll('button')
    ).find(function (button) {
      return /^check connection$/i.test(
        String(button.textContent || '').trim()
      );
    });

    if (oldButton) {
      const card =
        oldButton.closest('.stat, article, fieldset, [data-card]') ||
        oldButton.parentElement;

      if (card && logsPane.contains(card)) {
        card.remove();
      }
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

    if (shadow.getElementById && shadow.getElementById(CARD_ID)) {
      return true;
    }

    if (shadow.querySelector('#' + CARD_ID)) {
      return true;
    }

    const removed = removeCombatDiagnostic(shadow);

    removeOldConnectionCard(logsPane);

    const card = makeElement(doc, 'div', 'stat');
    card.id = CARD_ID;
    card.setAttribute('data-moo-macro-standalone-scan', 'true');

    const style = makeElement(doc, 'style');

    style.textContent = [
      '#' + CARD_ID + '{margin-top:10px}',
      '#' + CARD_ID + ' .mm-scan-title{font-weight:700;margin-bottom:5px}',
      '#' + CARD_ID + ' .mm-scan-note{font-size:11px;color:#aebbd0;margin:5px 0 9px}',
      '#' + CARD_ID + ' .mm-scan-actions{display:flex;gap:7px;margin:7px 0}',
      '#' + CARD_ID + ' .mm-scan-actions button{flex:1;min-width:0}',
      '#' + CARD_ID + ' .mm-scan-status{font-size:11px;color:#f6cd75;min-height:16px;margin:5px 0}',
      '#' + CARD_ID + ' .mm-scan-log{max-height:105px;overflow:auto;background:#0b1220;border:1px solid #334155;border-radius:7px;padding:6px;font-size:11px}',
      '#' + CARD_ID + ' .mm-scan-log div{padding:3px 0;border-bottom:1px solid #263449;overflow-wrap:anywhere}',
      '#' + CARD_ID + ' .mm-scan-report{display:block;width:100%;height:105px;margin-top:7px;resize:vertical;background:#0b1220;color:#e5edf8;border:1px solid #334155;border-radius:7px;padding:6px;font:10px/1.35 monospace}'
    ].join('\n');

    const title = makeElement(
      doc,
      'div',
      'mm-scan-title',
      'Standalone page scan'
    );

    const note = makeElement(
      doc,
      'p',
      'mm-scan-note',
      'Read-only check for public page state. No MooMod, game inputs, helper calls, or network inspection.'
    );

    const actions = makeElement(doc, 'div', 'mm-scan-actions');

    const scanButton = makeElement(doc, 'button', '', 'Scan page');
    const copyButton = makeElement(doc, 'button', '', 'Copy report');
    const clearButton = makeElement(doc, 'button', '', 'Clear log');

    copyButton.disabled = false;

    actions.append(scanButton, copyButton, clearButton);

    const status = makeElement(
      doc,
      'div',
      'mm-scan-status',
      'Ready. No scan has been run yet.'
    );

    const reportBox = makeElement(
      doc,
      'textarea',
      'mm-scan-report'
    );

    reportBox.readOnly = true;
    reportBox.setAttribute(
      'aria-label',
      'Standalone page scan report'
    );
    reportBox.placeholder = 'The scan report will appear here.';

    const eventLog = makeElement(doc, 'div', 'mm-scan-log');

    card.append(
      style,
      title,
      note,
      actions,
      status,
      reportBox,
      eventLog
    );

    logsPane.appendChild(card);

    let latestReport = '';
    const events = [];

    function renderEvents() {
      eventLog.replaceChildren();

      if (!events.length) {
        eventLog.textContent = 'No events yet.';
        return;
      }

      events.slice(-30).forEach(function (entry) {
        const row = makeElement(
          doc,
          'div',
          '',
          '[' + entry.time + '] ' + entry.message
        );

        eventLog.appendChild(row);
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

    function fullReport() {
      const parts = [
        latestReport ||
          [
            'MOO MACRO — STANDALONE READ-ONLY PAGE SCAN',
            'Library: ' + VERSION,
            'No scan has been run yet.'
          ].join('\n')
      ];

      parts.push('', 'EVENT LOG');

      if (!events.length) {
        parts.push('(empty)');
      } else {
        events.forEach(function (entry) {
          parts.push(
            '[' + entry.time + '] ' + entry.message
          );
        });
      }

      return parts.join('\n');
    }

    scanButton.addEventListener('click', function () {
      try {
        const report = scanPage(win);

        latestReport = formatReport(report);
        reportBox.value = latestReport;

        const candidateCount = report.stateCandidates.length;

        status.textContent = report.publicHealthFieldFound
          ? 'Scan complete: a public health-like field was found. Validation is still needed.'
          : 'Scan complete: no public health field found in public globals.';

        log('Read-only page scan completed.');
        log('Candidate state objects: ' + candidateCount + '.');
        log('No game actions or network inspection occurred.');
      } catch (error) {
        status.textContent =
          'Scan failed: ' +
          (error && error.message ? error.message : 'unknown error');

        log(
          'Scan failed: ' +
          (error && error.message ? error.message : 'unknown error')
        );
      }
    });

    copyButton.addEventListener('click', async function () {
      const report = fullReport();
      reportBox.value = report;

      try {
        if (
          !win.navigator ||
          !win.navigator.clipboard ||
          typeof win.navigator.clipboard.writeText !== 'function'
        ) {
          throw new Error(
            'Clipboard API is unavailable. The report is shown in the text box.'
          );
        }

        await win.navigator.clipboard.writeText(report);

        status.textContent = 'Report copied.';
        log('Report copied to clipboard.');
      } catch (error) {
        reportBox.focus();
        reportBox.select();

        status.textContent =
          'Copy unavailable. The report is selected below; press Ctrl+C.';

        log(
          'Clipboard copy unavailable; report selected for manual copying.'
        );
      }
    });

    clearButton.addEventListener('click', function () {
      events.length = 0;
      renderEvents();
      status.textContent = 'Log cleared.';
    });

    log('Moo Macro standalone scanner ' + VERSION + ' ready.');

    if (removed) {
      log('Removed ' + removed + ' Combat diagnostic card(s).');
    } else {
      log('No Combat diagnostic card found to remove.');
    }

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
    scanPage: scanPage,
    formatReport: formatReport,
    removeCombatDiagnostic: removeCombatDiagnostic,
    mount: mount,
    autoAttach: autoAttach
  });
});
