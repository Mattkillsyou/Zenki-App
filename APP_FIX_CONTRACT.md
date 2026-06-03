# APP_FIX_CONTRACT.md — fixing the whole-app audit (branch `fix/app-audit`)

Findings + full detail/fixes are in **APP_AUDIT.md**, each tagged `Fxx [owner·track]`. This contract maps owners → files and flags items needing a product/infra decision. **Strict file ownership: no two agents edit the same file.** Agents do NOT run git/npm/tsc/expo — the lead verifies at integration.

## Ownership

**LEAD (me)** — owns `functions/src/*`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `App.tsx`, `src/services/waiverSync.ts`. Handles all `[cloud-functions·]` + `[rules-security·]` findings (F05, F06, F22, F23, F24, F25, F39, F40, F41, F42) + the coupled bits below.

**A1 — auth** (`[auth·]`): `src/screens/auth/*`, `src/services/firebaseAuth.ts`, `src/context/AuthContext.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/ContactScreen.tsx`, `src/screens/ContactSupportScreen.tsx`.
**A2 — workouts/gamification** (`[workouts·]`): `src/context/WorkoutContext.tsx`, `src/context/GamificationContext.tsx`, `src/context/SpinWheelContext.tsx`, `src/screens/Workout*.tsx`, `src/screens/Timer*.tsx`, `src/screens/SessionHistoryScreen.tsx`, `src/screens/PRDetailScreen.tsx`, `src/screens/Achievement*.tsx`, `src/screens/HomeScreen.tsx`, `src/types/gamification.ts`.
**A3 — health/nutrition** (`[health·]`,`[nutrition·]`): `src/services/medicationNotifications.ts`, `src/context/{Medication,Cycle,HeartRate,HealthKit,GpsActivity,Motion,DrinkTracker}*.tsx`, `src/context/NutritionContext.tsx`, `src/services/foodSearch.ts`, `src/screens/{BodyLab,Bloodwork*,Dexa*,Medication,CycleTracker,Drink,Macro*,ActivityTracker,WeightTracker}.tsx`.
**A4 — payments/commerce** (`[payments·]`): `src/services/payments.ts`, `src/services/orderSync.ts`, `src/context/CartContext.tsx`, `src/context/ProductContext.tsx`, `src/screens/{Store,ProductDetail,OrderHistory}.tsx`.
**A5 — admin/senpai/crosscut** (`[admin·]`,`[senpai·]`,`[cross-cutting·]`): `src/screens/Admin*.tsx`, `src/services/{announcementSync,scheduleSync,appointmentSync,attendanceSync,employeeTaskSync,calendarIntegration,googleSheets}.ts`, `src/context/TimeClockContext.tsx`, `src/screens/{Book,Schedule,AttendanceHistory,TimeClock,EmployeeChecklist,SenpaiMemory}.tsx`, `src/context/SenpaiContext.tsx`, `src/hooks/useSenpaiChat.ts`, `src/services/senpaiChat.ts`, `src/config/*`, `src/services/crashReporter.ts`.

## Coordination (lead ↔ agent)
- **Account deletion (auth blocker):** LEAD makes the `deleteAccount` CF delete the Auth user as its final step (`admin.auth().deleteUser`). A1 reorders/guards `SettingsScreen.confirmDeleteAccount` so it does NOT erase server data before a deletable Auth state — simplest: call the CF (which now also removes the Auth user), then sign out; drop the fragile pre-CF behavior.
- **Time clock (admin blocker):** LEAD edits `App.tsx` to pass the real signed-in employee into `<TimeClockProvider employeeName=… hourlyRate=…>` (read from `useAuth().user`). A5 fixes `TimeClockContext` to use the passed props and persist per-uid (not one global key).
- **Payment amount (payments major):** LEAD validates the charge amount server-side in `createPaymentIntent` (look up the order/price server-side; never trust client `amount` for orders). A4 makes the client send an order id / line items, not a trusted total.

## Product / infra decisions — FIX the honest part, FLAG the rest (don't fabricate)
- **USDA food DB dead (nutrition):** key isn't configured. A3: make it degrade gracefully (no crash, clear "search unavailable" state) and FLAG that `EXPO_PUBLIC_USDA_API_KEY` must be set. Don't invent a key.
- **Google Calendar "synced" fabricated (crosscut/admin):** A5: remove/soften the false "synced/bookings sync automatically" copy so the UI doesn't claim something the code doesn't do. Real calendar write-back is a feature build — FLAG it, don't build it now.
- **Invite-gate `dragon` fallback (auth + F24):** LEAD adds rate-limiting to `validateInviteCode`. Removing the `dragon` fallback + deploying the CF is a deploy decision — FLAG (per the known prod state). A1 leaves the client gate as-is unless trivially hardenable.
- **GPS background tracking (health):** foreground-only is a real limitation needing a background-location capability. A3: FLAG it + add an honest in-UI notice that tracking pauses when the app is backgrounded; don't claim background tracking.
- **Stripe webhook/fulfillment (payments):** building a webhook is infra (needs a Stripe signing secret + endpoint). A4/LEAD: FLAG it; the immediate fix is the server-side amount validation above.

## Verify (lead, at integration)
`npm run typecheck` + `cd functions && npm run build` clean; adversarial review of the diff vs APP_AUDIT.md (every blocker fixed, no new hallucinations, rules tightened not loosened, product-flags clearly noted, no ownership collisions); coherent commits on `fix/app-audit`; PR linking APP_AUDIT.md. No push to main.
