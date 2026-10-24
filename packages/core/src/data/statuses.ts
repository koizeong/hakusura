import type { ElementId } from './elements';
import type { Modifier } from '../rules';

/** 状態が発動した瞬間に起きること。威力は状態の属性で計算する */
export type ActivationEffect =
  /** 状態にかかった者と、radius 内にいるその仲間に当たる。radius 0 なら本人だけ */
  | { type: 'burst'; power: number; radius: number; buildup?: number }
  /** 状態にかかった者の近くの仲間 count 体へ飛び移る */
  | { type: 'chain'; power: number; count: number; radius: number; buildup: number };

export interface StatusDef {
  name: string;
  tags: readonly string[];
  /** この属性のヒットで蓄積する */
  element?: ElementId;
  /** 蓄積の満タン値 */
  max: number;
  /** 発動していないときの蓄積の自然減少(毎秒) */
  decayPerSec: number;
  /** 発動後の持続(ミリ秒) */
  duration: number;
  /** 発動中に再び満タンになると持続を延ばす。偽なら発動中の蓄積は無視する */
  refresh?: boolean;
  /** 発動中の継続ダメージ */
  dot?: { interval: number; power: number };
  /** 発動中、per ピクセル動くたびに power のダメージ */
  moveDamage?: { per: number; power: number };
  onActivate?: readonly ActivationEffect[];
  /** 発動中は行動できない。振りかぶり中の攻撃も潰れる */
  incapacitates?: boolean;
  /** 発動中にかかっている者に効く補正値 */
  modifiers?: readonly Modifier[];
  /** 蓄積しているだけで動きが鈍る。満タンで移動速度がこの割合だけ落ちる */
  slowByBuildup?: number;
  /** 蓄積では付かず、本人の様子で決まる。dying は瀕死、unhurt は無傷、overweight は装備の重さの超過 */
  derived?: 'dying' | 'unhurt' | 'overweight';
  /** 発動中はアクティブスキルを使えない */
  silences?: boolean;
  /** 発動中は相手から逃げ回る(自分で歩く者だけ) */
  flees?: boolean;
  /** 発動中は敵味方の区別なく攻撃が当たる */
  friendlyFire?: boolean;
  /** 発動中に攻撃すると、ratio の確率で外れる */
  missChance?: number;
  /** 発動中、次の直撃を1回だけ無効にして消える */
  wardsOnce?: boolean;
  /** 発動中に受けたダメージの ratio を溜め、切れたときにまとめて受ける */
  storesDamage?: number;
  /** 発動中は回復がダメージになる */
  reversesHealing?: boolean;
  /** 持続が切れると倒れる。発動中に倒されると、周りの仲間に呪縛を撒く */
  lethalOnExpire?: boolean;
  /** この属性のヒットで、当てた側に蓄積する(血の渇き) */
  buildsOnAttacker?: boolean;
  /** 発動中の直撃は、自分の最大HPの selfCost を払う。出血した相手に当てると leech の割合だけ吸う */
  thirst?: { selfCost: number; leech: number };
  /** 被弾するたびに蓄積する */
  gainOnHurt?: number;
  /** 戦っている間(5秒以内に攻撃したか受けた)、毎秒蓄積する */
  gainInCombatPerSec?: number;
  /** 発動した(activate)か切れた(end)ときに、足元へ床(FIELDS の名前)を残す */
  leavesFloor?: { field: string; radius: number; duration: number; on: 'activate' | 'end' };
  color: number;
}

/** 状態。全ての状態は敵にも味方にもかかる */
export const STATUSES = {
  bleed: {
    name: '出血',
    tags: ['bleed', 'physical'],
    element: 'slash',
    max: 100,
    decayPerSec: 8,
    duration: 6000,
    moveDamage: { per: 40, power: 6 },
    onActivate: [{ type: 'burst', power: 30, radius: 0 }],
    leavesFloor: { field: 'bloodPool', radius: 45, duration: 8000, on: 'activate' },
    color: 0xb02a30,
  },
  burn: {
    name: '炎上',
    tags: ['burn'],
    element: 'fire',
    max: 100,
    decayPerSec: 10,
    duration: 4000,
    dot: { interval: 500, power: 8 },
    onActivate: [{ type: 'burst', power: 20, radius: 70 }],
    leavesFloor: { field: 'scorch', radius: 50, duration: 3000, on: 'end' },
    color: 0xff7a2e,
  },
  shock: {
    name: '感電',
    tags: ['shock'],
    element: 'lightning',
    max: 100,
    decayPerSec: 15,
    duration: 1500,
    onActivate: [
      { type: 'burst', power: 30, radius: 0 },
      { type: 'chain', power: 24, count: 3, radius: 200, buildup: 60 },
    ],
    color: 0x7fd4ff,
  },
  wet: {
    name: '濡れ',
    tags: ['wet', 'water'],
    max: 100,
    decayPerSec: 20,
    duration: 3000,
    refresh: true,
    color: 0x4a7fb5,
  },
  oiled: {
    name: '油まみれ',
    tags: ['oiled'],
    max: 100,
    decayPerSec: 20,
    duration: 8000,
    refresh: true,
    color: 0x6b5a2a,
  },
  stun: {
    name: '昏倒',
    tags: ['stun'],
    element: 'blunt',
    max: 100,
    decayPerSec: 25,
    duration: 1800,
    incapacitates: true,
    color: 0xd8c25a,
  },
  exposed: {
    name: '露出',
    tags: ['exposed', 'physical'],
    element: 'pierce',
    max: 100,
    decayPerSec: 10,
    duration: 5000,
    refresh: true,
    // 守りが剥がれ、被ダメージが増える
    modifiers: [{ stat: 'damageTaken', tags: [], value: 0.3, group: 'exposed' }],
    color: 0xd8d0b8,
  },
  rot: {
    name: '腐敗',
    tags: ['rot'],
    element: 'rot',
    max: 100,
    decayPerSec: 6,
    duration: 8000,
    reversesHealing: true,
    dot: { interval: 1000, power: 6 },
    color: 0x8a9a3a,
  },
  bind: {
    name: '呪縛',
    tags: ['bind', 'curse'],
    element: 'curse',
    max: 100,
    decayPerSec: 8,
    duration: 5000,
    storesDamage: 0.4,
    color: 0x9a5ab8,
  },
  frozen: {
    name: '凍結',
    tags: ['frozen', 'ice'],
    element: 'ice',
    max: 100,
    decayPerSec: 12,
    duration: 2500,
    incapacitates: true,
    // 凍りつく瞬間に、身が軋む。解けると水たまりが残る
    onActivate: [{ type: 'burst', power: 25, radius: 0 }],
    leavesFloor: { field: 'puddle', radius: 55, duration: 10000, on: 'end' },
    color: 0xa8e0f0,
  },
  blind: {
    name: '盲目',
    tags: ['blind'],
    element: 'dark',
    max: 100,
    decayPerSec: 10,
    duration: 5000,
    missChance: 0.35,
    color: 0x6a5a8a,
  },
  ashen: {
    name: '灰化',
    tags: ['ashen', 'ash'],
    element: 'ash',
    max: 100,
    decayPerSec: 5,
    duration: 3000,
    slowByBuildup: 0.5,
    // 満タンで崩れる。崩れた後しばらくは、灰が積もらない
    onActivate: [{ type: 'burst', power: 45, radius: 0 }],
    leavesFloor: { field: 'ashPile', radius: 55, duration: 10000, on: 'activate' },
    color: 0x9a9088,
  },
  thirst: {
    name: '渇き',
    tags: ['thirst', 'blood'],
    element: 'blood',
    max: 100,
    decayPerSec: 6,
    duration: 8000,
    buildsOnAttacker: true,
    modifiers: [{ tags: ['weapon'], value: 0.4, group: 'thirst' }],
    thirst: { selfCost: 0.02, leech: 0.25 },
    color: 0xc8323c,
  },
  hunger: {
    name: '飢え',
    tags: ['hunger'],
    max: 100,
    decayPerSec: 0,
    duration: 60000,
    gainInCombatPerSec: 0.8,
    modifiers: [{ stat: 'healing', tags: [], value: -0.5, group: 'hunger' }],
    color: 0x8a6a4a,
  },
  madness: {
    name: '狂気',
    tags: ['madness'],
    max: 100,
    decayPerSec: 4,
    duration: 10000,
    friendlyFire: true,
    modifiers: [{ tags: [], value: 0.8, group: 'madness' }],
    color: 0xe05a8a,
  },
  fear: {
    name: '恐怖',
    tags: ['fear'],
    max: 100,
    decayPerSec: 10,
    duration: 3500,
    silences: true,
    flees: true,
    color: 0x5a6a7a,
  },
  dying: {
    name: '瀕死',
    tags: ['dying'],
    max: 100,
    decayPerSec: 0,
    duration: 0,
    derived: 'dying',
    color: 0x8a1a1a,
  },
  unhurt: {
    name: '無傷',
    tags: ['unhurt'],
    max: 100,
    decayPerSec: 0,
    duration: 0,
    derived: 'unhurt',
    color: 0xe8e0c8,
  },
  sluggish: {
    name: '鈍重',
    tags: ['sluggish'],
    max: 100,
    decayPerSec: 0,
    duration: 0,
    derived: 'overweight',
    // 足は遅いが、打の威力が上がる
    modifiers: [
      { stat: 'moveSpeed', tags: [], value: -0.25, group: 'sluggish' },
      { tags: ['blunt'], value: 0.3, group: 'sluggish' },
    ],
    color: 0x6a5a4a,
  },
  doom: {
    name: '死の宣告',
    tags: ['doom', 'curse'],
    max: 100,
    decayPerSec: 3,
    duration: 10000,
    lethalOnExpire: true,
    color: 0x8a5aaa,
  },
  blessing: {
    name: '加護',
    tags: ['blessing'],
    max: 100,
    decayPerSec: 0,
    duration: 20000,
    wardsOnce: true,
    color: 0xf0e0a0,
  },
  wrath: {
    name: '憤怒',
    tags: ['wrath'],
    max: 100,
    decayPerSec: 4,
    duration: 8000,
    refresh: true,
    gainOnHurt: 20,
    modifiers: [{ tags: [], value: 0.5, group: 'wrath' }],
    color: 0xd04a2a,
  },
  silence: {
    name: '静寂',
    tags: ['silence'],
    max: 100,
    decayPerSec: 12,
    duration: 3000,
    silences: true,
    color: 0x7a8a9a,
  },
} as const satisfies Record<string, StatusDef>;

export type StatusId = keyof typeof STATUSES;
export const STATUS_IDS = Object.keys(STATUSES) as StatusId[];

export function statusDef(id: StatusId): StatusDef {
  return STATUSES[id];
}

/** 属性のヒットで蓄積する状態 */
export function statusForElement(element: ElementId): StatusId | undefined {
  return STATUS_IDS.find((id) => statusDef(id).element === element);
}
