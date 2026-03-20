/**
 * Curated prompt library by event type. Hosts can select any number of prompts.
 * Guests see one at a time; they can skip to another prompt a limited number of times.
 * Placeholders: [Name], [name], {partner_1}, {partner_2}, {a}, {b}
 */

/** Max times a guest can tap "New prompt" to swap to a different line from the host's list */
export const GUEST_MAX_PROMPT_SKIPS = 3;

export type PromptCategoryDef = {
  id: string;
  label: string;
  description?: string;
  prompts: string[];
};

export type EventPromptLibrary = {
  eventLabel: string;
  categories: PromptCategoryDef[];
};

function bacheloretteBachelorCategories(_isBachelorette: boolean): PromptCategoryDef[] {
  return [
    {
      id: 'roast',
      label: 'Roast (party energy)',
      description: 'This crowd signed up for it — still keep it loving.',
      prompts: [
        'Tell an embarrassing story about them. This is a safe space.',
        'What is the most chaotic thing you have ever witnessed them do?',
        "What habit of theirs is their partner going to have to deal with forever?",
        'Describe them at their worst — lovingly',
        "What's something they do that has absolutely no explanation?",
      ],
    },
    {
      id: 'sweet',
      label: 'Sweet',
      prompts: [
        'Tell them what you love most about who they are',
        'What do you think makes them an amazing partner?',
        'What moment made you think they had found the right one?',
        'What do you hope marriage brings them?',
        'Tell them something you would want them to carry into this next chapter',
      ],
    },
    {
      id: 'memories',
      label: 'Memories',
      prompts: [
        'Tell the most chaotic story you have about them. Go.',
        "What's a memory of them that perfectly captures who they are?",
        'Tell the story of the moment you knew their partner was the one',
        "What's something small they did that you never forgot?",
      ],
    },
    {
      id: 'predictions',
      label: 'Predictions',
      prompts: [
        "Predict something about their married life that they'd never see coming",
        "What's the first married-people thing they are going to do?",
        'How long before they become the friend who is always home by 10?',
        "What's married life going to look like for them in 5 years?",
      ],
    },
    {
      id: 'advice',
      label: 'Advice',
      prompts: [
        'Give them one piece of real advice for marriage',
        'One thing to hold onto from their single life',
        'What do you know about their partner that they should probably hear?',
        "What's the most important thing they should never stop doing in their relationship?",
      ],
    },
    {
      id: 'actions',
      label: 'Actions & challenges',
      prompts: [
        'Recreate your best memory together right now',
        'Do your best impression of them when they talk about their partner',
        'Sing them out of their single life — any song, go',
        'Give them a hype speech for what is ahead',
        'Tell them something to their face you have never had the guts to say',
        'Show us your best robot. We are judging.',
        'Challenge the person next to you to a robot-off. Film it.',
      ],
    },
  ];
}

/** Keys must match host EVENT_TYPES dropdown values */
export const PROMPT_LIBRARY: Record<string, EventPromptLibrary> = {
  Wedding: {
    eventLabel: 'Wedding',
    categories: [
      {
        id: 'advice',
        label: 'Advice',
        prompts: [
          'One thing you wish someone had told you before getting married',
          'The most underrated thing that actually makes a relationship work',
          'Give them one rule for fighting fair',
          "What's the secret nobody talks about?",
          'What do you know now that you wish you knew at the beginning?',
        ],
      },
      {
        id: 'funny',
        label: 'Funny',
        description: 'Laughing with — safe for mixed crowds.',
        prompts: [
          "What's a completely wrong but very confident piece of marriage advice?",
          'Predict the most ridiculous thing that will happen in their first year of marriage',
          "What's a married people habit they're definitely going to develop?",
          "What song is going to become their accidental married couple anthem?",
          'Give them a rule for marriage that makes absolutely no sense',
          "What's the most chaotic honeymoon moment you can predict for them?",
        ],
      },
      {
        id: 'sweet',
        label: 'Sweet',
        prompts: [
          "Tell them something you've never said out loud",
          'What do you love most about watching them together?',
          "What moment made you think 'yeah, these two are it for each other'?",
          'Describe their relationship in three words — then tell them why',
          'What do you hope for them?',
        ],
      },
      {
        id: 'memories',
        label: 'Memories',
        prompts: [
          'Tell them about a moment with them you still think about',
          'Tell the story of the first time you met them',
          "What's a memory of [name] that perfectly captures who they are?",
          'A moment that made you really proud of them',
          "What's something small they did that you never forgot?",
        ],
      },
      {
        id: 'predictions',
        label: 'Predictions',
        prompts: [
          'Where will they be in 10 years?',
          'What will they argue about most?',
          'Which one caves first in an argument?',
          "Predict something amazing that's going to happen in their marriage",
          "What's their next big adventure?",
        ],
      },
      {
        id: 'actions',
        label: 'Actions & challenges',
        prompts: [
          'Show us your best robot. We are judging.',
          'Give us your best twerk. Commit to it.',
          'Do the worm. Or attempt it. Either works.',
          'Show us your signature move — the one you bust out when the right song comes on',
          'Teach us a dance move right now. We are learning it.',
          'Do your best slow motion walk away from the camera',
          'Show us your best running man',
          'Sing the chorus of their favorite song — but make it opera',
          'Rap a two sentence toast for them. Go.',
          'Do a sports announcer commentary of something happening around you right now',
          'Give us your best movie trailer voice and narrate their love story in 10 seconds',
          'Beatbox for 5 seconds then say something sweet — no transitions',
          "Show us your best 'trying not to cry at a wedding' face",
          'Act out what you were doing when you found out about this event',
          'Recreate your reaction when you got the invitation',
          "Show us your best 'pretending to know the words to a song' performance",
          'Challenge the person next to you to a robot-off. Film it.',
          'Get the person nearest to you to say one word about [Name] — go',
          'Find someone at this event and do a best friend handshake you just made up right now',
        ],
      },
    ],
  },

  Birthday: {
    eventLabel: 'Birthday',
    categories: [
      {
        id: 'funny',
        label: 'Funny',
        description: 'Safe jokes — no roasts.',
        prompts: [
          "What's a completely wrong life lesson you've learned that [Name] should definitely ignore?",
          'Predict the most [Name] thing that will happen to them this year',
          "What's a skill they definitely have that has zero real world application?",
          "What's their spirit animal and why is it slightly embarrassing?",
          'What age are they actually on the inside and what is your evidence?',
        ],
      },
      {
        id: 'sweet',
        label: 'Sweet',
        prompts: [
          'What does [Name] mean to you in one sentence — make it count',
          'Tell them something you love about them that they probably do not know',
          "What's a moment with [Name] you'll never forget?",
          'What makes [Name] one of a kind?',
          'What do you hope this year brings them?',
        ],
      },
      {
        id: 'memories',
        label: 'Memories',
        prompts: [
          'Tell the story of how you two became friends',
          "What's the most [Name] thing [Name] has ever done?",
          'A memory that perfectly captures who they are',
          "What's something small they did that stuck with you?",
          'Tell them about a time they made you laugh until it hurt',
        ],
      },
      {
        id: 'predictions',
        label: 'Predictions',
        prompts: [
          'Where will [Name] be in 5 years?',
          'What ridiculous thing will they definitely do this year?',
          'Predict their next obsession',
          "What milestone is coming for them whether they're ready or not?",
        ],
      },
      {
        id: 'advice',
        label: 'Advice',
        prompts: [
          "What's one thing you want them to do more of this year?",
          'One thing they should absolutely stop doing',
          "What do you know at your age that you wish you'd known earlier?",
          "What's the best advice you'd give them for the year ahead?",
        ],
      },
      {
        id: 'actions',
        label: 'Actions & challenges',
        prompts: [
          'Sing them a birthday song — but make it weird',
          'Do your best impression of them. Right now.',
          "Tell them one thing to their face that you'd normally only text",
          'Show them your best birthday dance',
          'Say something embarrassing about yourself to make them feel less alone about getting older',
          'Show us your best robot. We are judging.',
          'Give us your best twerk. Commit to it.',
          'Rap a two sentence birthday toast. Go.',
        ],
      },
    ],
  },

  Anniversary: {
    eventLabel: 'Anniversary',
    categories: [
      {
        id: 'advice',
        label: 'Advice',
        prompts: [
          "What's the ingredient you think has kept them going strong?",
          'What do they do better than most couples you know?',
          "What's one thing you've learned about love from watching them?",
          "What would you tell a couple just starting out based on watching these two?",
        ],
      },
      {
        id: 'sweet',
        label: 'Sweet',
        prompts: [
          'What do you love most about who they are together?',
          'Tell them what their relationship has meant to the people around them',
          "What moment made you think 'that's real love right there'?",
          "What's something about their relationship that gives you hope?",
          'Describe them as a couple in three words',
        ],
      },
      {
        id: 'memories',
        label: 'Memories',
        prompts: [
          "What's your favorite memory of them as a couple?",
          'Tell the story of when you knew they were the real deal',
          "What's changed most about them since they got together — in the best way?",
          'A moment they probably do not know you witnessed but you will never forget',
        ],
      },
      {
        id: 'funny',
        label: 'Funny',
        prompts: [
          "What couple habit of theirs is equal parts chaotic and adorable?",
          "Predict what they'll still be debating in another 10 years",
          "What's a married people thing they do that is very them specifically?",
          "What's something about their relationship that confuses everyone else but clearly works?",
        ],
      },
      {
        id: 'predictions',
        label: 'Predictions',
        prompts: [
          'Where will they be in another ten years?',
          "What's the next big chapter for them?",
          'What are they going to absolutely nail together?',
        ],
      },
      {
        id: 'actions',
        label: 'Actions & challenges',
        prompts: [
          'Show us your best robot. We are judging.',
          'Sing the chorus of their song — but make it opera',
          'Give us your best movie trailer voice and narrate their story in 10 seconds',
          'Challenge the person next to you to a robot-off. Film it.',
        ],
      },
    ],
  },

  'Baby shower': {
    eventLabel: 'Baby shower',
    categories: [
      {
        id: 'advice',
        label: 'Advice',
        prompts: [
          'The most honest thing you can tell a new parent',
          'What nobody warns you about but absolutely should',
          "What's the best advice you got as a new parent — or wish you had?",
          'One thing to let go of before the baby arrives',
          "What's actually going to get them through the hard nights?",
        ],
      },
      {
        id: 'sweet',
        label: 'Sweet',
        prompts: [
          'Tell them what kind of parent you know they are going to be',
          'What do you hope this baby gets from {partner_1}? From {partner_2}?',
          'What does watching them prepare for this moment make you feel?',
          'What do you want this baby to know about their parent(s)?',
          'What are you most excited to watch them experience?',
        ],
      },
      {
        id: 'funny',
        label: 'Funny',
        prompts: [
          "Predict the most chaotic first year moment they're completely unprepared for",
          'What parenting trend are they definitely going to try and then immediately abandon?',
          "What baby name they almost definitely considered that we should all be grateful didn't happen?",
          "What's the most [Name] thing the baby is definitely going to inherit?",
        ],
      },
      {
        id: 'predictions',
        label: 'Predictions',
        prompts: [
          "What's this baby going to be obsessed with?",
          "Who's the baby going to have wrapped around their finger first?",
          "What's this kid going to be when they grow up?",
          'Predict the first word',
          "What's the first family trip going to be?",
        ],
      },
      {
        id: 'memories',
        label: 'Memories',
        prompts: [
          'Tell them about a moment they did something that made you think they would be an amazing parent',
          "What's something about [Name] that this baby is lucky to be getting?",
          'A quality of theirs you hope gets passed down',
        ],
      },
      {
        id: 'actions',
        label: 'Actions & messages',
        prompts: [
          "Leave the baby a message — they'll watch this someday",
          "Sing the baby a song — any song, it doesn't have to make sense",
          'Give the baby one piece of life advice right now',
          'Tell the baby something their parent(s) would never tell them themselves',
        ],
      },
    ],
  },

  Graduation: {
    eventLabel: 'Graduation',
    categories: [
      {
        id: 'advice',
        label: 'Advice',
        prompts: [
          'The one thing you wish someone had told you when you were their age',
          "What's actually useful out there that nobody teaches you in school?",
          'What would you do differently if you were starting where they are right now?',
          'The most important thing they should protect as they get started',
          'What does success actually look like — honestly?',
        ],
      },
      {
        id: 'hype',
        label: 'Hype / sweet',
        prompts: [
          'Tell them something you have watched them do that made you genuinely proud',
          'What do you think they are going to absolutely kill it at?',
          'What quality of theirs is going to take them far?',
          'Tell them what you see when you look at where they are headed',
          'What are you most excited to watch them do next?',
        ],
      },
      {
        id: 'funny',
        label: 'Funny',
        prompts: [
          'What skill from their school years is going to be completely useless in real life?',
          "Predict their first real-world disaster — lovingly",
          "What are they going to miss most that they don't even appreciate yet?",
          'Give them the most unhelpful career advice you can think of',
        ],
      },
      {
        id: 'memories',
        label: 'Memories',
        prompts: [
          'Tell them about a moment they surprised you',
          "What's a memory of them that captures exactly who they are?",
          'Tell the story of when you knew they were going to be okay',
          'What growth in them has been the most fun to watch?',
        ],
      },
      {
        id: 'predictions',
        label: 'Predictions',
        prompts: [
          'Where will they be in 5 years?',
          'What are they going to figure out about themselves next?',
          "What's their first big win going to be?",
          'What chapter comes after this one for them?',
        ],
      },
      {
        id: 'actions',
        label: 'Actions & challenges',
        prompts: [
          'Give them a pep talk. Right now. Full energy.',
          'Do your best impression of them during their most stressed school moment',
          'Tell them one thing to their face you have been meaning to say',
          "Sing them a pump-up song for what's ahead",
          'Show us your best robot. We are judging.',
        ],
      },
    ],
  },

  Bachelorette: {
    eventLabel: 'Bachelorette',
    categories: bacheloretteBachelorCategories(true),
  },
  Bachelor: {
    eventLabel: 'Bachelor',
    categories: bacheloretteBachelorCategories(false),
  },

  Other: {
    eventLabel: 'Other / general',
    categories: [
      {
        id: 'sweet',
        label: 'Sweet',
        prompts: [
          'Tell them something you love about them that you do not say enough',
          'What makes them one of a kind?',
          'What do you hope for them?',
          'Tell them about a moment they made a real difference to you',
        ],
      },
      {
        id: 'funny',
        label: 'Funny',
        prompts: [
          'Give them the most confidently wrong advice you can think of',
          "Predict something ridiculous that's definitely in their future",
          "What's a completely made up fact about them that somehow feels true?",
          'What are they absolutely terrible at and why is it endearing?',
        ],
      },
      {
        id: 'memories',
        label: 'Memories',
        prompts: [
          'Tell them about a moment with them you still think about',
          "What's a memory that perfectly captures who they are?",
          'Tell the story of how you two became close',
        ],
      },
      {
        id: 'advice',
        label: 'Advice',
        prompts: [
          "What's one thing you want them to do more of?",
          'What do you know that you wish someone had told you?',
          "What's the most important thing they should never forget?",
        ],
      },
      {
        id: 'actions',
        label: 'Actions & challenges',
        prompts: [
          "Say something to their face you'd normally only text",
          'Do your best impression of them right now',
          'Give them a full hype speech — no holding back',
          'Sing them something. Anything. Go.',
          'Show us your best robot. We are judging.',
        ],
      },
    ],
  },
};

PROMPT_LIBRARY.Engagement = {
  eventLabel: 'Engagement',
  categories: PROMPT_LIBRARY.Wedding.categories,
};

PROMPT_LIBRARY.Retirement = {
  eventLabel: 'Retirement',
  categories: PROMPT_LIBRARY.Other.categories,
};

PROMPT_LIBRARY['Rehearsal Dinner'] = {
  eventLabel: 'Rehearsal Dinner',
  categories: [
    {
      id: 'rehearsal_advice',
      label: 'Advice',
      prompts: [
        'The one thing you want them to know before tomorrow',
        'What do you hope they remember about today when they look back?',
        'What would you tell them if you had five minutes alone with them right now?',
        'What do you know about love that you wish someone had told you before your big moments?',
        "What's the most important thing they should hold onto after tomorrow?",
      ],
    },
    {
      id: 'rehearsal_sweet',
      label: 'Sweet',
      prompts: [
        'Tell them something you want them to carry into tomorrow',
        'What do you love most about who they are on the eve of the biggest day of their lives?',
        'What moment between them made you certain they were ready for this?',
        'What do you hope they feel when they wake up tomorrow?',
        'Tell them what watching them get here has meant to you',
      ],
    },
    {
      id: 'rehearsal_memories',
      label: 'Memories',
      prompts: [
        'Tell them about a moment that made you proud to know them',
        "What's a memory of them that perfectly captures why tomorrow makes complete sense?",
        'Tell the story of when you first realized they were the real deal',
        "What's something about them individually that you hope they never lose?",
        "A moment you witnessed between them that you've never told them about",
      ],
    },
    {
      id: 'rehearsal_funny',
      label: 'Funny',
      prompts: [
        "Predict something chaotic that's definitely going to happen tomorrow",
        "What's the most [Partner] thing that could go wrong tomorrow and would they handle it?",
        "What's something about wedding planning that aged them five years and it shows?",
        'Give them one completely useless piece of advice for tomorrow specifically',
        "What's the most elaborate thing they stressed about that absolutely nobody will notice?",
      ],
    },
    {
      id: 'rehearsal_predictions',
      label: 'Predictions',
      prompts: [
        'Where will they be this time next year?',
        "What's the first married people thing they're going to do on the honeymoon?",
        "What's tomorrow going to feel like for them - predict the exact emotional journey",
        "What's going to be the unexpected best moment of tomorrow?",
      ],
    },
    {
      id: 'rehearsal_night_before',
      label: 'The Night Before',
      prompts: [
        'Tell them something you want them to hear before they go to sleep tonight',
        'What do you want them to feel when they wake up tomorrow morning?',
        "If you could give them one gift that isn't a thing, what would it be?",
        "What's one thing you want them to actually slow down and notice tomorrow?",
        'Tell them what tomorrow means to the people who love them',
      ],
    },
  ],
};

const UNIVERSAL_PERFORMANCE_CATEGORIES: PromptCategoryDef[] = [
  {
    id: 'speeches_unsaid',
    label: 'Speeches - The unsaid toast',
    description: "The things people would have said if they'd had the mic.",
    prompts: [
      "Say what you would have said if you'd had the mic tonight",
      "Give the toast you've been rehearsing in your head all week",
      'Say the thing you kept editing out because it felt like too much - put it back in',
      "What would your toast have been if you'd had two minutes and everyone was listening?",
      "Finish this sentence out loud: 'What I really want to say is...'",
    ],
  },
  {
    id: 'movie_tv_quotes',
    label: 'Movie & TV quotes',
    prompts: [
      'Quote a movie or TV show that perfectly describes [name] or their relationship and explain why',
      "What's a movie quote that could double as advice for their marriage?",
      'Quote something that perfectly captures this exact moment in their life',
      "What movie or TV character are they and what's their most iconic line?",
      "If their relationship was a movie what's the most memorable line from it?",
    ],
  },
  {
    id: 'songs',
    label: 'Songs',
    prompts: [
      'Sing a song that reminds you of [name] and explain why before you start',
      'Sing the chorus of your go-to karaoke song dedicated to them',
      'Sing your favorite 90s pop song with full commitment',
      'Sing the first song that comes to mind when you think of them',
      'Duet with the person next to you on a song neither of you fully knows',
    ],
  },
];

export function getPromptLibraryForEventType(eventType: string | null | undefined): EventPromptLibrary {
  const key = (eventType || 'Other').trim();
  const base = PROMPT_LIBRARY[key] ?? PROMPT_LIBRARY.Other;
  const existing = new Set(base.categories.map((c) => c.id));
  const extras = UNIVERSAL_PERFORMANCE_CATEGORIES.filter((c) => !existing.has(c.id));
  return { ...base, categories: [...base.categories, ...extras] };
}
