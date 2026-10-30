
/* MooMacroLib.js
 * Moo Macro - Simple Auto-Heal
 * Version 0.1.0
 */
(function (window) {
    'use strict';

    let enabled = false;
    let busy = false;
    let timer = null;
    let unsubscribe = null;
    let getHealth = null;
    let nextAttempt = 0;

    const delay = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    function pressKey(key) {
        const doc = window.document;
        const active = doc.activeElement;

        if (
            active &&
            /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
        ) return false;

        const target = active || doc.body;
        if (!target) return false;

        const space = key === ' ';
        const options = {
            key: space ? ' ' : 'q',
            code: space ? 'Space' : 'KeyQ',
            keyCode: space ? 32 : 81,
            which: space ? 32 : 81,
            bubbles: true,
            cancelable: true
        };

        target.dispatchEvent(
            new window.KeyboardEvent('keydown', options)
        );
        target.dispatchEvent(
            new window.KeyboardEvent('keyup', options)
        );

        return true;
    }

    async function checkHealth() {
        if (!enabled || busy || Date.now() < nextAttempt) return;

        let health;

        try {
            health = Number(getHealth());
        } catch (_) {
            return;
        }

        if (!Number.isFinite(health) || health < 0 || health >= 100) {
            return;
        }

        busy = true;

        const startingHealth = health;
        let selectedFood = false;
        let healed = false;

        try {
            // Q: Select food
            selectedFood = pressKey('q');
            if (!selectedFood) return;

            // Space: Eat
            if (!pressKey(' ')) return;

            // Wait only for confirmation, not before eating.
            const deadline = Date.now() + 700;

            while (Date.now() < deadline) {
                await delay(25);

                const currentHealth = Number(getHealth());

                if (
                    Number.isFinite(currentHealth) &&
                    currentHealth > startingHealth
                ) {
                    healed = true;
                    break;
                }
            }
        } catch (_) {
            // Failed attempt: restore the previous weapon.
        } finally {
            // Only restore if food was NOT consumed.
            if (selectedFood && !healed) {
                pressKey('q');
            }

            nextAttempt = Date.now() + (healed ? 150 : 400);
            busy = false;
        }
    }

    function start(healthReader, healthSubscription) {
        stop();

        if (typeof healthReader !== 'function') {
            throw new Error('A real health reader is required.');
        }

        getHealth = healthReader;
        enabled = true;

        // Prefer immediate health-change events.
        if (typeof healthSubscription === 'function') {
            try {
                unsubscribe = healthSubscription(checkHealth);
            } catch (_) {
                unsubscribe = null;
            }
        }

        // Fallback when health events are unavailable.
        if (typeof unsubscribe !== 'function') {
            timer = window.setInterval(checkHealth, 25);
        }

        checkHealth();
    }

    function stop() {
        enabled = false;

        if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }

        if (typeof unsubscribe === 'function') {
            unsubscribe();
            unsubscribe = null;
        }
    }

    window.MooMacroLib = {
        version: '0.1.0',
        start,
        stop
    };

})(window);
