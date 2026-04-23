export const SENPAI_DIALOGUE = {
  appOpen: [
    "Senpai! You're here! \u2661",
    "Yay! Senpai came to train!",
    "I've been waiting for you, Senpai~!",
    "Welcome back, Senpai! Let's go!",
    "Senpai! I knew you'd come today!",
    "*bounces excitedly* SENPAI!!",
  ],
  workoutStart: [
    "Senpai is so strong! Ganbare!!",
    "You can do it, Senpai! I believe in you!",
    "FIGHT-O, SENPAI! FIGHT-O!!",
    "Show them your power, Senpai!",
    "Senpai's training arc begins NOW!",
    "Go go go, Senpai!! \u2605\u2605\u2605",
  ],
  workoutComplete: [
    "SUGOI, SENPAI!! You did it!!",
    "Senpai is amazing! So cool!",
    "That was INCREDIBLE, Senpai!",
    "Senpai leveled up IRL! \u2661\u2661\u2661",
    "You're the strongest, Senpai!",
    "KYAAA~! Senpai is so awesome!",
  ],
  newPR: [
    "NANI?! A NEW RECORD?! SENPAI!!",
    "S-senpai... you're too powerful!",
    "MASAKA! Senpai broke the limit!",
    "This is Senpai's ULTIMATE FORM!",
    "NEW PR?! I'm gonna cry, Senpai! T_T",
    "*faints from amazement*",
  ],
  streakMilestone: [
    "Senpai's dedication... *tears up*",
    "NEVER GIVE UP! That's my Senpai!",
    "The streak continues!! YATTA!",
    "Senpai's willpower is OVER 9000!",
  ],
  levelUp: [
    "LEVEL UP!! Senpai evolved!",
    "Senpai got stronger! SUGOI!",
    "Is this... Senpai's final form?!",
    "\u2605 CONGRATULATIONS, SENPAI! \u2605",
  ],
  achievement: [
    "Achievement unlocked! Sasuga Senpai!",
    "Senpai collects them all!",
    "Another badge for Senpai's collection!",
  ],
  idle: [
    "Senpai...? Are you there...?",
    "*pokes screen* Senpai~?",
    "Don't leave me, Senpai!",
    "Senpai is thinking deeply...",
    "I'll wait for Senpai forever \u2661",
  ],
  mascotTap: [
    "Kya~! S-senpai noticed me!",
    "Hehe~ Senpai tapped me!",
    "What is it, Senpai? \u2661",
    "I'm here for you, Senpai!",
    "Senpai! That tickles!",
    "*blushes* S-senpai...!",
  ],
  nutritionLog: [
    "Senpai is eating healthy! Good!",
    "Protein! Senpai needs protein!",
    "Balanced diet = strong Senpai!",
  ],
  morning: [
    "Ohayo, Senpai~!",
    "Good morning, Senpai! Let's train!",
    "Rise and shine, Senpai! \u2661",
  ],
  evening: [
    "Late night training, Senpai? Sugoi!",
    "Senpai works so hard... \u2661",
    "Even at night, Senpai trains!",
  ],
  streakBroken: [
    "Senpai... the streak... *sniff*",
    "It's okay, Senpai! Start again!",
    "Don't give up, Senpai! I believe in you!",
  ],
  gpsActivity: [
    "YOU RAN?! WITH YOUR LEGS?! LEGENDARY!!",
    "Senpai tracked every step... *heavy breathing*... so proud...",
    "MY SENPAI IS A CARDIO GOD!!",
    "The GPS satellites CANNOT HANDLE Senpai's speed!",
    "*sweating just watching* Senpai went the DISTANCE!",
    "Every step Senpai took, I was there in SPIRIT \u2661",
  ],
  meditation: [
    "Your chakras are IMMACULATE right now",
    "Senpai tried meditating once... fell asleep in 4 seconds",
    "S-senpai achieved INNER PEACE?! Teach me!!",
    "*whispers* don't break Senpai's zen... don't breathe...",
    "Senpai is ONE with the universe now! Sasuga!",
    "Mind: empty. Soul: glowing. Senpai: ASCENDED.",
  ],
  bodyLab: [
    "These numbers are giving MAIN CHARACTER energy",
    "Senpai analyzed your scan... *adjusts glasses*... perfection detected",
    "The data does NOT lie. Senpai is EVOLVING.",
    "*clutches clipboard* This is peak Senpai science!!",
    "Every metric says Senpai = unstoppable force",
    "My calculations confirm it: Senpai broke the chart!",
  ],
  transformation: [
    "Moon Prism Power... MAKE UP! \u2727",
    "In the name of the gains, I'll punish you!",
    "Senpai Mode... ACTIVATED! \u2661",
    "This isn't even my final form, Senpai~!",
    "TRANSFORMATION COMPLETE! \u2606",
    "The pretty guardian of gainz has arrived!",
  ],
};

export function randomDialogue(key: keyof typeof SENPAI_DIALOGUE): string {
  const options = SENPAI_DIALOGUE[key];
  return options[Math.floor(Math.random() * options.length)];
}
