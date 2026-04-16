// ──────────────────────────────────────────────────────────────────
// LIABILITY WAIVER — ZENKI DOJO
//
// ⚠️  IMPORTANT: This is a standard template. Before using in
// production, have a licensed California attorney review and adjust
// to match your specific insurance and business requirements.
//
// Bump WAIVER_VERSION whenever the text changes. Existing members
// will need to re-sign the new version.
// ──────────────────────────────────────────────────────────────────

export const WAIVER_VERSION = '2026.04.15';

export const WAIVER_TITLE = 'Assumption of Risk & Release of Liability';

export const WAIVER_TEXT = `ZENKI DOJO
ASSUMPTION OF RISK, RELEASE OF LIABILITY, AND WAIVER OF CLAIMS

Please read carefully. By signing below you are giving up certain legal rights, including the right to sue.

1. NATURE OF ACTIVITY
I understand that Brazilian Jiu-Jitsu, grappling, striking, and all related martial-arts training (collectively, "the Activity") conducted at Zenki Dojo, 1714 Hillhurst Ave, Los Angeles, CA 90027, and at any affiliated event, seminar, competition, or off-site training location, involves vigorous physical contact, inherent risks of injury, and physical exertion. Injuries may include but are not limited to bruises, sprains, strains, fractures, dislocations, concussions, joint damage, permanent disability, and in rare cases, death.

2. ASSUMPTION OF RISK
I voluntarily choose to participate in the Activity with full knowledge of its risks. I accept and assume all risks of injury, illness, damage, or loss, including those caused by the negligent acts or omissions of Zenki Dojo, its owners, instructors, staff, members, guests, or any other participant.

3. MEDICAL FITNESS
I affirm that I am in good physical and mental health and have no medical condition that would prevent me from safely participating in the Activity. I understand that I should consult a physician before beginning any new physical activity. I agree to immediately stop and inform an instructor if I experience pain, dizziness, or any other warning signs during training.

4. EMERGENCY MEDICAL CONSENT
In the event of injury or illness, I authorize Zenki Dojo staff to summon emergency medical services on my behalf. I understand that I am responsible for all costs of medical treatment.

5. RELEASE AND WAIVER
I hereby release, waive, discharge, and covenant not to sue Zenki Dojo, its owners, instructors, employees, agents, landlords, insurers, and all other members and participants (collectively, "Released Parties") from any and all liability, claims, demands, actions, and causes of action arising from my participation in the Activity, whether caused by negligence or otherwise, to the fullest extent permitted by California law.

6. INDEMNIFICATION
I agree to indemnify and hold harmless the Released Parties from any loss, liability, damage, or cost they may incur due to my participation.

7. PHOTO / VIDEO RELEASE
I grant Zenki Dojo permission to use photographs and videos taken of me during training, events, or competitions for marketing, social media, website, and promotional purposes without compensation. I may revoke this permission at any time by written request to the dojo.

8. RULES AND CONDUCT
I agree to follow all rules, policies, and instructions of the dojo and its staff. Zenki Dojo reserves the right to refuse service or revoke membership at its sole discretion.

9. GOVERNING LAW AND SEVERABILITY
This agreement is governed by the laws of the State of California. If any provision is found unenforceable, the remaining provisions remain in full force.

10. ACKNOWLEDGMENT
I have read this entire document, understand it, and sign it voluntarily. I am at least 18 years of age, or if under 18, my parent or legal guardian will also sign below.

By typing my full legal name and tapping "I Agree & Sign" below, I provide my electronic signature and agree to all terms above. This signature has the same legal force as a handwritten signature.`;

export interface WaiverSignature {
  memberId: string;
  memberName: string;
  email: string;
  signedName: string;
  signedAt: string;      // ISO timestamp
  waiverVersion: string;
  emailCopy: boolean;
}
