// ──────────────────────────────────────────────────────────────────
// LIABILITY WAIVER — ZENKI DOJO
//
// Source: "Waiver liability form All Students.pdf" provided by owner.
// Corrected a typo ("Zenji Dojo" → "Zenki Dojo" in clause 3).
//
// Bump WAIVER_VERSION whenever the text changes. Existing members
// will need to re-sign the new version.
// ──────────────────────────────────────────────────────────────────

export const WAIVER_VERSION = '2026.04.15';
export const WAIVER_TITLE = 'Release and Acknowledgement of Risk';

/**
 * The waiver body. The `{NAME}` token is replaced with the member's
 * signed name at render time (see `renderWaiverText` below).
 */
export const WAIVER_TEMPLATE = `RELEASE AND ACKNOWLEDGEMENT OF RISK

This release is a prerequisite to any training with Zenki Dojo or its affiliates. Where the student is a minor that student's legal guardian shall execute this release on the student's behalf.

1. I {NAME} acknowledge that study of any form of martial art or of any strenuous physical activity entails known and unanticipated risks which could result in serious physical or emotional injury, paralysis, death, or damage to myself, to property, or to third parties. These risks include, but are not limited to, bruising, bloody noses, broken bones, heart attack or other cardiovascular incidence or other serious injury. I understand that such risks simply cannot be eliminated without jeopardizing the essential qualities of the activity. I expressly assume all risks of participation in this activity and have chosen to do so voluntarily and with full awareness of the risks entailed.

2. I {NAME} hereby release, forever discharge and agree to indemnify and hold harmless Zenki Dojo and its affiliates and agents from any and all claims, demands, or causes of action which are connected with my participation in this activity or my use of the Zenki Dojo facility or equipment, including any claims which allege negligent acts or omissions of Zenki Dojo and or its affiliates and agents. This indemnity shall include holding harmless Zenki Dojo and its affiliates and agents for any attorney's fees and costs for enforcement of this agreement.

3. I {NAME} confirm that I have been advised to consult with a physician and certify that I do not have any medical or physical conditions which would interfere with any activities I may participate in before, during or after instruction at Zenki Dojo. I understand and agree that I will bear any costs resulting, directly or indirectly, from my participation at Zenki Dojo, including but not limited to any medical expenses.

4. In signing this document I understand that I am limiting, if not foreclosing, my ability to pursue a lawsuit against Zenki Dojo and its affiliates and agents.

Zenki Dojo · 1714 Hillhurst Ave., Los Angeles, CA 90027
Ph. 323-953-8131 · info@zenkidojo.com`;

/**
 * Fills in the member's name in the waiver template.
 * If no name provided yet, shows a visible placeholder.
 */
export function renderWaiverText(memberName?: string): string {
  const name = memberName?.trim() || '_________________';
  return WAIVER_TEMPLATE.replace(/\{NAME\}/g, name);
}

export interface WaiverSignature {
  memberId: string;
  memberName: string;
  email: string;
  phone?: string;
  signedName: string;
  signedAt: string;      // ISO timestamp
  waiverVersion: string;
  emailCopy: boolean;
}
