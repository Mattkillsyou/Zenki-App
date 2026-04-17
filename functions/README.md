# Zenki Dojo Cloud Functions

Firebase Cloud Functions that wrap the Anthropic Claude Vision API for the app's AI-powered features:

- **`recognizeFood`** — photo of a meal → `{ foods: [{ name, estimatedGrams, macros }] }`
- **`extractDexa`** — DEXA scan PDF/image → structured body-composition fields
- **`parseBloodwork`** — lab report PDF/image → biomarkers with reference ranges + status

The key lives on the server so the mobile app never holds it.

## Setup

```sh
cd functions
npm install
```

Add your Anthropic key to Firebase Functions secrets:

```sh
firebase functions:secrets:set ANTHROPIC_API_KEY
# paste the key when prompted
```

## Deploy

```sh
npm run deploy
```

The app calls these endpoints via `src/services/aiVision.ts` in the main project.

## Local emulator

```sh
npm run serve
```

Then set `AI_FUNCTION_BASE_URL` in the app's `src/config/api.ts` to
`http://localhost:5001/{projectId}/us-central1` while testing.

## Security

All three endpoints:

1. **Require a Firebase Auth ID token** in the `Authorization: Bearer <token>` header. Requests without one return 401.
2. **Are rate-limited per UID** (30/day by default — tune in `src/rateLimit.ts`).
3. **Validate that the image is under 8 MB** after base64 decoding.
4. **Never echo the raw response from Claude** — they parse it into the declared schema and drop unknown fields.
