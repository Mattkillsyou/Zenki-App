// Suggest a fighter-style nickname based on a fun fact
// Heuristic — looks for keywords and maps them to a stylized nickname

interface NicknameRule {
  match: RegExp;
  nicknames: string[];
}

const RULES: NicknameRule[] = [
  // Animals
  { match: /\b(snake|cobra|python|viper)\b/i, nicknames: ['The Cobra', 'Viper', 'The Snake'] },
  { match: /\b(wolf|wolves)\b/i, nicknames: ['Lone Wolf', 'The Wolf', 'Alpha'] },
  { match: /\b(bear|grizzly)\b/i, nicknames: ['The Bear', 'Grizzly'] },
  { match: /\b(tiger|lion|panther|cat|cats)\b/i, nicknames: ['The Tiger', 'Black Panther', 'Wildcat'] },
  { match: /\b(eagle|hawk|falcon)\b/i, nicknames: ['The Hawk', 'Eagle', 'Falcon'] },
  { match: /\b(shark)\b/i, nicknames: ['The Shark'] },
  // Activities
  { match: /\b(juggle|juggling|circus|magic|magician)\b/i, nicknames: ['The Magician', 'Trickster', 'The Showman'] },
  { match: /\b(music|guitar|piano|drum|drums|sing|singer|band)\b/i, nicknames: ['Maestro', 'The Maestro', 'Rhythm'] },
  { match: /\b(dance|dancer|ballet)\b/i, nicknames: ['The Dancer', 'Smooth', 'Lightfoot'] },
  { match: /\b(cook|chef|cooking|baker|bake)\b/i, nicknames: ['Chef', 'The Cook'] },
  { match: /\b(hike|hiking|climb|climbing|mountain)\b/i, nicknames: ['Mountain', 'Climber', 'Summit'] },
  { match: /\b(surf|surfing|ocean|wave|waves)\b/i, nicknames: ['Tidal', 'The Wave', 'Riptide'] },
  { match: /\b(run|runner|marathon|race|racing|fast)\b/i, nicknames: ['Flash', 'Lightning', 'Rocket'] },
  { match: /\b(read|book|books|library|writer|write)\b/i, nicknames: ['Professor', 'The Scholar', 'Sage'] },
  { match: /\b(code|coder|coding|hacker|computer|engineer)\b/i, nicknames: ['The Architect', 'Glitch', 'Cipher'] },
  { match: /\b(art|artist|paint|painting|draw|drawing)\b/i, nicknames: ['Picasso', 'The Artist', 'Brush'] },
  { match: /\b(coffee|espresso|barista)\b/i, nicknames: ['Espresso', 'The Brew'] },
  { match: /\b(quiet|silent|calm|zen)\b/i, nicknames: ['Silent', 'The Quiet One', 'Zen'] },
  { match: /\b(loud|wild|crazy|chaos)\b/i, nicknames: ['Thunder', 'Wildcard', 'Chaos'] },
  { match: /\b(travel|country|countries|world)\b/i, nicknames: ['Wanderer', 'Globe', 'Drifter'] },
  { match: /\b(strong|strength|power|powerful|lift|lifting|gym)\b/i, nicknames: ['The Hammer', 'Iron', 'Anvil'] },
  { match: /\b(fast|speed|quick|swift)\b/i, nicknames: ['Flash', 'Quicksilver', 'Bolt'] },
  { match: /\b(smart|genius|chess|puzzle)\b/i, nicknames: ['The Brain', 'Mastermind', 'Strategist'] },
  { match: /\b(fire|flame|burn|spicy)\b/i, nicknames: ['Inferno', 'Blaze', 'Pyro'] },
  { match: /\b(ice|cold|frozen|winter)\b/i, nicknames: ['Frost', 'Iceman', 'Glacier'] },
  { match: /\b(ghost|silent|stealth|sneaky)\b/i, nicknames: ['Ghost', 'Shadow', 'Phantom'] },
];

const FALLBACK_NICKNAMES = [
  'The Rookie', 'The Newcomer', 'Hidden Dragon', 'Silent Strike',
  'The Wildcard', 'Steady Hands', 'The Quiet Storm',
];

/**
 * Suggest a nickname based on a fun fact string.
 * Uses keyword matching with curated fighter-style monikers.
 * Returns deterministic suggestions per input.
 */
export function suggestNickname(funFact: string): string {
  if (!funFact || funFact.trim().length === 0) return '';
  const text = funFact.toLowerCase();

  for (const rule of RULES) {
    if (rule.match.test(text)) {
      // Pick deterministically based on the fact length so it's stable
      const index = funFact.length % rule.nicknames.length;
      return rule.nicknames[index];
    }
  }

  // Fallback — deterministic from string hash
  let hash = 0;
  for (let i = 0; i < funFact.length; i++) {
    hash = ((hash << 5) - hash + funFact.charCodeAt(i)) | 0;
  }
  return FALLBACK_NICKNAMES[Math.abs(hash) % FALLBACK_NICKNAMES.length];
}
