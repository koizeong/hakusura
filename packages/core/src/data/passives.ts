import type { Modifier, Rule } from '../rules';

export interface PassiveDef {
  name: string;
  description: string;
  modifiers?: readonly Modifier[];
  rules?: readonly Rule[];
}

/** パッシブスキル */
export const PASSIVES = {
  sootPrayer: {
    name: '煤けた祈り',
    description: '火と雷のダメージ+30%',
    modifiers: [
      { tags: ['fire'], value: 0.3 },
      { tags: ['lightning'], value: 0.3 },
    ],
  },
  bloodCallsThunder: {
    name: '血を呼ぶ雷',
    description: '自分が付けた出血が発動すると、その者に雷が落ちる',
    rules: [
      {
        label: '血を呼ぶ雷',
        on: 'statusActivate',
        when: [{ type: 'statusIs', status: 'bleed' }],
        do: [{ type: 'strike', element: 'lightning', power: 20, buildup: 50, tags: ['thunderbolt'] }],
      },
    ],
  },
} as const satisfies Record<string, PassiveDef>;

export type PassiveId = keyof typeof PASSIVES;
export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

export function passiveDef(id: PassiveId): PassiveDef {
  return PASSIVES[id];
}
