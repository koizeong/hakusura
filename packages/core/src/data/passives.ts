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
  whetstone: {
    name: '砥石の癖',
    description: '斬ダメージ+35%',
    modifiers: [{ tags: ['slash'], value: 0.35 }],
  },
  pyromaniac: {
    name: '火に魅入られた者',
    description: '燃えている敵への与ダメージ+40%',
    rules: [{ label: '火に魅入られた者', on: 'damage', when: [{ type: 'targetHas', status: 'burn' }], add: 0.4 }],
  },
  stormFinger: {
    name: '雷を呼ぶ指',
    description: '感電の蓄積+60%',
    modifiers: [{ stat: 'buildup', tags: ['lightning'], value: 0.6 }],
  },
  closeQuarters: {
    name: '間合い詰め',
    description: '近攻撃のクールダウン-20%',
    modifiers: [{ stat: 'cooldown', tags: ['melee'], value: -0.2 }],
  },
  thickSkin: {
    name: '厚い皮',
    description: '最大HP+30%、移動速度-10%',
    modifiers: [
      { stat: 'maxHp', tags: [], value: 0.3 },
      { stat: 'moveSpeed', tags: [], value: -0.1 },
    ],
  },
  oilSoaked: {
    name: '油染み',
    description: '自分が油まみれの間、火ダメージ+60%',
    rules: [
      {
        label: '油染み',
        on: 'damage',
        when: [
          { type: 'attackerHas', status: 'oiled' },
          { type: 'hitHasTag', tag: 'fire' },
        ],
        add: 0.6,
      },
    ],
  },
  bloodRush: {
    name: '血の昂り',
    description: '自分が付けた出血が発動すると、近攻撃のクールダウンが0.5秒縮む',
    rules: [
      {
        label: '血の昂り',
        on: 'statusActivate',
        when: [{ type: 'statusIs', status: 'bleed' }],
        do: [{ type: 'cooldown', ms: 500, tags: ['melee'] }],
      },
    ],
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
