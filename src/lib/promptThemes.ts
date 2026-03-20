export type PromptTheme = {
  id: string;
  label: string;
  description: string;
  prompts: string[];
};

export const PROMPT_THEMES: PromptTheme[] = [
  {
    id: 'romantic',
    label: 'Romantic',
    description: 'Sweet and heartfelt.',
    prompts: [
      'What’s your favorite memory with [name]?',
      'What should {partner_1} and {partner_2} never stop doing for each other?',
      'What’s one wish you have for their marriage?',
    ],
  },
  {
    id: 'funny',
    label: 'Funny / roast (gentle)',
    description: 'Light jokes, PG-friendly.',
    prompts: [
      'What’s {partner_1} going to argue about first—thermostat or Netflix?',
      'In one sentence: how should {partner_2} survive living with {partner_1}?',
      'What’s the one thing you hope they never tell their kids about tonight?',
    ],
  },
  {
    id: 'advice',
    label: 'Marriage advice',
    description: 'Wisdom from the crowd.',
    prompts: [
      'Give them one piece of marriage advice.',
      'What’s a small habit that makes love last?',
      'What should they prioritize in year one?',
    ],
  },
  {
    id: 'toast',
    label: 'Toast lines',
    description: 'Short lines that feel like a speech bite.',
    prompts: [
      'Finish this toast: “To {partner_1} and {partner_2}—may you always…”',
      'One line you’d put on the wedding program about this couple.',
      'What should we all raise a glass to tonight?',
    ],
  },
];

export function getThemeById(id: string): PromptTheme | undefined {
  return PROMPT_THEMES.find((t) => t.id === id);
}
