
/*
 * MooMacroLib.js
 * Moo Macro Connector
 * Version 0.1.0
 */
(function (window) {
    'use strict';

    const VERSION = '0.1.0';
    const API_EVENT = 'moomoo.js:api';

    let current = null;
    let pending = null;

    function makeConnector(game, loader) {
        function ready() {
            const transport = loader.active();
            return game.isReady() &&
                !!transport &&
                transport.ready === true &&
                transport.failed !== true;
        }

        function state() {
            const me = game.self;

            return {
                connected: ready(),
                alive: me.alive === true,
                sid: Number.isFinite(me.sid) && me.sid >= 0
                    ? me.sid : null,
                health: Number.isFinite(me.health)
                    ? me.health : null,
                items: Array.isArray(me.items)
                    ? me.items.slice() : [],
                weapons: Array.isArray(me.weapons)
                    ? me.weapons.slice() : [],
                weaponIndex: Number.isFinite(me.weaponIndex)
                    ? me.weaponIndex : null,
                direction: Number.isFinite(me.dir)
                    ? me.dir : 0
            };
        }

        function requireReady() {
            if (!ready()) {
                throw new Error('Game connection is not ready.');
            }
        }

        return Object.freeze({
            version: VERSION,

            isReady: ready,
            getState: state,

            onHealth(callback) {
                if (typeof callback !== 'function') {
                    throw new TypeError('callback must be a function');
                }

                return game.on('health', event => {
                    if (event && event.sid === game.self.sid) {
                        callback(state(), event);
                    }
                });
            },

            onInventory(callback) {
                if (typeof callback !== 'function') {
                    throw new TypeError('callback must be a function');
                }

                return game.on('inventory', event => {
                    callback(state(), event);
                });
            },

            onDeath(callback) {
                if (typeof callback !== 'function') {
                    throw new TypeError('callback must be a function');
                }

                return game.on('died', () => callback(state()));
            },

            selectFood(itemId) {
                requireReady();

                if (
                    !Number.isInteger(itemId) ||
                    !game.self.items.includes(itemId)
                ) {
                    throw new Error(
                        'Food item is not in inventory.'
                    );
                }

                return game.send.selectItem(itemId, false) === true;
            },

            setMouse(pressed, direction) {
                requireReady();

                if (typeof pressed !== 'boolean') {
                    throw new TypeError('pressed must be boolean');
                }

                const dir = Number.isFinite(direction)
                    ? direction
                    : state().direction;

                return game.send.mouse(pressed, dir) === true;
            },

            restoreWeapon() {
                requireReady();

                const weaponId = game.self.weaponIndex;

                if (!Number.isInteger(weaponId) || weaponId < 0) {
                    return false;
                }

                return game.send.selectItem(weaponId, true) === true;
            },

            whenReady(timeoutMs = 10000) {
                if (ready()) return Promise.resolve(state());

                return new Promise((resolve, reject) => {
                    const timer = window.setTimeout(
                        () => reject(
                            new Error('Timed out waiting for game connection.')
                        ),
                        timeoutMs
                    );

                    game.onReady(() => {
                        window.clearTimeout(timer);
                        resolve(state());
                    });
                });
            }
        });
    }

    function connect(timeoutMs = 5000) {
        if (current) return Promise.resolve(current);
        if (pending) return pending;

        pending = new Promise((resolve, reject) => {
            let finished = false;

            const timer = window.setTimeout(() => {
                if (finished) return;

                finished = true;
                pending = null;

                reject(new Error(
                    'No local MooMoo loader answered. ' +
                    'Start the local clone and its loader first.'
                ));
            }, timeoutMs);

            const detail = {
                resolve(game, loader) {
                    if (finished) return;

                    const valid =
                        game &&
                        game.self &&
                        game.send &&
                        typeof game.on === 'function' &&
                        typeof game.onReady === 'function' &&
                        typeof game.isReady === 'function' &&
                        typeof game.send.selectItem === 'function' &&
                        typeof game.send.mouse === 'function' &&
                        loader &&
                        typeof loader.active === 'function';

                    if (!valid) {
                        finished = true;
                        window.clearTimeout(timer);
                        pending = null;

                        reject(new Error(
                            'Required game APIs are missing.'
                        ));

                        return;
                    }

                    finished = true;
                    window.clearTimeout(timer);

                    current = makeConnector(game, loader);
                    resolve(current);
                }
            };

            window.dispatchEvent(
                new window.CustomEvent(API_EVENT, { detail })
            );
        });

        return pending;
    }

    window.MooMacroLib = Object.freeze({
        version: VERSION,
        connect
    });

})(window);
