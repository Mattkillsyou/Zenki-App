/**
 * Firebase Cloud Function — Zenki-branded password reset email via Resend.
 *
 * Replaces Firebase's default password-reset email path (which lands in spam
 * because it ships from the shared `noreply@<projectId>.firebaseapp.com`
 * sender with no DKIM aligned to a Zenki domain). The Admin SDK still mints
 * the reset link, so the security model is unchanged — we just deliver the
 * link via a real transactional-email provider with proper sender reputation.
 *
 * Contract:
 *   POST /sendPasswordReset
 *   Body: { "email": "user@example.com" }
 *   Always returns 200 { ok: true } so the function can't be used to enumerate
 *   which email addresses have accounts. A 5xx is reserved for genuine outages
 *   (Resend down, Admin SDK errors, etc.) so the client can surface that.
 *
 * Setup once before the first deploy:
 *   firebase functions:secrets:set RESEND_API_KEY
 *     → paste the Resend API key when prompted (starts with `re_…`)
 *
 *   To send to addresses other than the Resend account owner's email, verify
 *   a sending domain in the Resend dashboard (zenkidojo.com or similar) and
 *   change FROM_ADDRESS below to a `noreply@<verified-domain>` address.
 *
 * Deploy:
 *   cd functions && npm install && npm run build
 *   firebase deploy --only functions:sendPasswordReset
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

// Resend's sandbox sender — ships free without domain verification BUT can
// only deliver to the email address that signed up for the Resend account.
// For production: verify a sending domain at https://resend.com/domains and
// swap to `Zenki Dojo <noreply@yourdomain>`.
const FROM_ADDRESS = 'Zenki Dojo <onboarding@resend.dev>';

// Firebase Admin is initialized once in functions/src/index.ts (admin.initializeApp())
// — re-importing here is safe because admin.app() reuses the existing default app.

export const sendPasswordReset = onRequest(
  {
    secrets: [RESEND_API_KEY],
    cors: true,
    region: 'us-central1',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }

    const rawEmail = (req.body?.email as string) ?? '';
    const email = rawEmail.trim().toLowerCase();

    // Anti-enumeration: bad/missing input still returns ok so attackers can't
    // probe the registered-email set by watching for differential errors.
    if (!email || !email.includes('@')) {
      logger.info('[sendPasswordReset] empty / invalid email; returning ok', { rawEmail });
      res.status(200).json({ ok: true });
      return;
    }

    // Mint the reset link via Admin SDK. If the user doesn't exist (or the
    // email is malformed by Admin's stricter check), pretend success.
    let resetLink: string;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email);
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code ?? 'unknown';
      // user-not-found / invalid-email — quietly succeed
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-email' ||
        code === 'auth/missing-email'
      ) {
        logger.info('[sendPasswordReset] no account for email; faking success', { email, code });
        res.status(200).json({ ok: true });
        return;
      }
      logger.error('[sendPasswordReset] generatePasswordResetLink failed', { email, code, err });
      res.status(500).json({ error: 'reset-link-mint-failed' });
      return;
    }

    // Send the branded email via Resend.
    try {
      const resend = new Resend(RESEND_API_KEY.value());
      const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: 'Reset your Zenki Dojo password',
        html: brandedResetEmail(resetLink),
        text: brandedResetEmailText(resetLink),
      });

      if ((result as { error?: unknown }).error) {
        const errPayload = (result as { error?: unknown }).error;
        logger.error('[sendPasswordReset] Resend returned an error', { email, err: errPayload });
        res.status(500).json({ error: 'send-failed' });
        return;
      }

      logger.info('[sendPasswordReset] sent', {
        email,
        id: (result as { data?: { id?: string } }).data?.id,
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error('[sendPasswordReset] unexpected error sending', { email, err });
      res.status(500).json({ error: 'unexpected-error' });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Email templates — kept in this file so editing copy doesn't require touching
// the function logic.
// ─────────────────────────────────────────────────────────────────────────────

function brandedResetEmail(resetLink: string): string {
  // Inline styles only — most email clients (Gmail / Outlook) strip <style>
  // blocks and external CSS. Using a dark background with gold accent to
  // match the Zenki Dojo app aesthetic.
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset your Zenki Dojo password</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0A0A0A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#F5F5F5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A0A0A;">
      <tr>
        <td align="center" style="padding:48px 24px 24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#141414;border:1px solid #2A2A2A;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:40px 32px 24px 32px;text-align:center;">
                <div style="display:inline-block;width:64px;height:64px;border-radius:32px;background-color:#FFFFFF;color:#000000;font-size:32px;font-weight:900;line-height:64px;letter-spacing:-1px;">Z</div>
                <h1 style="margin:24px 0 8px 0;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">Reset your password</h1>
                <p style="margin:0;font-size:14px;color:#9999A1;line-height:22px;">
                  We got a request to reset the password on your Zenki Dojo account. Tap the button below to choose a new one.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;text-align:center;">
                <a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:14px 28px;background-color:#D4A017;color:#000000;text-decoration:none;font-weight:800;font-size:15px;letter-spacing:0.3px;border-radius:12px;">
                  Reset password
                </a>
                <p style="margin:24px 0 0 0;font-size:12px;color:#71717A;line-height:18px;">
                  Or paste this link into your browser:<br />
                  <a href="${escapeHtml(resetLink)}" style="color:#D4A017;word-break:break-all;text-decoration:underline;">${escapeHtml(resetLink)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid #2A2A2A;background-color:#0F0F0F;">
                <p style="margin:0;font-size:12px;color:#71717A;line-height:18px;">
                  Didn't request this? You can safely ignore this email — your password won't change unless you tap the button above.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:11px;color:#52525B;letter-spacing:0.5px;">
            ZENKI DOJO &middot; PRIVATE TRAINING &middot; EST. 1997
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function brandedResetEmailText(resetLink: string): string {
  // Plain-text fallback for clients that don't render HTML. Some spam filters
  // also weight the absence of a text part — including both improves
  // deliverability slightly.
  return [
    'Reset your Zenki Dojo password',
    '',
    'We got a request to reset the password on your Zenki Dojo account.',
    'Open this link to choose a new one:',
    '',
    resetLink,
    '',
    "Didn't request this? You can safely ignore this email — your password won't change unless you open the link above.",
    '',
    '— Zenki Dojo · Private Training · Est. 1997',
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
