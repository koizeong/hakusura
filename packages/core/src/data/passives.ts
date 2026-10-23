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
  heavyHand: {
    name: '重い手',
    description: '近攻撃のダメージ+40%、移動速度-15%',
    modifiers: [
      { tags: ['melee'], value: 0.4 },
      { stat: 'moveSpeed', tags: [], value: -0.15 },
    ],
  },
  fleetFoot: {
    name: '逃げ足',
    description: '移動速度+30%、近攻撃のダメージ-15%',
    modifiers: [
      { stat: 'moveSpeed', tags: [], value: 0.3 },
      { tags: ['melee'], value: -0.15 },
    ],
  },
  emberHeart: {
    name: '燠の心臓',
    description: '炎上の蓄積+60%',
    modifiers: [{ stat: 'buildup', tags: ['fire'], value: 0.6 }],
  },
  stormCaller: {
    name: '嵐を招く者',
    description: '雨の間、雷のダメージ+50%',
    rules: [
      {
        label: '嵐を招く者',
        on: 'damage',
        when: [
          { type: 'weather', weather: 'rain' },
          { type: 'hitHasTag', tag: 'lightning' },
        ],
        add: 0.5,
      },
    ],
  },
  bloodletter: {
    name: '瀉血',
    description: '自分が出血中なら、与ダメージ+60%',
    rules: [{ label: '瀉血', on: 'damage', when: [{ type: 'attackerHas', status: 'bleed' }], add: 0.6 }],
  },
  readTheBlow: {
    name: '見切りの心得',
    description: '敵の直撃を30%の確率で見切る(次の攻撃が倍)',
    rules: [{ label: '見切りの心得', on: 'incoming', when: [], chance: 0.3, as: 'justDodge' }],
  },
  parryStance: {
    name: '弾きの構え',
    description: '敵の直撃を20%の確率で弾く(相手が昏倒)',
    rules: [{ label: '弾きの構え', on: 'incoming', when: [], chance: 0.2, as: 'justGuard' }],
  },
} as const satisfies Record<string, PassiveDef>;

export type PassiveId = keyof typeof PASSIVES;
export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

export function passiveDef(id: PassiveId): PassiveDef {
  return PASSIVES[id];
}
