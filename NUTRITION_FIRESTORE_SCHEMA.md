# Nutrition Firestore Schema & Migration Contract

Source-of-truth design for moving the four nutrition data slices
— **weight log, macro/food log, macro goals, BMR/TDEE profile** —
out of client-only AsyncStorage and into Firestore, so that either
side (the on-device `NutritionContext` **or** a server-side Admin-SDK
Senpai tool) can write and the other side sees it.

Status: **DESIGN — not yet implemented.** No collection, rules, or
client wiring exists for nutrition yet (verified: `firestore.rules`
has no nutrition blocks; `src/` has no `collection(db, 'weight'|…)`
calls; all reads/writes go through `AsyncStorage` in
[NutritionContext.tsx](src/context/NutritionContext.tsx)).

---

## 0. The decision in one line

**Partition every nutrition document by Firebase Auth `uid` in the
document *path*, not by the app's internal `memberId`.** The owner
becomes the path segment, so the security rule is a plain
`isOwner(uid)` check and the `memberId`-vs-`uid` landmine never fires
in steady state. `memberId` survives only as a denormalized field for
client-filter continuity and debugging — it is **not** the security
boundary and is **never** referenced in rules.

Why this and not the flat-collection-with-`firebaseUid`-field pattern
used by `attendance`/`appointments`/`orders`: those collections were
all *forced* into stamping `firebaseUid` and a `resource.data.firebaseUid
== request.auth.uid` rule precisely because they are flat and a rule
can only ever authorize against `request.auth.uid`. Several of them
shipped the exact "keyed by memberId → rule default-denied every write"
bug (waivers, attendance, appointments, supportMessages — see
`firestore.rules` comments). Path-keying by `uid` is strictly simpler
and removes that whole failure class: there is nothing to stamp and
nothing to compare.

---

## 1. Collection paths & document shapes

Everything lives under a single per-user subtree:

```
/nutrition/{uid}                                  ← container doc (owner = path segment {uid})
/nutrition/{uid}/weightEntries/{entryId}          ← time-series, many per user
/nutrition/{uid}/macroEntries/{entryId}           ← time-series, many per user/day
/nutrition/{uid}/macroGoals/current               ← SINGLETON (fixed doc id "current")
/nutrition/{uid}/nutritionProfile/current         ← SINGLETON (fixed doc id "current")
```

- `{uid}` is **`auth.currentUser.uid`** on the client (`getCurrentUid()`)
  and **`decoded.uid`** from the verified ID token on the server. They
  are the same value — that is the whole point.
- `{entryId}` is the **existing client-generated record `id`** (`genId('w')`,
  `genId('m')`) reused verbatim as the Firestore doc id. This makes
  create/update/delete idempotent and lets the migration and the live
  writes converge without dedup logic. Server-created entries mint a new
  collision-safe id the same way.
- The two singletons use the **fixed doc id `current`**, so "set goals"
  / "save profile" are idempotent upserts (`set(..., {merge:true})`) with
  no chance of duplicate rows.

### 1.1 Container doc — `/nutrition/{uid}`

Optional but recommended; one cheap `getDoc` answers "has this user set
up nutrition at all" and carries the migration marker.

```jsonc
{
  "uid":           "abc123FirebaseUid",   // redundant w/ path; handy for collectionGroup queries
  "memberId":      "5",                   // denormalized; NOT authoritative, NOT used by rules
  "schemaVersion": 1,
  "migratedAt":    "2026-06-14T18:00:00.000Z" // ISO; set by the one-time AsyncStorage→Firestore migration
}
```

### 1.2 `weightEntries/{entryId}` — one per weigh-in

Mirrors `WeightEntry` in [types/nutrition.ts](src/types/nutrition.ts:41).
**Weight is stored in the unit the user logged it in** (`lb` or `kg`)
with an explicit `unit` field — never silently converted at rest. (The
app converts to kg only at compute time, e.g. `effectiveTdee`.)

```jsonc
{
  "id":        "w_1718387400000_ab12",  // == doc id
  "memberId":  "5",                     // denormalized continuity field
  "date":      "2026-06-14",            // YYYY-MM-DD (local logging day)
  "weight":    181.4,                   // NUMBER, in `unit`
  "unit":      "lb",                    // "lb" | "kg"  ← unit of `weight`
  "note":      "morning, fasted",       // optional
  "createdAt": "2026-06-14T13:30:00.000Z" // ISO
}
```

### 1.3 `macroEntries/{entryId}` — one per logged food item

Mirrors `MacroEntry`. **Macros in grams, calories in kcal** (matches the
existing type comments). Daily totals are derived by summing entries
whose `date` matches — there is no per-day rollup doc.

```jsonc
{
  "id":        "m_1718390000000_cd34",  // == doc id
  "memberId":  "5",                     // denormalized
  "date":      "2026-06-14",            // YYYY-MM-DD
  "name":      "Ham sandwich ×2",
  "calories":  640,                     // kcal
  "protein":   38,                      // grams
  "carbs":     72,                      // grams
  "fat":       18,                      // grams
  "mealType":  "lunch",                 // optional: breakfast|lunch|dinner|snacks
  "createdAt": "2026-06-14T18:13:00.000Z" // ISO
}
```

### 1.4 `macroGoals/current` — singleton daily targets

Mirrors `MacroGoals`. Calories kcal, macros grams.

```jsonc
{
  "memberId":  "5",                     // denormalized
  "calories":  2200,                    // kcal/day
  "protein":   160,                     // g/day
  "carbs":     220,                     // g/day
  "fat":       70,                      // g/day
  "updatedAt": "2026-06-14T18:00:00.000Z" // ISO
}
```

### 1.5 `nutritionProfile/current` — singleton BMR/TDEE profile

Mirrors `NutritionProfile`. Height stored canonical in **cm**; TDEE/
`adaptedTdee` in **kcal/day**.

```jsonc
{
  "memberId":         "5",              // denormalized
  "sex":              "male",           // male | female
  "ageYears":         34,
  "heightCm":         180,              // canonical cm
  "activity":         "moderate",       // sedentary|light|moderate|active|very_active
  "goal":             "cut",            // cut | maintain | bulk
  "calorieAdjustment": -0.15,           // optional % as decimal
  "dietType":         "high_protein",   // optional: balanced|high_protein|low_carb|keto
  "adaptedTdee":      2480,             // optional kcal/day (adaptive algo)
  "lastAdaptedAt":    "2026-06-08T00:00:00.000Z", // optional ISO
  "completedAt":      "2026-05-01T00:00:00.000Z", // ISO — first setup
  "updatedAt":        "2026-06-14T18:00:00.000Z"  // ISO
}
```

> **Singleton alternative.** If you'd rather hold one read for both
> singletons, embed them as `goals` and `profile` maps on the container
> `/nutrition/{uid}` doc instead of separate `current` docs. Either works
> with the rules below; the four-subcollection form is the primary
> recommendation because it maps 1:1 to the four names in the brief,
> keeps independent listeners, and lets each shape be validated
> separately. Pick one and don't mix.

> **Out of scope but identical pattern.** DEXA scans and bloodwork
> reports also live in `NutritionContext`'s AsyncStorage keyed by
> `memberId` and are medical-grade PII. When they move, give them
> `/nutrition/{uid}/dexaScans/{id}` and `/nutrition/{uid}/bloodworkReports/{id}`
> under the **same owner-only** rule. `recentFoods` is a local UX cache —
> leave it in AsyncStorage, do not sync it.

---

## 2. Keying — the `memberId` vs `uid` landmine, defused

The brief's landmine: `NutritionContext` keys records by **Member id**
(`user.id`, e.g. `'5'`), but a server Admin SDK only ever learns the
**Firebase uid** from the verified ID token. Resolution:

| Actor | Knows | How it reaches `/nutrition/{uid}/…` |
|---|---|---|
| **Client** `NutritionContext` | both `user.id` *and* `getCurrentUid()` | writes under `getCurrentUid()`; stamps `memberId = user.id` into each doc for continuity |
| **Server** Senpai tool (Admin SDK) | `uid` from `verifyIdToken` ([senpaiChat.ts:415](functions/src/senpaiChat.ts:415)) | writes under that `uid` directly — **no member lookup needed** |

Because `uid` is the path key:

- **The server needs zero `uid→memberId` lookups to read or write
  nutrition.** The earlier worry ("server only knows uid, must look up
  `/members where firebaseUid == uid`") evaporates — the data is already
  addressed by uid. A lookup is only ever needed if a tool wants to
  *display* the human member name, and the bridge for that already
  exists: `/users/{uid}.memberId → /members/{memberId}` (see
  [memberSync.ts:180](src/services/memberSync.ts:180) `fetchMemberByCurrentUid`).
- **The only place `memberId` and `uid` meet is the one-time on-device
  migration** (§4.3), which runs where *both* are in hand
  (`user.id` and `getCurrentUid()`), so there is no cross-id guessing.

**Edge — unclaimed seed/reviewer members.** A seed member (e.g. reviewer
`id='5'`) can be signed into the app shell with `user.id` set but
`getCurrentUid()` still `null` if Firebase isn't configured/authed. In
that state nutrition stays **AsyncStorage-only** and **no migration runs**
(guarded on `uid != null`). On the next real Firebase sign-in, `uid`
appears and the migration runs then. Never write to `/nutrition/null/…`.

---

## 3. firestore.rules — new block

Insert immediately **before** the `match /{document=**}` default-deny at
the bottom of [firestore.rules](firestore.rules:556). Reuses the existing
`isOwner(uid)` helper ([firestore.rules:15](firestore.rules:15)).

```
    // ─────────────────────────────────────────────────────────────
    // Nutrition — weight log, macro/food log, macro goals, BMR/TDEE
    // profile. ALL keyed by Firebase Auth uid in the PATH (NOT the
    // app's internal memberId), so the owner IS the path segment and
    // the rule is a plain isOwner() check — no per-doc firebaseUid
    // stamping or field-equality dance (unlike attendance/appointments,
    // which are flat collections). The server (Admin SDK, senpaiChat
    // tools) BYPASSES these rules and writes the same /nutrition/{uid}/…
    // paths using the uid from the verified ID token, so client and
    // server share one source of truth.
    //
    // Health data is private: owner-only READ and WRITE. No cross-user
    // read — not even admins (medical-adjacent PII; moderation never
    // needs it). memberId inside the docs is denormalized only and is
    // intentionally NOT consulted here.
    // ─────────────────────────────────────────────────────────────
    match /nutrition/{uid} {
      allow read, write: if isOwner(uid);

      // Weight log — one doc per weigh-in. weight is in `unit` (lb|kg).
      match /weightEntries/{entryId} {
        allow read, delete: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && request.resource.data.weight is number
          && request.resource.data.weight > 0
          && request.resource.data.weight < 2000
          && request.resource.data.unit in ['lb', 'kg']
          && request.resource.data.date is string
          && request.resource.data.memberId is string;
      }

      // Macro/food log — one doc per logged item. calories kcal, macros g.
      match /macroEntries/{entryId} {
        allow read, delete: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && request.resource.data.calories is number && request.resource.data.calories >= 0
          && request.resource.data.protein  is number && request.resource.data.protein  >= 0
          && request.resource.data.carbs    is number && request.resource.data.carbs    >= 0
          && request.resource.data.fat      is number && request.resource.data.fat      >= 0
          && request.resource.data.date is string
          && (!('mealType' in request.resource.data)
              || request.resource.data.mealType in ['breakfast','lunch','dinner','snacks']);
      }

      // Macro goals — singleton at .../macroGoals/current.
      match /macroGoals/{docId} {
        allow read, delete: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && request.resource.data.calories is number && request.resource.data.calories >= 0
          && request.resource.data.protein  is number && request.resource.data.protein  >= 0
          && request.resource.data.carbs    is number && request.resource.data.carbs    >= 0
          && request.resource.data.fat      is number && request.resource.data.fat      >= 0;
      }

      // BMR/TDEE profile — singleton at .../nutritionProfile/current.
      match /nutritionProfile/{docId} {
        allow read, delete: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && request.resource.data.sex in ['male', 'female']
          && request.resource.data.ageYears is number
          && request.resource.data.heightCm is number
          && request.resource.data.activity is string
          && request.resource.data.goal in ['cut', 'maintain', 'bulk'];
      }
    }
```

Notes:
- **Server writes bypass these rules** (Admin SDK), so the validation
  above protects *client* writes only. The server tool must validate its
  own inputs (it already never trusts client-supplied macro numbers —
  see [senpaiChat.ts:605](functions/src/senpaiChat.ts:605)).
- **No `firestore.indexes.json` change is required.** The only client
  queries are single-collection, single-field-equality + order on `date`
  / `createdAt` within one user's subtree, which Firestore serves with
  automatic single-field indexes. (Contrast the social feed, which needed
  composite indexes.) Add one only if a future screen does a multi-field
  `where`.
- **Minimal alternative** (if you prefer the least surface area and are
  willing to validate entirely in client+server code):
  `match /nutrition/{uid}/{document=**} { allow read, write: if isOwner(uid); }`.
  This covers every present and future subtree (incl. dexa/bloodwork) in
  one rule, at the cost of no field validation. The validated form above
  is recommended to match the app's existing rule style.

---

## 4. NutritionContext migration plan

Goal: Firestore becomes the source of truth when signed in, so a write
from *either* side appears in-app, **without changing the public
`NutritionContext` API** (screens keep calling `addMacroEntry`,
`myWeights(memberId)`, etc. unchanged). AsyncStorage stays as an offline
cache + the legacy source for the one-time migration.

### 4.1 New service — `src/services/nutritionSync.ts`

Mirror [memberSync.ts](src/services/memberSync.ts). All functions no-op
when `!FIREBASE_CONFIGURED || !uid`.

```
subscribeNutrition(uid, cb): Unsubscribe        // onSnapshot: container + weightEntries + macroEntries + both singletons
upsertWeightEntry(uid, entry): Promise<void>    // set(doc(.../weightEntries/entry.id), entry, {merge:true})
deleteWeightEntry(uid, id): Promise<void>
upsertMacroEntry(uid, entry): Promise<void>
deleteMacroEntry(uid, id): Promise<void>
setMacroGoals(uid, goals): Promise<void>        // set(doc(.../macroGoals/current), goals, {merge:true})
setNutritionProfile(uid, profile): Promise<void>// set(doc(.../nutritionProfile/current), profile, {merge:true})
```

### 4.2 Wire it into `NutritionContext`

1. **Read uid alongside memberId.** Add `getCurrentUid()` next to the
   existing `useAuth()` `user`. Keep `memberId = user.id` for the public
   API; use `uid` only as the storage partition.
2. **Subscribe on sign-in.** When `uid` becomes available, replace the
   current AsyncStorage-only hydrate ([NutritionContext.tsx:162](src/context/NutritionContext.tsx:162))
   with `subscribeNutrition(uid, …)`. On each snapshot, hydrate
   `weights`/`macros`/`goalsByMember[memberId]`/`profilesByMember[memberId]`
   from Firestore, **stamping `memberId = user.id`** on every record so
   every existing `.filter(x => x.memberId === memberId)` keeps working
   untouched. Keep writing the same slices to AsyncStorage as a
   write-through offline cache.
3. **Route mutators to Firestore (optimistic).** `addWeight`,
   `removeWeight`, `addMacroEntry`, `removeMacroEntry`, `updateGoals`,
   `saveProfile`, and the `runAdaptiveUpdate` goal/profile writes:
   update local state optimistically (as today) **and** fire the matching
   `nutritionSync` call. The onSnapshot reconciles authoritative state.
   Doc id = the record's existing `id`; singletons → `current`.
4. **Offline / not-configured fallback.** When `uid` is null or Firebase
   is unconfigured, behavior is exactly today's: AsyncStorage only. This
   preserves the reviewer/seed path.

### 4.3 One-time migration — `migrateNutritionToFirestore(uid, memberId)`

Runs once per uid, the first time a signed-in user with existing local
data reaches the new code.

1. Guard with `@zenki_nutrition_migrated_v1:{uid}` in AsyncStorage; bail
   if set.
2. Read the legacy slices (`@zenki_weight_entries`, `@zenki_macro_entries`,
   `@zenki_macro_goals`, `@zenki_nutrition_profiles`). Filter weights/
   macros to `memberId === user.id`; pull `goalsByMember[user.id]` /
   `profilesByMember[user.id]`.
3. Write each through `nutritionSync` (idempotent — doc id = record `id`,
   singletons = `current`, all `{merge:true}`). Re-running is safe.
4. On success, set the container doc's `migratedAt`/`schemaVersion` and
   the AsyncStorage guard flag.
5. Skip entirely when `uid` is null (unclaimed seed/reviewer); it will
   run on the next real sign-in.

### 4.4 After migration — server-side Senpai tools become possible

Today `log_food`/`remove_food`/`set_goal` are **client-executed**
because the data lived only on-device ([senpaiChat.ts:597](functions/src/senpaiChat.ts:597),
[useSenpaiChat.ts:461](src/hooks/useSenpaiChat.ts:461)). Once the client
reads `/nutrition/{uid}/…` live, any of them *may* move server-side
(Admin SDK) and the write will surface in-app via the onSnapshot — that
is the unlock this schema delivers. Recommended split:

- **Keep `log_food` client-executed.** It needs `foodSearch` to resolve
  real macros, which the server doesn't have; the model still must never
  supply macro numbers. Only its *write target* changes (AsyncStorage →
  Firestore via `nutritionSync`).
- **`set_goal`, `remove_food`, and a future `log_weight` are pure data
  writes** with no food-DB dependency and could run fully server-side
  against `/nutrition/{uid}/…` using the token uid. If/when added, keep
  them scoped to the caller's own uid only — no cross-user/admin tool —
  exactly as the existing comment at
  [senpaiChat.ts:607](functions/src/senpaiChat.ts:607) warns.

---

## 5. Deploy / rollout checklist

1. Land `nutritionSync.ts` + `NutritionContext` wiring + migration behind
   the existing offline-tolerant guards.
2. `firebase deploy --only firestore:rules` (the new `/nutrition` block).
   No `firestore:indexes` change needed (§3).
3. Ship the client; migration runs per-user on first signed-in launch.
   Watch that unclaimed seed/reviewer accounts (uid null) stay on the
   AsyncStorage path and don't error.
4. Only *after* clients are reading Firestore live, optionally promote
   the pure-write Senpai tools to server-side (§4.4).
```

Units recap (carried through unchanged from the existing types): weight
stored in the unit logged (`lb`|`kg`) with an explicit `unit` field;
macros in **grams**; calories in **kcal**; height canonical in **cm**;
TDEE in **kcal/day**.
