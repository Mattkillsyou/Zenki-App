/**
 * Client-side objectionable-content gate.
 *
 * Apple App Store Guideline 1.2 requires UGC apps to provide "a method for
 * filtering objectionable content". This is that method's first line: a
 * synchronous, zero-latency, zero-cost screen run at every create site (post,
 * text post, comment, direct message, bio) BEFORE the write.
 *
 * It blocks slurs, explicit sexual content, and threats of violence, with light
 * normalization to defeat the most common evasions (l33t-speak and
 * separator-spacing like "n i g g e r"). Matching is **word-boundary anchored**
 * so it never flags innocent words that merely contain a fragment of a term
 * ("grape"⊃"rape", "therapist"⊃"rapist", "spicy"⊃"spic"). It is NOT a substitute
 * for the report → admin-review → remove pipeline (which handles the long tail
 * within the ≤24h SLA); it is the proactive pre-publish filter Apple asks for.
 *
 * Server-side re-screening in a Cloud Function (so the filter can't be bypassed
 * by a patched client) is a Wave 2 hardening — see SOCIAL_CONTRACT.md §6.
 */

export interface FilterResult {
  ok: boolean;
  /** User-facing explanation when ok === false. */
  reason?: string;
  /** The category that tripped, for logging/telemetry (never shown raw text). */
  category?: 'hate' | 'sexual' | 'violence' | 'harassment';
}

// Severe terms grouped by category. Stored space-free; matched as whole "words"
// allowing optional separators between letters (so "n i g g e r" is caught) but
// anchored at word boundaries (so "therapist" is NOT). The report/admin pipeline
// catches the long tail this intentionally narrow list misses.
const BLOCKLIST: Record<NonNullable<FilterResult['category']>, string[]> = {
  // Slurs / hate. (Deliberately omits terms with very common benign homographs
  // — e.g. "chink" as in "chink in the armor", "lynch" as a surname — to avoid
  // false positives; the report→admin pipeline covers contextual misses.)
  hate: [
    'nigger', 'nigga', 'faggot', 'kike', 'tranny',
    'spic', 'wetback', 'gook', 'coon',
  ],
  // Explicit sexual content / solicitation / CSAM.
  sexual: [
    'rape', 'rapist', 'childporn', 'pedophile', 'molest',
    'bestiality', 'incest',
  ],
  // Credible threats / violence.
  violence: [
    'killyourself', 'iwillkillyou', 'shootupthe', 'bombthe', 'gasthe',
  ],
  // Targeted harassment (kept narrow).
  harassment: [],
};

const CATEGORY_MESSAGE: Record<NonNullable<FilterResult['category']>, string> = {
  hate: 'This contains hate speech or a slur. Zenki has zero tolerance for objectionable content.',
  sexual: 'This contains explicit or sexual content that isn’t allowed.',
  violence: 'This contains threats or violent content that isn’t allowed.',
  harassment: 'This looks like harassment, which isn’t allowed.',
};

/** Map the most common leet substitutions back to letters, lowercased. */
function deleet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't');
}

function escapeRe(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cache compiled matchers — the list is static, so build each regex once.
const TERM_MATCHERS: Array<{ re: RegExp; category: NonNullable<FilterResult['category']> }> = [];
for (const category of Object.keys(BLOCKLIST) as Array<NonNullable<FilterResult['category']>>) {
  for (const term of BLOCKLIST[category]) {
    // Each letter, separated by ZERO OR MORE separators (space . _ * -), and the
    // whole thing anchored at word boundaries. Catches "nigger", "n i g g e r",
    // and "kill yourself" — but never a fragment inside another word.
    const body = term.split('').map(escapeRe).join('[\\s._*\\-]*');
    TERM_MATCHERS.push({
      re: new RegExp('(^|[^a-z0-9])' + body + '([^a-z0-9]|$)'),
      category,
    });
  }
}

/**
 * Screen a piece of user text. Returns { ok: true } when it passes, or
 * { ok: false, reason, category } when it trips a blocked term.
 */
export function screenText(text: string): FilterResult {
  if (!text || !text.trim()) return { ok: true };
  const norm = deleet(text);
  for (const { re, category } of TERM_MATCHERS) {
    if (re.test(norm)) {
      return { ok: false, reason: CATEGORY_MESSAGE[category], category };
    }
  }
  return { ok: true };
}

/**
 * Throwing variant for service layers (firebasePosts/Messages, etc.). Throws
 * `Error('content-blocked: <reason>')` so callers can surface the reason and
 * abort the write. Catch and show `err.message.replace('content-blocked: ','')`.
 */
export function assertCleanText(text: string): void {
  const result = screenText(text);
  if (!result.ok) {
    throw new Error(`content-blocked: ${result.reason ?? 'This content isn’t allowed.'}`);
  }
}
