import { ELEMENTS, type ElementDef, type ElementId } from './elements';
import type { Modifier } from '../rules';

/**
 * 盾。武器の枠に着ける。攻撃の直撃を1回だけ完全に防ぎ、砕けると時間で張り直す。
 * 属性つきの盾は、砕けたときにその属性で周りへ弾ける
 */
export interface ShieldTypeDef {
  name: string;
  description: string;
  /** 砕けてから張り直すまで(ミリ秒)。クールダウンの補正が効く */
  recharge: number;
  /** 防ぐもの。projectile なら弾だけ */
  blocks: 'any' | 'projectile';
  /** 着けている間ずっと効く補正 */
  modifiers?: readonly Modifier[];
  /** 属性つきのとき、砕けて弾ける強さ */
  burst: { power: number; buildup: number; radius: number };
}

export const SHIELD_TYPES = {
  woodShield: {
    name: '木の盾',
    description: '直撃を1回防ぐ。10秒で張り直す',
    recharge: 10000,
    blocks: 'any',
    burst: { power: 18, buildup: 60, radius: 110 },
  },
  towerShield: {
    name: '大盾',
    description: '直撃を1回防ぐ。16秒で張り直す。重く、被ダメージ-10%・移動速度-10%',
    recharge: 16000,
    blocks: 'any',
    modifiers: [
      { stat: 'damageTaken', tags: [], value: -0.1, group: 'shield' },
      { stat: 'moveSpeed', tags: [], value: -0.1, group: 'shield' },
    ],
    burst: { power: 30, buildup: 90, radius: 140 },
  },
  prayerBuckler: {
    name: '祈りの小盾',
    description: '弾だけを1回防ぐ。6秒で張り直す',
    recharge: 6000,
    blocks: 'projectile',
    burst: { power: 10, buildup: 40, radius: 90 },
  },
  thornShield: {
    name: '棘の盾',
    description: '直撃を1回防ぐ。12秒で張り直す。属性がなくても、砕けると斬で弾ける',
    recharge: 12000,
    blocks: 'any',
    burst: { power: 26, buildup: 70, radius: 110 },
  },
} as const satisfies Record<string, ShieldTypeDef>;

export type ShieldTypeId = keyof typeof SHIELD_TYPES;
export const SHIELD_TYPE_IDS = Object.keys(SHIELD_TYPES) as ShieldTypeId[];

/** 1枚の盾。形と、拾ったときに決まる属性 */
export interface ShieldSpec {
  type: ShieldTypeId;
  element?: ElementId;
}

export function shieldDef(id: ShieldTypeId): ShieldTypeDef {
  return SHIELD_TYPES[id];
}

/** 砕けたときに弾ける属性。属性がなければ弾けない(棘の盾は斬で弾ける) */
export function shieldBurstElement(s: ShieldSpec): ElementId | undefined {
  return s.element ?? (s.type === 'thornShield' ? 'slash' : undefined);
}

export function shieldName(s: ShieldSpec): string {
  const prefix = s.element ? (ELEMENTS[s.element] as ElementDef).weaponPrefix : '';
  return `${prefix}${SHIELD_TYPES[s.type].name}`;
}

/** 拾う盾の属性を決める。半分は属性なし。名前で見分けられるよう、名前に出る属性だけから選ぶ */
export function rollShield(random: () => number, type: ShieldTypeId): ShieldSpec {
  const ids = (Object.keys(ELEMENTS) as ElementId[]).filter((e) => (ELEMENTS[e] as ElementDef).weaponPrefix !== '');
  return random() < 0.5 ? { type } : { type, element: ids[Math.floor(random() * ids.length)] };
}
