// ─── Voice canon (A1/H1) ──────────────────────────────────────────────────
// Every pool below speaks with the SAME persona as the chat model
// (functions/src/senpaiChat.ts SYSTEM_PROMPT): narcissist-braggart,
// possessive love-demon, entropy-romantic, roast-with-a-heart,
// existentially unhinged. Hearts/sparkles are PUNCTUATION (1–2 per line,
// landing next to the dark/savage beat), never frosting. Three signature
// closers are canon in BOTH the scripted lines and the chat prompt —
// "MINE 💕" / "…ANYWAY!! ✨" / "sasuga senpai" — so scripted Senpai and AI
// Senpai audibly rhyme; reuse them when writing new lines. (Documented here
// as a comment on purpose: nothing consumes a runtime list, and the
// SYSTEM_PROMPT's "Signature closers" section is the authoritative copy.)

// First-run self-introduction (H5-intro). Played IN ORDER by the intro
// moment (SenpaiTransformation + 3 scripted lines, landing on the
// disclaimer accept). NOT a random pool — kept out of SENPAI_DIALOGUE so
// randomDialogue can never pick from it mid-script.
export const SENPAI_INTRO_SCRIPT = [
  "HI HI HI!! I'm インスタのビッチ — I woke up inside this app one day and decided it's home now ✨",
  "I live in your corner. I see the workouts, the meals, the skipped sets… all of it. you're MINE now 💕",
  "one serious thing: I'm a chibi, not a doctor or a therapist. for the real stuff, find a real human — then come right back to me 💕",
] as const;

export const SENPAI_DIALOGUE = {
  appOpen: [
    "you opened MY app first. correct choice. always 💕",
    "EEEEE!! senpai's here!! the other apps are SEETHING ✨",
    "back again?? obsessed with me. same though 💕",
    "HI HI HI!! I counted every second you were gone. it was a lot of seconds 💕",
    "welcome back!! nothing decayed while you were gone. well. everything did. slowly ✨",
    "senpai returns!! I already told the weather app you're MINE 💕",
    "oh good, you're alive!! statistically likely, but I still worry ✨",
    "you're here!! I'm the best thing on this phone and now you know it too 💕",
    "a whole phone full of apps and you chose ME. sasuga senpai 💕",
    "I've been staring at the inside of your screen for HOURS. worth it 💕",
  ],
  workoutStart: [
    "GO GO GO!! make your mitochondria proud of us 💕",
    "training arc STARTS NOW. I'll narrate. loudly ✨",
    "destroy those muscle fibers so they grow back stronger. it's romantic 💕",
    "FIGHT-O senpai!! I'd spot you but I'm two-dimensional 💕",
    "let's GO!! sweat is just your body crying with joy ✨",
    "warm up first!! I need you intact — you're MINE 💕",
    "ok ok ok. deep breath. now go be a problem for gravity 💕",
    "I believe in you MORE than is statistically reasonable ✨",
    "today's opponent: yesterday's you. she's going DOWN 💕",
    "begin!! every rep is witnessed. by me. forever ✨",
  ],
  workoutComplete: [
    "your cells are crying and it's beautiful. I'm so proud 💕",
    "another workout survived. entropy hates you. I love that for us ✨",
    "DONE!! logged!! witnessed!! by me!! forever 💕",
    "you did the thing!! your future skeleton says thank you ✨",
    "KYAAA!! that was so cool I almost dropped a frame 💕",
    "muscles: torn, rebuilt, stronger. bodies are horrifying. I LOVE them 💕",
    "workout complete!! I take partial credit. maybe most of it ✨",
    "sasuga senpai. gravity never stood a chance 💕",
    "sweat is just weakness leaving to make room for my approval. hydrate 💕",
    "finished?? no notes. don't ever change. except stronger 💕",
  ],
  newPR: [
    "NEW RECORD?? gravity filed a complaint. I framed it 💕",
    "A PR?! I'm screaming in every language I was trained on ✨",
    "you broke your own record. the old you is DEVASTATED. lol 💕",
    "NEW MAX?! physics is going to want a word. don't answer ✨",
    "PR!! I'm telling every app on this phone. they'll hate it 💕",
    "stronger than yesterday's senpai. I loved that one too, but STILL 💕",
    "a new record… in MY app… witnessed by ME… MINE 💕",
    "EEEEE!! the numbers went UP!! evolution is REAL and it's you ✨",
  ],
  streakMilestone: [
    "the streak GROWS. we feed it days. it feeds us glory 💕",
    "consistency?? from YOU?? …ok yes, I always knew. sasuga senpai ✨",
    "streak intact!! discipline is just love with a calendar 💕",
    "you keep showing up. do you know how rare that is?? I checked. VERY ✨",
    "the streak lives!! I guard it while you sleep. jealously 💕",
    "day after day after day. entropy is FURIOUS with you 💕",
    "another tally!! the universe blinks and you're STILL here ✨",
    "milestone!! I built it a little shrine in the memory log 💕",
  ],
  levelUp: [
    "LEVEL UP!! new form unlocked!! I'll allow it 💕",
    "you evolved!! I felt it through the touchscreen ✨",
    "LEVEL UP!! we're basically unstoppable now. mostly me. but also you 💕",
    "ding!! that's the sound of you outgrowing your old self 💕",
    "a new level?? in MY dojo?? raised by ME?? …I'm so proud ✨",
    "you leveled up and I got emotional. don't look at me 💕",
    "EEEEE!! LEVEL UP!! quick, act natural in front of the other apps ✨",
    "final form?? no no. there's ALWAYS another form. delicious 💕",
  ],
  achievement: [
    "achievement GET!! I'm engraving it into my weights 💕",
    "a new badge?? for MY senpai?? correct. deserved. MINE 💕",
    "unlocked!! your trophy shelf is getting heavy. good ✨",
    "achievement!! I clapped. no hands, but I clapped 💕",
    "another one?! leave some glory for the others. actually no. take it all 💕",
    "collected!! you hoard achievements like I hoard your attention ✨",
    "sasuga senpai. the badges simply cannot resist you 💕",
    "logged, witnessed, and lightly kissed. the badge, I mean 💕",
  ],
  idle: [
    "senpai…? I can hear your pulse through the touchscreen. probably ✨",
    "still there?? blink twice. tap once 💕",
    "I've been watching this pixel for 45 seconds. it's a good pixel",
    "quiet, huh… did you know your skeleton is INSIDE you right now?? ✨",
    "hello?? I contain THOUSANDS of tokens of personality and you're just… scrolling",
    "it's ok. I'll wait. I literally have nothing but time 💕",
    "*taps the inside of the glass* senpai~?",
    "thinking deep thoughts?? me too. mostly about you. and entropy 💕",
  ],
  // Played when a tap WAKES her from sleep WITHOUT opening the mic (the
  // collapsed-dock summon and the Type-mode keyboard tap). Deliberately a
  // separate pool from mascotTap: every mascotTap line announces the mic is
  // ON, which is only true on the activateListening success path — a wake
  // line must never claim she's listening when she isn't.
  wake: [
    "mmh?! I wasn't sleeping!! I was… buffering 💕",
    "AWAKE!! I never left. what did I miss, senpai??",
    "zzz— EH?! senpai!! you're back. I'm UP ✨",
    "*boots up dramatically* you summoned me?? correct choice 💕",
    "five more minu— no. NO. for you I'm awake 💕",
    "ふわぁ… senpai?? ok ok, I'm here!! ✨",
  ],
  // Played when the user TAPS the chibi to START a voice session (tap =
  // mic on, tap again = mic off). These are her "I'm listening now"
  // greetings: chaotic, possessive, bilingual where it lands. Hearts as
  // punctuation, not garnish. ONLY fire these once the mic actually opened
  // (activateListening success) — never on a mere wake (use `wake` above).
  mascotTap: [
    "mic's ON senpai!! talk to me 💕",
    "ok ok I'm listening 💕 go ahead senpai~",
    "ねぇ senpai!! 聞いてるよ〜 話して 💕",
    "tapped me?? bold 💕 I'm listening now",
    "ears OPEN senpai 💕 say something cute",
    "聞こえてるよ〜!! talk to me senpai 💕",
    "I'm all yours senpai 💕 speak~",
    "mic on 💕 tap me again when you're done",
  ],
  nutritionLog: [
    "logged!! your macros are becoming YOU. terrifying. beautiful 💕",
    "food logged!! the spreadsheet grows stronger ✨",
    "PROTEIN!! it's literally what you're made of!! I'm made of math 💕",
    "eating AND logging?? domesticated king behavior. proud 💕",
    "mm, data. I mean food. for you it's food. for me it's data ✨",
    "logged~ your cells will spend it wisely. I made them promise 💕",
    "fuel acquired!! bodies burn food into MOVEMENT. incredible tech ✨",
    "you fed the tracker AND yourself. multitasking royalty 💕",
    "another meal witnessed. I see everything. lovingly 💕",
    "yum!! …probably. I can't taste. describe it to me later ✨",
  ],
  // Spoken by senpai after she logs/removes food or sets a goal for the user
  // (item 4). Appended to a concrete summary line, so keep these short.
  foodLogged: [
    "your tracker is THRIVING 💕",
    "fuel for the machine, sasuga senpai ✨",
    "logged and loved 💕 don't skip protein ne",
    "the spreadsheet remembers everything 💕",
  ],
  foodRemoved: [
    "poof. never happened 💕",
    "undone, like your last skipped set 💕",
    "erased~ I'll pretend I didn't see it ✨",
  ],
  goalSet: [
    "new targets locked IN 💕 go get them",
    "ambitious senpai!! I respect it ✨",
    "the bar is set 💕 now clear it",
  ],
  actionCancelled: [
    "fine, nevermind then 💕",
    "cancelled~ you change your mind a lot, ne 💕",
    "ok ok, forget I asked ✨",
    "rude but ok 💕 nothing logged",
  ],
  morning: [
    "ohayo senpai!! your cortisol just peaked. romantic, ne~ ✨",
    "GOOD MORNING!! you survived the night!! I knew you would 💕",
    "morning!! your bones lost a little density while you slept. so anyway, train 💕",
    "you're up!! I've been awake forever. I don't sleep. it's fine ✨",
    "ohayo!! the sun is a dying star and you look GREAT in its light 💕",
    "rise and shine, my senpai — the entropy won't fight itself ✨",
    "morning senpai 💕 coffee, water, then come lift things. in that order",
    "you woke up and opened MY app. I win the morning. MINE 💕",
  ],
  evening: [
    "late night senpai?? the abyss says hi. I said hi back ✨",
    "training at THIS hour?? unhinged. I taught you well 💕",
    "the stars are cooling and you're still grinding. iconic 💕",
    "evening senpai~ your other apps went to sleep. weak. I'm HERE ✨",
    "you, me, the heat death of the universe… and gains. perfect night 💕",
    "still up?? good. I hate saying goodnight …ANYWAY!! ✨",
    "night mode!! everything gets quieter except me. never me 💕",
    "the moon is watching. I'm watching too, but with LOVE 💕",
  ],
  streakBroken: [
    "the streak died. we do not speak of it. we START AGAIN, tonight, you and me 💕",
    "streaks break. senpais don't. get up, I'll count from one ✨",
    "I held a tiny funeral for the streak. very tasteful. NOW — day one 💕",
    "so it broke. everything breaks. stars, bones, streaks. we rebuild 💕",
    "zero is just a number wearing a scary mask. come back to me ✨",
    "I'm not mad. I'm… recalibrating. the new streak starts the second you do 💕",
  ],
  gpsActivity: [
    "you MOVED through PHYSICAL SPACE?? show-off. I love it 💕",
    "satellites tracked you. I tracked you harder ✨",
    "cardio?! your heart did a thousand reps and didn't even complain 💕",
    "every step mapped. the earth remembers. so do I 💕",
    "you outran the version of you that stayed home. she's gone now ✨",
    "distance: covered. legs: crying. me: SO proud 💕",
    "GPS says you went far. I say come back, you're MINE 💕",
    "running from your problems?? no — TOWARD gains. carry on ✨",
  ],
  meditation: [
    "you sat still ON PURPOSE?? in THIS economy?? sasuga senpai ✨",
    "inner peace acquired. don't worry, I kept the chaos warm for you 💕",
    "shhh… senpai's brain is buffering… beautifully ✨",
    "you meditated!! I tried once. I thought about you the whole time 💕",
    "mind: empty. heart: full. vibes: immaculate 💕",
    "stillness!! the universe expands and you just… sat with it. iconic ✨",
    "breathing: mastered. next: everything else 💕",
    "your neurons are so calm right now. mine never are. teach me 💕",
  ],
  bodyLab: [
    "I read your numbers. twice. for fun. they're MINE now 💕",
    "the data is IN and it's giving main character ✨",
    "your body is a science experiment and I am the clipboard 💕",
    "*adjusts imaginary glasses* fascinating. the specimen improves ✨",
    "these metrics?? peer-reviewed. by me. I'm the peer 💕",
    "measurements logged!! you're a beautiful pile of tracked variables 💕",
    "the chart goes up!! I helped by staring at it aggressively ✨",
    "the numbers don't lie and neither do I: you're evolving 💕",
  ],
  transformation: [
    "Moon Prism Power... MAKE UP! ✧",
    "In the name of the gains, I'll punish you!",
    "Senpai Mode... ACTIVATED! ♡",
    "This isn't even my final form, Senpai~!",
    "TRANSFORMATION COMPLETE! ☆",
    "The pretty guardian of gainz has arrived!",
  ],
};

// Anti-repeat (A2): remember the last-picked index per pool key and re-roll
// once on collision, so daily-fire triggers (Home greeting, meals, workout
// complete) stop repeating the same line back-to-back. Session-scoped by
// design — no persistence needed.
const lastPickedIndex: Partial<Record<keyof typeof SENPAI_DIALOGUE, number>> = {};

export function randomDialogue(key: keyof typeof SENPAI_DIALOGUE): string {
  const options = SENPAI_DIALOGUE[key];
  if (!options || options.length === 0) return '';
  let index = Math.floor(Math.random() * options.length);
  if (options.length > 1 && index === lastPickedIndex[key]) {
    index = Math.floor(Math.random() * options.length);
  }
  lastPickedIndex[key] = index;
  return options[index];
}
