# Senpai Mascot — Gemini Image Generation Prompts

## Strategy
Generate assets in this order:
1. **Character Reference Sheet** (turnaround) — locks design
2. **Body Poses Sheet 1** — Core moods (idle, cheering, impressed, celebrating)
3. **Body Poses Sheet 2** — Secondary moods (sleeping, disappointed, encouraging, waving)
4. **Body Poses Sheet 3** — Activity poses (running, stretching, meditating, eating, pointing, thinking)
5. **Expression Sheet** — 12 facial close-ups for speech bubble overlays
6. **Hand Gestures Sheet** — thumbs up, peace sign, fist pump, pointing, waving, clapping

All prompts reference the same character to maintain consistency.

---

## CHARACTER ANCHOR (use in every prompt)
> Anime girl, teal/mint green twin-tail hair with orange ribbon accessories, large expressive purple/violet eyes, slim athletic build, normal anime proportions (6.5 heads tall). Wearing a classic Japanese school athletic tracksuit (jersey) — navy blue with white racing stripes down the sides of both the zip-up jacket and pants, jacket slightly unzipped showing white t-shirt underneath, white sneakers with teal accents.

---

## PROMPT 1: Character Reference / Turnaround Sheet
(Already submitted)

---

## PROMPT 2: Core Body Poses (4 poses)

```
Using the same anime girl character from the previous image (teal twin-tail hair, orange ribbons, purple eyes, navy blue school tracksuit with white stripes, white sneakers), generate 4 full-body poses arranged in a single row on a plain white background.

Each pose must:
- Show the FULL body from head to toe
- Be the EXACT same character with identical proportions
- Have feet planted at the same ground line
- Be the same scale (same height)
- Face forward (3/4 view toward camera)
- Have clean vector-style illustration, thick outlines, flat cel-shaded coloring

The 4 poses left to right:
1. IDLE — standing relaxed, gentle smile, one hand on hip, weight on one leg
2. CHEERING — both arms raised high above head, fists clenched, huge open-mouth grin, leaning forward slightly with energy, small sparkle effects around hands
3. IMPRESSED — hands clasped together near chin, starry eyes (star shapes in pupils), slight blush marks on cheeks, mouth in small "o" shape
4. CELEBRATING — jumping in the air (both feet off ground), one arm punching upward in victory pose, huge grin, confetti particles around her

No text, no labels, no watermarks. Clean white background.
```

## PROMPT 3: Secondary Body Poses (4 poses)

```
Using the same anime girl character (teal twin-tail hair, orange ribbons, purple eyes, navy blue school tracksuit with white stripes, white sneakers), generate 4 full-body poses arranged in a single row on a plain white background.

Same requirements: full body head to toe, identical character, same ground line, same scale, 3/4 forward view, clean vector style, thick outlines, flat cel-shading.

The 4 poses left to right:
1. SLEEPING — sitting on the ground with legs tucked to one side, head tilted resting on hands, eyes closed peacefully, small "Zzz" floating above, serene expression
2. DISAPPOINTED — standing with slight slouch, looking down and to the side, slight pout, one arm hanging limp and the other hand behind her neck, subtle frown
3. ENCOURAGING — standing with one arm extended forward giving a thumbs-up, confident smile, other hand on hip, slight lean forward as if cheering someone on
4. WAVING — one hand raised in an enthusiastic wave, other hand at her side, cheerful open-mouth smile, slight head tilt

No text, no labels, no watermarks. Clean white background.
```

## PROMPT 4: Activity Poses (6 poses)

```
Using the same anime girl character (teal twin-tail hair, orange ribbons, purple eyes, navy blue school tracksuit with white stripes, white sneakers), generate 6 full-body poses arranged in a 3x2 grid on a plain white background.

Same requirements: full body, identical character, same scale, clean vector style, thick outlines, flat cel-shading.

The 6 poses (top row left to right, then bottom row):
1. RUNNING — mid-stride jogging pose, arms pumping, determined smile, hair flowing behind
2. STRETCHING — standing hamstring stretch, one leg forward, reaching toward toes, relaxed expression
3. MEDITATING — sitting cross-legged (lotus position), hands on knees palms up, eyes closed, peaceful serene expression, slight glow effect around her
4. EATING — standing, holding a rice ball/onigiri in both hands near her mouth, happy closed-eye expression, small heart near her head
5. POINTING — standing with one arm extended pointing forward/at viewer, confident grin, other hand on hip
6. THINKING — standing with one hand on chin, looking upward, slight squint, question mark floating above head

No text, no labels, no watermarks. Clean white background.
```

## PROMPT 5: Expression Sheet (12 faces)

```
Using the same anime girl character (teal twin-tail hair, orange ribbons, purple eyes, navy blue school tracksuit collar visible), generate a facial expression sheet showing 12 different emotions.

Show HEAD AND SHOULDERS ONLY (bust shot from chest up). Arrange in a 4x3 grid on plain white background. Each expression must be the same face with identical proportions — only the expression changes.

Clean vector style, thick outlines, flat cel-shading. Same art style as previous images.

The 12 expressions (top row to bottom row, left to right):
Row 1: HAPPY (big warm smile, eyes slightly closed), EXCITED (huge open grin, sparkle in eyes, slight blush), BLUSHING (looking to the side, red cheeks, shy small smile), LOVE (heart-shaped eyes, dreamy smile, floating hearts)
Row 2: DETERMINED (fierce grin, one eye winking, fist near chin), SURPRISED (wide eyes, small open mouth, raised eyebrows), ANGRY (puffed cheeks, furrowed brows, small frown — cute angry not scary), CRYING HAPPY (tears streaming but big smile, overwhelmed with joy)
Row 3: SLEEPY (half-lidded eyes, small yawn, slightly tilted head), POUTING (puffed cheeks, looking away, arms crossed visible at bottom), WINKING (one eye closed, tongue sticking out slightly, peace sign near face), NEUTRAL (calm gentle smile, relaxed eyes, default state)

No text, no labels, no watermarks. Clean white background.
```

## PROMPT 6: Hand Gestures / Accessories (6 items)

```
Using the same anime girl character's hands (matching her skin tone and the navy blue tracksuit sleeves), generate 6 isolated hand gesture illustrations arranged in a 3x2 grid on plain white background.

Clean vector style, thick outlines, flat cel-shading. Show only the hand and wrist/forearm (with tracksuit sleeve visible).

The 6 gestures:
1. THUMBS UP — classic thumbs up, slight angle
2. PEACE SIGN — two fingers up in V shape
3. FIST PUMP — clenched fist raised, small action lines
4. POINTING — index finger extended forward
5. WAVING — open palm, fingers spread, motion lines
6. CLAPPING — two hands together mid-clap, small impact star

No text, no labels, no watermarks. Clean white background.
```

---

## Post-Processing Notes
- User will clip each pose/expression from the generated sheets in Photoshop
- Remove backgrounds (white → transparent)
- Save as individual PNGs at consistent canvas size (recommended 512x512 or 256x512 for full body)
- Anchor point: center-bottom (feet) for body poses, center for face expressions
- File naming: `senpai_idle.png`, `senpai_cheering.png`, `senpai_expr_happy.png`, etc.
- Place final assets in `src/assets/senpai/` directory
