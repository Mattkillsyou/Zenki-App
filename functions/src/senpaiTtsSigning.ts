/**
 * Shared HMAC signing for the Senpai TTS pipeline (audit E3 hardening).
 *
 * senpaiChat signs every SPEAK line it returns; senpaiSpeak refuses to
 * synthesize text that doesn't carry a valid, fresh signature. This closes
 * the remaining hole in the TTS endpoint: even with a valid Firebase token,
 * the only text the app's ElevenLabs key will ever voice is text the chat
 * model actually produced — for the same uid, within the freshness window.
 * Locking the voiceId (senpaiSpeak.ts) stopped "any voice"; this stops
 * "any text".
 *
 * Signature format (opaque to the client — it just echoes it back):
 *   v1.<issuedAtMs>.<hmacHex>
 *   hmacHex = HMAC-SHA256(secret, "v1\n<issuedAtMs>\n<uid>\n<canonicalText>")
 *
 * The MAC binds:
 *   - the CANONICAL text (trim → 300-char surrogate-safe cap → trim). Both
 *     the client (capTtsText in src/services/senpaiSpeak.ts) and the server
 *     truncate to 300 chars, and truncation can expose trailing whitespace —
 *     canonicalizing on BOTH the signing and verifying side means neither
 *     client-side truncation nor the server's own cap can break the match.
 *   - the uid, so user A can't replay user B's signed line.
 *   - the issue time, checked against MAX_SIGNATURE_AGE_MS at verify.
 *
 * Secret: the SENPAI_TTS_SIGNING_SECRET Cloud Secret defined below. It is
 * exported from here (single definition) and listed in the `secrets` array
 * of BOTH senpaiChat and senpaiSpeak. Create it once with:
 *
 *   openssl rand -hex 32 | firebase functions:secrets:set SENPAI_TTS_SIGNING_SECRET --data-file=-
 *
 * Rotating it invalidates in-flight signatures for at most
 * MAX_SIGNATURE_AGE_MS — harmless, the next chat turn mints a fresh one.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { defineSecret } from 'firebase-functions/params';

// Defined ONCE here and shared — defining the same param in two modules
// makes the params registry throw at load time.
export const SENPAI_TTS_SIGNING_SECRET = defineSecret('SENPAI_TTS_SIGNING_SECRET');

// Hard cap on synthesized text. Single source of truth for both functions;
// mirrors MAX_TTS_CHARS in src/services/senpaiSpeak.ts (client). See the
// cost rationale in senpaiSpeak.ts (audit E3; was 1500).
export const MAX_TTS_TEXT_CHARS = 300;

// How long a signature stays valid. TTS fires immediately after the chat
// reply lands, so this only needs to cover a slow device / brief app
// background between the two calls. Replays inside the window re-voice
// text the model genuinely produced (and still consume budget) — harmless.
export const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;

// Tolerated clock skew for "issued in the future" — both timestamps come
// from GCP servers, so anything past a minute is a forged/corrupt value.
const MAX_FUTURE_SKEW_MS = 60 * 1000;

const SIG_VERSION = 'v1';

/**
 * Normalize text to the exact form that gets signed AND synthesized:
 * trim, cap at MAX_TTS_TEXT_CHARS without splitting a surrogate pair
 * (emoji), trim again (the cut can expose trailing whitespace).
 * Idempotent, and stable across the client's own capTtsText truncation.
 */
export function canonicalTtsText(raw: string): string {
  let text = (raw ?? '').trim();
  if (text.length > MAX_TTS_TEXT_CHARS) {
    let cut = text.slice(0, MAX_TTS_TEXT_CHARS);
    const lastUnit = cut.charCodeAt(cut.length - 1);
    if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) cut = cut.slice(0, -1);
    text = cut.trim();
  }
  return text;
}

/** Mint a signature for a canonical SPEAK line. `canonicalText` MUST already
 *  be the output of canonicalTtsText(). */
export function signSpeakText(
  canonicalText: string,
  uid: string,
  secret: string,
  issuedAtMs: number = Date.now(),
): string {
  const mac = createHmac('sha256', secret)
    .update(`${SIG_VERSION}\n${issuedAtMs}\n${uid}\n${canonicalText}`, 'utf8')
    .digest('hex');
  return `${SIG_VERSION}.${issuedAtMs}.${mac}`;
}

export type SpeakSignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Verify a signature against the canonical text + uid. Constant-time MAC
 * compare; freshness enforced via the embedded issue timestamp.
 */
export function verifySpeakSignature(
  canonicalText: string,
  uid: string,
  signature: unknown,
  secret: string,
  nowMs: number = Date.now(),
): SpeakSignatureCheck {
  if (typeof signature !== 'string' || signature.length === 0) {
    return { ok: false, reason: 'missing signature' };
  }
  const parts = signature.split('.');
  if (parts.length !== 3 || parts[0] !== SIG_VERSION) {
    return { ok: false, reason: 'malformed signature' };
  }
  const issuedAtMs = Number(parts[1]);
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false, reason: 'malformed signature timestamp' };
  }
  if (nowMs - issuedAtMs > MAX_SIGNATURE_AGE_MS) {
    return { ok: false, reason: 'signature expired' };
  }
  if (issuedAtMs - nowMs > MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: 'signature timestamp in the future' };
  }
  const expected = signSpeakText(canonicalText, uid, secret, issuedAtMs);
  const got = Buffer.from(signature, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch; length alone leaks nothing
  // useful (the format is public).
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
