import type { ElementId } from './elements';

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
    max: 100,
    decayPerSec: 25,
    duration: 1800,
    incapacitates: true,
    color: 0xd8c25a,
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
