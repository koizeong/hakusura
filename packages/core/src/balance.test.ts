import { describe, expect, it } from 'vitest';
import { LOOT_WEAPON_TYPE_IDS, WEAPON_TYPES, type WeaponTypeId } from './data/weapons';
import { ELEMENT_IDS, type ElementId } from './data/elements';
import type { Build } from './build';
import { measureField } from './sim/simulate';

/**
 * 近接の武器のDPSは、遠距離の武器のDPSのこの倍以上にする。遠攻撃は弾を避けながら撃てて楽なので。
 * 実戦に近い場(寄ってきて攻める案山子の群れと、操り手つきで戦う。measureField)で測る。
 * 動かない案山子を撃ち続ける測りは遠距離に有利すぎ、場では近接が何倍も出ていたので、場で釣り合いを見る
 */
const MELEE_OVER_RANGED = 1.8;

/** 武器1本と、武器をそのまま使う技だけのビルド。能力値はどの武器の求めも満たす */
function weaponBuild(type: WeaponTypeId, element: ElementId): Build {
  const skill = WEAPON_TYPES[type].kind === 'melee' ? 'slash' : 'shoot';
  return {
    attributes: { str: 20, dex: 20, int: 20, fai: 20, vit: 20 },
    actives: [skill],
    passives: [],
    equipment: { weapon1: { id: 'w', name: type, kind: 'weapon', weaponType: type, element, affixes: [] } },
    tactics: [{ skill, condition: 'always', enabled: true }],
  };
}

describe('火力の釣り合い', () => {
  it(`近接の武器は遠距離の武器の ${MELEE_OVER_RANGED} 倍以上のDPSが出る(実戦に近い場)`, () => {
    // 武器の属性は拾うたびに変わるので、形と属性の組み合わせを全て測る
    const dps = (kind: 'melee' | 'ranged') =>
      LOOT_WEAPON_TYPE_IDS.filter((id) => WEAPON_TYPES[id].kind === kind).flatMap((id) => ELEMENT_IDS.map((e) => measureField(weaponBuild(id, e), 30).dps));
    expect(Math.min(...dps('melee')) / Math.max(...dps('ranged'))).toBeGreaterThanOrEqual(MELEE_OVER_RANGED);
    // 形と属性の組み合わせが多いので、時間がかかる
  }, 180000);
});
