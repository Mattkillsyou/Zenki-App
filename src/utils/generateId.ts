/**
 * Cryptographically random UUID generation.
 * Falls back to timestamp+random when expo-crypto is unavailable.
 */

let _useExpoCrypto = false;
let _randomUUID: (() => string) | null = null;

try {
  // Dynamic import attempt — expo-crypto may not be installed
  const Crypto = require('expo-crypto');
  if (Crypto && typeof Crypto.randomUUID === 'function') {
    _randomUUID = Crypto.randomUUID;
    _useExpoCrypto = true;
  }
} catch {
  // expo-crypto not available — use fallback
}

/**
 * Generate a unique ID. Uses expo-crypto randomUUID when available,
 * otherwise falls back to a high-entropy timestamp+random combo.
 */
export function generateId(prefix: string = ''): string {
  if (_useExpoCrypto && _randomUUID) {
    const uuid = _randomUUID();
    return prefix ? `${prefix}_${uuid}` : uuid;
  }
  // Fallback: timestamp(base36) + 8 random chars for ~2.8 trillion combos
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 6);
  const id = `${ts}${rand}${rand2}`;
  return prefix ? `${prefix}_${id}` : id;
}
