"use strict";
/**
 * Firebase Cloud Functions — AI vision endpoints for Zenki Dojo.
 *
 * Each HTTPS endpoint:
 *   1. Verifies a Firebase Auth ID token (Authorization: Bearer ...).
 *   2. Rate-limits per UID.
 *   3. Forwards the image to Anthropic Claude Vision with a structured-output prompt.
 *   4. Parses and validates the model output before returning it.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBloodwork = exports.extractDexa = exports.recognizeFood = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const rateLimit_1 = require("./rateLimit");
const prompts_1 = require("./prompts");
// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────
admin.initializeApp();
const ANTHROPIC_API_KEY = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
// Claude model ID — newest Sonnet tier, best reasoning ↔ cost ratio for vision
const MODEL = 'claude-sonnet-4-5';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
// ─────────────────────────────────────────────
// Shared validation + auth
// ─────────────────────────────────────────────
async function authenticate(req) {
    const auth = req.get('Authorization') || req.headers?.authorization;
    if (!auth?.startsWith('Bearer '))
        return { error: 'Missing token', status: 401 };
    const token = auth.substring(7);
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        return { uid: decoded.uid };
    }
    catch (e) {
        return { error: 'Invalid token', status: 401 };
    }
}
function validateImagePayload(body) {
    if (!body?.imageBase64)
        return 'imageBase64 required';
    if (!body?.mimeType)
        return 'mimeType required';
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(body.mimeType)) {
        return 'unsupported mimeType';
    }
    // Rough size check — base64 is ~4/3 of raw bytes
    const estimatedBytes = (body.imageBase64.length * 3) / 4;
    if (estimatedBytes > MAX_IMAGE_BYTES)
        return 'image too large (max 8 MB)';
    return null;
}
// ─────────────────────────────────────────────
// Anthropic client helper
// ─────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt, imageBase64, mediaType, apiKey) {
    const client = new sdk_1.default({ apiKey });
    // PDFs require the document content type rather than image
    const contentBlock = mediaType === 'application/pdf'
        ? {
            type: 'document',
            source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: imageBase64,
            },
        }
        : {
            type: 'image',
            source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
            },
        };
    const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
            {
                role: 'user',
                content: [contentBlock, { type: 'text', text: userPrompt }],
            },
        ],
    });
    // Concatenate all text blocks
    const text = message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    return text;
}
// ─────────────────────────────────────────────
// Endpoint: POST /recognizeFood  → Phase 3
// ─────────────────────────────────────────────
exports.recognizeFood = (0, https_1.onRequest)({ secrets: [ANTHROPIC_API_KEY], cors: true, memory: '512MiB', timeoutSeconds: 60 }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const auth = await authenticate(req);
    if ('error' in auth) {
        res.status(auth.status).send(auth.error);
        return;
    }
    const rate = await (0, rateLimit_1.enforceRateLimit)(auth.uid, 'recognizeFood');
    if (!rate.ok) {
        res.status(429).send(rate.reason);
        return;
    }
    const bodyErr = validateImagePayload(req.body);
    if (bodyErr) {
        res.status(400).send(bodyErr);
        return;
    }
    try {
        const text = await callClaude(prompts_1.FOOD_RECOGNITION_PROMPT.system, prompts_1.FOOD_RECOGNITION_PROMPT.user, req.body.imageBase64, req.body.mimeType, ANTHROPIC_API_KEY.value());
        const parsed = (0, prompts_1.safeParseJson)(text);
        if (!parsed || !Array.isArray(parsed.foods)) {
            res.status(502).send('Invalid model output');
            return;
        }
        // Shape guard + clamp
        const foods = parsed.foods.slice(0, 10).map((f) => ({
            name: String(f?.name ?? 'Unknown').slice(0, 80),
            estimatedGrams: Math.max(0, Math.round(Number(f?.estimatedGrams) || 0)),
            confidence: ['low', 'medium', 'high'].includes(f?.confidence) ? f.confidence : 'medium',
            macros: {
                calories: Math.max(0, Math.round(Number(f?.macros?.calories) || 0)),
                protein: Math.max(0, Math.round(Number(f?.macros?.protein) * 10) / 10 || 0),
                carbs: Math.max(0, Math.round(Number(f?.macros?.carbs) * 10) / 10 || 0),
                fat: Math.max(0, Math.round(Number(f?.macros?.fat) * 10) / 10 || 0),
            },
        }));
        res.json({ foods });
    }
    catch (e) {
        v2_1.logger.error('recognizeFood failed', e);
        res.status(500).send('Processing failed');
    }
});
// ─────────────────────────────────────────────
// Endpoint: POST /extractDexa  → Phase 4
// ─────────────────────────────────────────────
exports.extractDexa = (0, https_1.onRequest)({ secrets: [ANTHROPIC_API_KEY], cors: true, memory: '512MiB', timeoutSeconds: 90 }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const auth = await authenticate(req);
    if ('error' in auth) {
        res.status(auth.status).send(auth.error);
        return;
    }
    const rate = await (0, rateLimit_1.enforceRateLimit)(auth.uid, 'extractDexa');
    if (!rate.ok) {
        res.status(429).send(rate.reason);
        return;
    }
    const bodyErr = validateImagePayload(req.body);
    if (bodyErr) {
        res.status(400).send(bodyErr);
        return;
    }
    try {
        const text = await callClaude(prompts_1.DEXA_EXTRACTION_PROMPT.system, prompts_1.DEXA_EXTRACTION_PROMPT.user, req.body.imageBase64, req.body.mimeType, ANTHROPIC_API_KEY.value());
        const parsed = (0, prompts_1.safeParseJson)(text);
        if (!parsed) {
            res.status(502).send('Invalid model output');
            return;
        }
        res.json(parsed);
    }
    catch (e) {
        v2_1.logger.error('extractDexa failed', e);
        res.status(500).send('Processing failed');
    }
});
// ─────────────────────────────────────────────
// Endpoint: POST /parseBloodwork  → Phase 5
// ─────────────────────────────────────────────
exports.parseBloodwork = (0, https_1.onRequest)({ secrets: [ANTHROPIC_API_KEY], cors: true, memory: '512MiB', timeoutSeconds: 90 }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const auth = await authenticate(req);
    if ('error' in auth) {
        res.status(auth.status).send(auth.error);
        return;
    }
    const rate = await (0, rateLimit_1.enforceRateLimit)(auth.uid, 'parseBloodwork');
    if (!rate.ok) {
        res.status(429).send(rate.reason);
        return;
    }
    const bodyErr = validateImagePayload(req.body);
    if (bodyErr) {
        res.status(400).send(bodyErr);
        return;
    }
    try {
        const text = await callClaude(prompts_1.BLOODWORK_EXTRACTION_PROMPT.system, prompts_1.BLOODWORK_EXTRACTION_PROMPT.user, req.body.imageBase64, req.body.mimeType, ANTHROPIC_API_KEY.value());
        const parsed = (0, prompts_1.safeParseJson)(text);
        if (!parsed || !Array.isArray(parsed.biomarkers)) {
            res.status(502).send('Invalid model output');
            return;
        }
        res.json(parsed);
    }
    catch (e) {
        v2_1.logger.error('parseBloodwork failed', e);
        res.status(500).send('Processing failed');
    }
});
