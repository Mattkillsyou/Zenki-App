/**
 * Public contact-inquiry endpoint for the PRE-AUTH "Contact Us" / membership
 * inquiry form (prospects who aren't signed in yet).
 *
 * The `supportMessages` collection is auth-gated (the create rule requires
 * senderId == auth.uid), so a non-member can't write it directly. This function
 * writes the inquiry via the Admin SDK (bypasses rules) with per-IP rate
 * limiting. Signed-in users keep using the in-app support form, which writes
 * supportMessages directly (submitSupportMessage).
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from './rateLimit';

export const submitContactInquiry = onRequest(
  { cors: true, invoker: 'public', region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }

    // Per-IP throttle (pre-auth → otherwise spammable). On Cloud Run the trusted
    // client IP is the RIGHTMOST X-Forwarded-For entry (the platform appends it);
    // left entries are client-spoofable.
    const xff = (req.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = (xff.length ? xff[xff.length - 1] : ((req as any).ip || '')) || 'unknown';
    const rl = await enforceRateLimit(ip, 'submitContactInquiry');
    if (!rl.ok) { res.status(429).json({ error: 'rate-limited' }); return; }

    const name = String(req.body?.name ?? '').trim().slice(0, 100);
    const email = String(req.body?.email ?? '').trim().slice(0, 200);
    const phone = String(req.body?.phone ?? '').trim().slice(0, 40);
    const message = String(req.body?.message ?? '').trim().slice(0, 4000);
    if (!name || !email || !message) { res.status(400).json({ error: 'missing-fields' }); return; }
    if (!email.includes('@')) { res.status(400).json({ error: 'invalid-email' }); return; }

    try {
      await admin.firestore().collection('supportMessages').add({
        memberId: 'prospect',
        memberName: name,
        memberEmail: email,
        category: 'general',
        subject: `Membership inquiry from ${name}`,
        message: phone ? `${message}\n\nPhone: ${phone}` : message,
        platform: 'web-contact',
        status: 'new',
        source: 'contact-form',
        senderId: null,
        timestamp: new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      logger.error('[submitContactInquiry] write failed', e);
      res.status(500).json({ error: 'server-error' });
    }
  },
);
