
/*
 * MooMacroLib.js — Moo Macro Auto-Heal
 * Version 0.3.0
 *
 * Independent of MooMod and MooMoo.js.
 *
 * Requires a game adapter that provides:
 *   getSnapshot() -> { health, alive, foodAvailable? }
 *
 * Optional adapter functions:
 *   onHealthChange(callback) -> unsubscribe function
 *   selectFood()
 *   eat()
 *   restoreWeapon()
 *   isFoodConsumed(before, after)
 *
 * No private network protocol interception or decoding.
 */
(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MooMacroLib = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.3.0';

  const SETTINGS = Object.freeze({
    healBelow: 100,
    verifyTimeoutMs: 700,
    verifyEveryMs: 20,
    retryDelayMs: 75,
    pollEveryMs: 50
  });

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function validHealth(value) {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
    );
  }

  function isTypingTarget(element) {
    if (!element) return false;

    const tag = String(element.tagName || '').toLowerCase();

    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      element.isContentEditable === true
    );
  }

  /*
   * Normal browser keyboard events.
   * Synthetic events have isTrusted=false and may be ignored by the game.
   */
  function createKeyboardInput(win) {
    if (
      !win ||
      !win.document ||
      typeof win.KeyboardEvent !== 'function'
    ) {
      throw new TypeError(
        'A browser window with KeyboardEvent support is required.'
      );
    }

    function press(keyName) {
      const normalized = String(keyName || '').toLowerCase();

      const key = normalized === 'space' ? ' ' : normalized;

      if (key !== 'q' && key !== ' ') {
        throw new TypeError('Only Q and Space are supported.');
      }

      const doc = win.document;
      const active = doc.activeElement;

      if (isTypingTarget(active)) return false;

      const target =
        active && active.dispatchEvent
          ? active
          : (doc.body || doc.documentElement || doc);

      if (!target || typeof target.dispatchEvent !== 'function') {
        return false;
      }

      const code = key === ' ' ? 'Space' : 'KeyQ';
      const keyCode = key === ' ' ? 32 : 81;

      const init = {
        key,
        code,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
        repeat: false
      };

      try {
        target.dispatchEvent(
          new win.KeyboardEvent('keydown', init)
        );

        target.dispatchEvent(
          new win.KeyboardEvent('keyup', init)
        );

        return true;
      } catch (_) {
        return false;
      }
    }

    return Object.freeze({
      press,
      selectFood: () => press('q'),
      eat: () => press('space'),
      restoreWeapon: () => press('q')
    });
  }

  class AutoHeal {
    constructor(game) {
      if (!game || typeof game.getSnapshot !== 'function') {
        throw new TypeError(
          'Game adapter must provide getSnapshot().'
        );
      }

      this.game = game;
      this.options = SETTINGS;

      this.input =
        game.input ||
        (
          typeof window !== 'undefined'
            ? createKeyboardInput(window)
            : null
        );

      this.selectFood =
        typeof game.selectFood === 'function'
          ? () => game.selectFood()
          : () => this.input && this.input.selectFood();

      this.eat =
        typeof game.eat === 'function'
          ? () => game.eat()
          : () => this.input && this.input.eat();

      this.restoreWeapon =
        typeof game.restoreWeapon === 'function'
          ? () => game.restoreWeapon()
          : () => this.input && this.input.restoreWeapon();

      if (
        !this.input &&
        (
          typeof game.selectFood !== 'function' ||
          typeof game.eat !== 'function' ||
          typeof game.restoreWeapon !== 'function'
        )
      ) {
        throw new TypeError(
          'Provide browser input or all three game actions.'
        );
      }

      this.enabled = false;
      this.busy = false;
      this.destroyed = false;

      this.pollTimer = null;
      this.unsubscribe = null;
      this.retryTimer = null;

      this.listeners = new Set();
      this.lastStatus = 'idle';
    }

    onStatus(callback) {
      if (typeof callback !== 'function') {
        throw new TypeError(
          'Status callback must be a function.'
        );
      }

      this.listeners.add(callback);

      return () => this.listeners.delete(callback);
    }

    emit(status, details) {
      this.lastStatus = status;

      const event = {
        status,
        details: details || null,
        enabled: this.enabled,
        busy: this.busy
      };

      this.listeners.forEach(callback => {
        try {
          callback(event);
        } catch (_) {
          // UI listeners cannot interrupt healing.
        }
      });
    }

    start() {
      if (this.destroyed) {
        throw new Error('Auto-Heal has been destroyed.');
      }

      if (this.enabled) return;

      this.enabled = true;
      this.emit('enabled');

      // Prefer health-change events for faster reaction.
      if (typeof this.game.onHealthChange === 'function') {
        try {
          this.unsubscribe =
            this.game.onHealthChange(() => this.check());
        } catch (error) {
          this.emit('adapter-error', {
            stage: 'onHealthChange',
            message: error.message
          });
        }
      }

      // Poll only when no working event subscription exists.
      if (typeof this.unsubscribe !== 'function') {
        this.pollTimer = setInterval(
          () => this.check(),
          this.options.pollEveryMs
        );
      }

      this.check();
    }

    stop() {
      if (!this.enabled) return;

      this.enabled = false;

      if (this.pollTimer !== null) {
        clearInterval(this.pollTimer);
      }

      if (this.retryTimer !== null) {
        clearTimeout(this.retryTimer);
      }

      this.pollTimer = null;
      this.retryTimer = null;

      if (typeof this.unsubscribe === 'function') {
        try {
          this.unsubscribe();
        } catch (_) {}
      }

      this.unsubscribe = null;
      this.emit('disabled');
    }

    setEnabled(value) {
      if (value) {
        this.start();
      } else {
        this.stop();
      }
    }

    getStatus() {
      return {
        enabled: this.enabled,
        busy: this.busy,
        destroyed: this.destroyed,
        lastStatus: this.lastStatus
      };
    }

    check() {
      if (!this.enabled || this.busy || this.destroyed) {
        return;
      }

      let state;

      try {
        state = this.game.getSnapshot();
      } catch (error) {
        this.emit('adapter-error', {
          stage: 'getSnapshot',
          message: error.message
        });

        return;
      }

      if (
        !state ||
        state.alive !== true ||
        !validHealth(state.health) ||
        state.health >= this.options.healBelow
      ) {
        return;
      }

      if (state.foodAvailable === false) {
        this.emit('no-food');
        return;
      }

      // Lock immediately to prevent overlapping attempts.
      this.busy = true;

      this.runHeal(state);
    }

    async runHeal(before) {
      let selected = false;
      let consumed = false;
      let error = null;

      try {
        this.emit('selecting-food', {
          health: before.health
        });

        const selectResult = await this.selectFood();

        if (selectResult === false) {
          throw new Error(
            'Food selection input was rejected.'
          );
        }

        selected = true;

        // No artificial delay between Q and Space.
        const eatResult = await this.eat();

        if (eatResult === false) {
          throw new Error(
            'Eat input was rejected.'
          );
        }

        this.emit('checking-consumption');

        const until =
          Date.now() + this.options.verifyTimeoutMs;

        while (Date.now() < until) {
          await wait(this.options.verifyEveryMs);

          const after = this.game.getSnapshot();

          if (this.foodWasConsumed(before, after)) {
            consumed = true;
            break;
          }
        }
      } catch (caught) {
        error = caught;
      }

      /*
       * Successful consumption:
       * Do not press Q again.
       *
       * Failed consumption:
       * Press Q to restore the previous weapon.
       */
      if (selected && !consumed) {
        try {
          const restoreResult =
            await this.restoreWeapon();

          if (restoreResult === false) {
            throw new Error(
              'Weapon restore input was rejected.'
            );
          }
        } catch (restoreError) {
          if (!error) error = restoreError;
        }
      }

      this.busy = false;

      if (error) {
        this.emit('action-error', {
          message: error.message,
          consumed
        });
      } else {
        this.emit(
          consumed
            ? 'food-consumed'
            : 'food-not-consumed'
        );
      }

      if (this.enabled && !this.destroyed) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.check();
        }, this.options.retryDelayMs);
      }
    }

    foodWasConsumed(before, after) {
      if (!after) return false;

      if (typeof this.game.isFoodConsumed === 'function') {
        try {
          if (
            this.game.isFoodConsumed(before, after) === true
          ) {
            return true;
          }
        } catch (_) {
          // Fall back to health increase.
        }
      }

      return (
        validHealth(after.health) &&
        after.health > before.health
      );
    }

    destroy() {
      this.stop();
      this.destroyed = true;
      this.listeners.clear();
    }
  }

  return Object.freeze({
    version: VERSION,
    createKeyboardInput,
    createAutoHeal: game => new AutoHeal(game)
  });
});
