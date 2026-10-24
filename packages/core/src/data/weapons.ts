import type { ElementId } from './elements';

/**
 * 武器の種類。攻撃の速さ・範囲・近接か遠距離か・属性は武器が持つ。
 * アクティブスキル(技)は、この数値に倍率を掛けて使う
 */
export type WeaponKind = 'melee' | 'ranged';

export const WEAPON_KINDS: Record<WeaponKind, string> = { melee: '近接', ranged: '遠距離' };

interface WeaponBase {
  name: string;
  element: ElementId;
  /** 1回の威力 */
  power: number;
  /** 状態の蓄積 */
  buildup: number;
  /** 攻撃の間隔(ミリ秒)。技のクールダウンの土台 */
  interval: number;
  /** 振りかぶりと硬直(ミリ秒) */
  windup: number;
  recovery: number;
  /** 届く距離 */
  range: number;
  tags: readonly string[];
}

export interface MeleeWeaponDef extends WeaponBase {
  kind: 'melee';
  /** 振る扇の角度(度) */
  arc: number;
}

export interface RangedWeaponDef extends WeaponBase {
  kind: 'ranged';
  /** 弾の速さと大きさ */
  speed: number;
  radius: number;
}

export type WeaponTypeDef = MeleeWeaponDef | RangedWeaponDef;

export const WEAPON_TYPES = {
  fists: {
    name: '素手',
    kind: 'melee',
    element: 'slash',
    power: 14,
    buildup: 18,
    interval: 700,
    windup: 150,
    recovery: 220,
    range: 70,
    arc: 100,
    tags: ['unarmed'],
  },
  ironSword: {
    name: '鉄の剣',
    kind: 'melee',
    element: 'slash',
    power: 38,
    buildup: 45,
    interval: 850,
    windup: 220,
    recovery: 320,
    range: 100,
    arc: 130,
    tags: ['sword'],
  },
  rustGreatsword: {
    name: '錆びた大剣',
    kind: 'melee',
    element: 'slash',
    power: 52,
    buildup: 55,
    interval: 1100,
    windup: 280,
    recovery: 420,
    range: 110,
    arc: 150,
    tags: ['sword', 'heavy'],
  },
  boneFlail: {
    name: '骨の連枷',
    kind: 'melee',
    element: 'slash',
    power: 24,
    buildup: 28,
    interval: 550,
    windup: 160,
    recovery: 220,
    range: 90,
    arc: 110,
    tags: ['light'],
  },
  cinderAxe: {
    name: '熾火の斧',
    kind: 'melee',
    element: 'fire',
    power: 88,
    buildup: 75,
    interval: 1800,
    windup: 450,
    recovery: 500,
    range: 110,
    arc: 120,
    tags: ['axe', 'heavy'],
  },
  stormSpear: {
    name: '雷の槍',
    kind: 'melee',
    element: 'lightning',
    power: 46,
    buildup: 55,
    interval: 1200,
    windup: 300,
    recovery: 380,
    range: 170,
    arc: 36,
    tags: ['spear'],
  },
  capGun: {
    name: '雷管銃',
    kind: 'ranged',
    element: 'lightning',
    power: 26,
    buildup: 60,
    interval: 2400,
    windup: 320,
    recovery: 380,
    range: 750,
    speed: 900,
    radius: 7,
    tags: ['gun'],
  },
  emberSling: {
    name: '火打ちの投石紐',
    kind: 'ranged',
    element: 'fire',
    power: 14,
    buildup: 55,
    interval: 2600,
    windup: 300,
    recovery: 350,
    range: 650,
    speed: 700,
    radius: 8,
    tags: ['sling'],
  },
  boneBow: {
    name: '骨の短弓',
    kind: 'ranged',
    element: 'slash',
    power: 18,
    buildup: 30,
    interval: 1500,
    windup: 260,
    recovery: 300,
    range: 700,
    speed: 850,
    radius: 5,
    tags: ['bow'],
  },
} as const satisfies Record<string, WeaponTypeDef>;

export type WeaponTypeId = keyof typeof WEAPON_TYPES;
export const WEAPON_TYPE_IDS = Object.keys(WEAPON_TYPES) as WeaponTypeId[];
/** 拾い物で出る武器。素手は出ない */
export const LOOT_WEAPON_TYPE_IDS = WEAPON_TYPE_IDS.filter((id) => id !== 'fists');

export function weaponDef(id: WeaponTypeId): WeaponTypeDef {
  return WEAPON_TYPES[id];
}
