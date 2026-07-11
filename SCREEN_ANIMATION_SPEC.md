# Zenki Dojo — Screen-Animation Redesign Spec

**Scope:** app-wide screen motion (navigation transitions, screen entrances, press feedback, ambient loops). Character/Senpai motion was fixed in Phase A and is out of scope except where it shares tokens.
**Stack reality (verified):** `react-native-reanimated` is **absent** — not in `package.json` deps (only gesture-handler ~2.30.0 at :52, svg 15.15.3 at :56), not in `node_modules`, no babel plugin. All motion is legacy `Animated`, mostly native-driver. **Everything in this spec is achievable without new native deps.** `@react-navigation/native-stack` ^7.0.0 is installed but unused (package.json:19) — the only "free" structural upgrade available.

---

## 1. DIAGNOSIS — why the motion reads unprofessional

1. **The dominant press feedback is 2012-era opacity dimming, applied inconsistently.** `SoundPressable` (src/components/SoundPressable.tsx:31) is a bare `TouchableOpacity` with the harsh RN default `activeOpacity 0.2`, used at **392 call sites across 77 files**; ~19 files ad-hoc override to 0.7; `Button.tsx:53` routes through it, so every button presses "flat." Meanwhile `PressableScale` — the one primitive with a scale+spring release (PressableScale.tsx:31-46) — has **2** call sites. Same semantic, two competing primitives, and the good one lost.

2. **One identical entrance stamped everywhere = template motion.** `FadeInView` (fade + 12px slide-up, 300ms cubic-out, FadeInView.tsx:21-55) appears at 109 call sites / 25 files (233 JSX usages across 23 screen files in the nav audit). Slide distance and curve never vary by element role or size. It's the single biggest "AI starter template" signal.

3. **Hand-typed serial stagger ladders delay real content well past the transition.** HomeScreen runs a 16-step ladder with delays 0→400ms (HomeScreen.tsx:771-1222) — home settles ~700ms after the 400ms auth crossfade (~1.1s to fully drawn). AdminScreen staggers a static 12-tile grid one tile at a time, 60→480ms (AdminScreen.tsx:166-275), ~780ms of drawing on top of a 400ms modal slide. Each screen invents its own rhythm (90/100/110 vs 60/120/180 vs 70/75 in MacroTracker) — no stagger helper exists.

4. **Binary inconsistency: over-choreographed screens next to dead ones.** CommunityScreen has zero entrance animation (spinner→FlatList hard swap), SettingsScreen and TrainingHomeScreen also zero, while 23 other screens cascade. The alternation reads as unfinished more than any single screen does.

5. **Navigator transitions are timing-only where the platform uses springs, and the crossfade holds dark.** Push = `forHorizontalIOS` geometry driven by a 300ms hardcoded timing (RootNavigator.tsx:149-155) instead of the stock iOS ~500ms spring — gesture releases settle into a timing curve and feel floaty. The auth/Main crossfade maps opacity `[0,.5,1]→[0,.3,1]` over 400ms (RootNavigator.tsx:113-134) — perceived dead time through the first half. The 300ms literals at :150/:153 bypass the token file the same navigator otherwise consumes correctly.

6. **Tab switching is a hard cut with a layout pop.** bottom-tabs v7 has no `animation` option set (TabNavigator.tsx:49-83) → content hard-cuts (`'fade'`/`'shift'` are free in v7). The active icon's **size prop jumps 24→28 unanimated** (TabNavigator.tsx:72), shoving the tab bar layout every switch.

7. **Uneased and linear ambient loops read mechanical.** Three "badge pulse" loops run at unrelated periods with default/no easing: StreakBadge 800ms scale + 1200ms glow (StreakBadge.tsx:27-34), PointsBadge 1400ms (PointsBadge.tsx:34-35). XPProgressBar fills with no easing, `useNativeDriver:false`, and its 2000ms **linear** shine loop runs forever even off-screen (XPProgressBar.tsx:22-39). AnimatedTabIcon's senpai bounce/sparkle loops are linear (AnimatedTabIcon.tsx:54-75) — motion.ts's own header says "never linear." Skeleton (the loading primitive with a full Circle/Row/Card API, Skeleton.tsx:317-322) is exported and **used nowhere**.

8. **No shared motion language despite a token file existing.** src/theme/motion.ts has 6 easings + 6 durations + scale/opacity tokens, but only **4 files** import it while **205 hardcoded `duration:` literals** exist across 21 files. The `overshoot` easing (:14) is never used. There are **zero spring tokens** and ~10 distinct ad-hoc friction/tension pairs in the wild (5/200, 5/300, 4/60, 3/default, 8/60+defaults, five Senpai configs). Reduce Motion is respected by ~10 shared components but ignored by CelebrationModal, Confetti, SpinWheelModal, Skeleton, CoachmarkTutorial, ThemeOverlay, ReorderableSections, and **every navigator transitionSpec**.

---

## 2. DESIGN LANGUAGE — one system

Premium dark fitness app: motion should feel **weighty, fast, and spring-settled** — short distances, confident springs, almost nothing looping. The rule of thumb: *timing curves for exits and fades; springs for anything that arrives or responds to touch; sine for anything that breathes.*

### 2.1 Durations (keep motion.ts scale, assign roles)
| Token | ms | Role |
|---|---|---|
| `duration.instant` 100 | press-in, icon state |
| `duration.fast` 150-200 | fades out, dismissals, coachmark steps |
| `duration.standard` 250 *(retune from 300)* | element entrances, content fades |
| `duration.slow` 350-400 | full-screen transitions, modals — **hard ceiling for anything user-blocking** |

**Choreography budget:** last element of any screen entrance finishes ≤ 250ms after transition end. No exceptions for grids.

### 2.2 Easing family
- Keep `decelerate` / `accelerate` / `emphasized` as the timing trio (enter-ish / exit / transition).
- **Ban** linear and default `inOut(ease)` for anything visible. Loops use `Easing.inOut(Easing.sin)` exclusively (already the Phase A precedent in SenpaiMascot breathing).
- Retire the unused bezier `overshoot` — overshoot comes from springs, not curves.

### 2.3 Spring tokens (the biggest gap — add to motion.ts)
Three named springs, replacing all ~10 ad-hoc pairs:
| Token | config | Use |
|---|---|---|
| `spring.press` | friction 5, tension 300 | press release, icon focus (matches AnimatedTabIcon.tsx:30-36, the app's best existing spring) |
| `spring.settle` | friction 6, tension 120 | drag release, reorder settle, card arrivals (matches the Phase A SenpaiMascot corner-snap retune) |
| `spring.pop` | friction 4, tension 200 | celebratory scale (likes, badges, milestone pops) |

### 2.4 Stagger rule (replaces every hand-typed ladder)
`stagger(i, step = 30) => Math.min(i, 4) * step` — 30ms steps, capped at 120ms. Grids stagger **by row**, not per tile. Screens use a **two-tier entrance**: chrome/header at delay 0, content group at ~60ms. That's it — no screen defines its own rhythm.

### 2.5 Press feedback (one primitive)
`SoundPressable` becomes the app's press primitive: scale → `scale.pressed` (0.97, token already exists at motion.ts:36-47) over `duration.instant` decelerate on press-in, `spring.press` release; opacity dim reduced to a subtle 0.9 (kill the 0.2/0.7 lottery). Reduce Motion → opacity-only fallback. `PressableScale` is folded in and deleted or aliased.

### 2.6 Screen transitions
- **Push:** keep `forHorizontalIOS` geometry, drive open with stack v7 `{animation:'spring'}` (close stays timing/accelerate). Gestures then release into a spring — the floatiness dies.
- **Crossfade:** linear-in-opacity `[0,1]→[0,1]`, 250-300ms — no dark hold.
- **Modal:** current interpolator (translateY 15% + scale .96 + overlay) is good; keep, spring the open.
- **Tabs:** `animation:'shift'`; icon **scale** animates via the existing focus spring, size prop pinned (no layout pop).
- All transitionSpecs gate on MotionContext reduce-motion → fall back to short fades.

### 2.7 Ambient motion
One shared breath rhythm: `ambient.period = 2400ms`, sine-eased, and every persistent pulse (Streak, Points, XP shine if kept) derives from it (full, half, or quarter amplitude) so the home screen breathes together instead of three desynced metronomes. Loops must stop when off-screen and be disabled under Reduce Motion. Skeleton adopts the same sine easing and gets actually used for loading states (Community's spinner→list hard swap is the first customer).

---

## 3. IMPLEMENTATION PLAN — ordered

**Dependency decision, stated up front:** reanimated is **not installed**; adopting it means a new native dep + EAS/dev-client rebuild and (for 4.x on SDK 55) New Architecture. **Not required for any item below — explicitly out of scope.** The only structural library question is native-stack (installed, unused): optional step 9.

| # | Change | Files | Size | Nature |
|---|---|---|---|---|
| 1 | **motion.ts: add `spring.{press,settle,pop}`, `stagger()` helper, `ambient.period`; retune `duration.standard` 300→250; delete unused `overshoot`** | src/theme/motion.ts | **S** | pure tokens |
| 2 | **SoundPressable upgrade** — scale+spring press per §2.5, RM fallback; normalize activeOpacity; delete/alias PressableScale; remove the ~19 scattered activeOpacity overrides | src/components/SoundPressable.tsx, PressableScale.tsx, Button.tsx + override sweep | **S** (one-file core) | structural-lite; **fixes 392 call sites at once — do this first for visible payoff** |
| 3 | **RootNavigator: crossfade curve `[0,1]→[0,1]` @ 250-300ms; push open → `{animation:'spring'}` w/ `spring.settle`; replace :150/:153 literals with tokens; RM gate all three transitionSpecs** | src/navigation/RootNavigator.tsx (:113-134, :145-159, :166-212) | **S** | curve/token tuning |
| 4 | **TabNavigator: `animation:'shift'`; pin icon size, animate scale in AnimatedTabIcon; sine-ease the senpai bounce/sparkle loops** | src/navigation/TabNavigator.tsx (:49-83, :72), src/components/AnimatedTabIcon.tsx (:54-75) | **S** | config + curve tuning |
| 5 | **FadeInView + Stagger wrapper** — add `index` prop deriving delay from `stagger()`; add subtle variants (header vs card: slide 8 vs 12px); a `<Staggered>` group component so screens stop hand-typing delays | src/components/FadeInView.tsx, new src/components/Staggered.tsx | **M** | structural |
| 6 | **Screen ladder sweep** — replace hand-typed delays with `stagger()`/two-tier entrance: HomeScreen (16 sites), AdminScreen (grid → row-stagger), MacroTracker, WeightTracker, EmployeeChecklist, CycleTracker, AttendanceHistory, BodyLab, WorkoutScreen; **add** the two-tier entrance to Community, Settings, TrainingHome (via ScreenContainer or top-level Staggered) | ~26 screen files under src/screens/ | **L** | mechanical after #5; kills diagnosis #3 and #4 |
| 7 | **Loop hygiene** — sine easing + `ambient.period` for StreakBadge (:27-34), PointsBadge (:34-35), Skeleton (:47-64); XPProgressBar: eased fill, gate the 2000ms shine (or drop it), consider scaleX instead of width to escape `useNativeDriver:false`; wire Skeleton into Community/loading states | StreakBadge.tsx, PointsBadge.tsx, XPProgressBar.tsx, Skeleton.tsx, CommunityScreen.tsx | **M** | mostly curve tuning; XP scaleX is structural |
| 8 | **Reduce Motion sweep** — CelebrationModal, Confetti, SpinWheelModal, Skeleton, CoachmarkTutorial, ThemeOverlay, ReorderableSections all gate on MotionContext (src/context/MotionContext.tsx:20); unify Reorderable's two settle springs onto `spring.settle` (:121-126 vs :131); consolidate CelebrationModal's inline ConfettiDots onto Confetti.tsx | 7 component files | **M** | structural-lite, a11y |
| 9 | *(Optional)* **Migrate root to installed native-stack** for OS-native push/modal physics | RootNavigator.tsx | **L** | structural; **no new dep** but the custom modal interpolator (:166-212) must be re-expressed as native-stack presentation options — only do if #3's spring still feels off on device |
| 10 | **Token adoption sweep** — replace the remaining hardcoded `duration:` literals (205 across 21 files pre-plan; most die in #6-8) with motion.ts tokens; add a lint grep to CI | ~21 files | **M** | mechanical cleanup |

Order matters: 1→2→3→4 are one afternoon and change how the whole app *feels*; 5→6 fix the template smell; 7→8 fix polish and a11y; 9→10 are follow-ups.

---

## 4. RISK / VERIFY — on-device, 120Hz

All items below need a physical ProMotion iPhone (and one low-end Android) — the simulator hides jank and spring character:

1. **Push spring (item 3/9):** stack v7 `animation:'spring'` open + interactive gesture release — verify the gesture hands off into the spring without a velocity discontinuity at 120Hz; verify close-during-open interruption.
2. **SoundPressable at scale (item 2):** 392 sites include FlatList rows (Community feed, member lists) — confirm scale transform on native driver doesn't jank scrolling, and that press-in still registers on fast scroll-taps.
3. **Tab `'shift'` + senpai loops (item 4):** the shifting content plus AnimatedTabIcon's bounce/sparkle loops run simultaneously — check frame pacing during rapid tab flipping.
4. **XPProgressBar (item 7):** currently JS-driven width; if switched to scaleX verify the rounded-corner/edge rendering of the fill at partial scales; if width kept, verify the eased fill doesn't drop frames while the screen entrance plays.
5. **Ambient rhythm (item 7):** with Streak + Points + XP synced to one 2400ms period on HomeScreen, confirm the synchronized pulse reads "breathing," not "blinking" — this is a taste call only judgeable on device; also verify loops actually stop on blur/off-screen (battery).
6. **Reduce Motion (item 8):** toggle iOS Settings → Accessibility → Reduce Motion live: navigator fallback fades, no CelebrationModal/SpinWheel/ThemeOverlay motion, Senpai contracts unchanged (Phase A gates must not regress).
7. **Entrance budget (item 6):** stopwatch/screen-record Home and Admin — total settle must be ≤ transition + 250ms (vs today's ~1.1s and ~780ms tails).
8. **Interaction with Phase A:** SenpaiMascot/Overlay/Transformation share motion.ts; retuning `duration.standard` 300→250 must be checked against any Senpai timings that import it (only 4 files import tokens today, so blast radius is small — verify those 4: RootNavigator, PressableScale, FadeInView, AnimatedTabIcon).

**Rollback posture:** items 1-4 and 7-8 are token/curve-level and independently revertable; item 6 is wide but mechanical; only item 9 (native-stack) changes navigation architecture and should ship behind its own commit.
