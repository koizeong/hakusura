import type { StatusId } from './statuses';
import type { Modifier } from '../rules';

export interface FieldDef {
  name: string;
  /** weather は全員に、floor は範囲内にいる者にかかる */
  kind: 'weather' | 'floor';
  description: string;
  /** かかっている者に、毎秒この状態を溜める */
  applies?: { status: StatusId; perSec: number };
  /** かかっている者に効く補正値 */
  modifiers?: readonly Modifier[];
  /** 天候のとき、弾と弾幕の届く距離に掛ける(砂嵐・霧で遠くへ撃てない) */
  projectileRange?: number;
  /** 床のとき、上に立つ者にこの状態が発動すると、床が別の床(FIELDS の名前)に変わる(水たまりが凍るなど) */
  transforms?: readonly { status: StatusId; into: string }[];
  color: number;
}

/** フィールドの環境と床の状態。全て敵にも味方にもかかる */
export const FIELDS = {
  rain: { name: '雨', kind: 'weather', description: '全員が濡れる', applies: { status: 'wet', perSec: 80 }, color: 0x4a7fb5 },
  sandstorm: {
    name: '砂嵐',
    kind: 'weather',
    description: '目に砂が入って盲目が溜まり、足が鈍る。弾は遠くへ届かない',
    applies: { status: 'blind', perSec: 20 },
    modifiers: [{ stat: 'moveSpeed', tags: [], value: -0.1, group: 'sandstorm' }],
    projectileRange: 0.65,
    color: 0xb8a070,
  },
  fog: {
    name: '霧',
    kind: 'weather',
    description: '遠くが見えず、弾は遠くへ届かない。背後からの奇襲が効く',
    projectileRange: 0.55,
    color: 0xc8ccd0,
  },
  night: {
    name: '夜',
    kind: 'weather',
    description: '闇と呪いが強まる',
    modifiers: [
      { tags: ['dark'], value: 0.4, group: 'night' },
      { tags: ['curse'], value: 0.2, group: 'night' },
    ],
    color: 0x1a1a30,
  },
  miasma: {
    name: '瘴気',
    kind: 'weather',
    description: '全員が腐っていき、回復が鈍る',
    applies: { status: 'rot', perSec: 12 },
    modifiers: [{ stat: 'healing', tags: [], value: -0.3, group: 'miasma' }],
    color: 0x6a7a3a,
  },
  calm: {
    name: '無風',
    kind: 'weather',
    description: '風がない。炎上が長く燃え、感電は遠くまで飛ばない',
    color: 0x9a9080,
  },
  oilPool: {
    name: '油溜まり',
    kind: 'floor',
    description: '踏むと油まみれ。上で誰かが燃えると燃え跡になる',
    applies: { status: 'oiled', perSec: 200 },
    transforms: [{ status: 'burn', into: 'scorch' }],
    color: 0x3a3218,
  },
  bloodPool: {
    name: '血だまり',
    kind: 'floor',
    description: '出血した者の足元に溜まる。立つと渇きが溜まる',
    applies: { status: 'thirst', perSec: 25 },
    color: 0x5a1418,
  },
  puddle: {
    name: '水たまり',
    kind: 'floor',
    description: '立つと濡れる。上で誰かが凍ると凍った床になる',
    applies: { status: 'wet', perSec: 150 },
    transforms: [{ status: 'frozen', into: 'iceFloor' }],
    color: 0x2a4a6a,
  },
  ashPile: {
    name: '灰の堆積',
    kind: 'floor',
    description: '崩れた者の灰が積もる。立つと灰化が溜まる',
    applies: { status: 'ashen', perSec: 8 },
    color: 0x5a5650,
  },
  corpse: {
    name: '死体',
    kind: 'floor',
    description: '倒れた者が残る。近くにいると腐敗が溜まる。灰になって崩れた者は残らない',
    applies: { status: 'rot', perSec: 18 },
    color: 0x3a2a24,
  },
  scorch: {
    name: '燃え跡',
    kind: 'floor',
    description: '炎の残り火。立つと炎上が溜まる',
    applies: { status: 'burn', perSec: 25 },
    color: 0x4a2010,
  },
  iceFloor: {
    name: '凍った床',
    kind: 'floor',
    description: '滑って足が速くなるが、凍結が溜まる。上で誰かが燃えると水たまりに戻る',
    applies: { status: 'frozen', perSec: 22 },
    modifiers: [{ stat: 'moveSpeed', tags: [], value: 0.25, group: 'iceFloor' }],
    transforms: [{ status: 'burn', into: 'puddle' }],
    color: 0x5a7a90,
  },
} as const satisfies Record<string, FieldDef>;

export type FieldId = keyof typeof FIELDS;
export const FIELD_IDS = Object.keys(FIELDS) as FieldId[];
export const WEATHER_IDS = FIELD_IDS.filter((id) => FIELDS[id].kind === 'weather');
export const FLOOR_IDS = FIELD_IDS.filter((id) => FIELDS[id].kind === 'floor');

export function fieldDef(id: FieldId): FieldDef {
  return FIELDS[id];
}

/** 床の決まり */
export const FLOOR_RULES = {
  /** 場に残る床の数。超えたら古い順に消える(消えない床は数えない) */
  maxTemporary: 60,
  /** 倒れた者が残す死体 */
  corpse: { radius: 28, duration: 20000 },
  /** 別の床に変わった床が残る時間 */
  transformedDuration: 10000,
} as const;
