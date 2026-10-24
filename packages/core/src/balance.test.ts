import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { LOOT_WEAPON_TYPE_IDS, WEAPON_TYPES, type WeaponRef, type WeaponTypeId } from './data/weapons';
import { ELEMENT_IDS } from './data/elements';
import type { ActiveSkillId } from './data/skills';
import { dealtBy, summarize } from './breakdown';

/** 近接の武器のDPSは、遠距離の武器のDPSのこの倍以上にする。遠攻撃は弾を避けながら撃てて楽なので */
const MELEE_OVER_RANGED = 1.6;

/** 寄ってきた5体に囲まれた所。近攻撃が本来戦う間合い */
const GROUP = [
  { x: 70, y: 0 },
  { x: 40, y: 70 },
  { x: -50, y: 60 },
  { x: -60, y: -50 },
  { x: 30, y: -80 },
];

/**
 * その武器と技だけで案山子と60秒戦ったときのDPS。状態の発動や連鎖で出た分も含む。
 * 案山子は動かず、攻めてこない
 */
export function measureDps(weapon: WeaponRef, skill: ActiveSkillId, targets: 'solo' | 'group', seconds = 60): number {
  const w = new CombatWorld();
  w.addUnit({
    id: 'p',
    name: '巡礼者',
    team: 'player',
    x: 0,
    y: 0,
    maxHp: 1e9,
    weapons: [weapon],
    tactics: [{ skill, condition: 'always', enabled: true }],
    autoBattle: true,
  });
  (targets === 'solo' ? GROUP.slice(0, 1) : GROUP).forEach((at, i) => w.addUnit({ id: `e${i}`, name: '案山子', team: 'enemy', ...at, maxHp: 1e9 }));
  for (let t = 0; t < seconds * 1000; t += 20) w.update(20);
  return summarize(dealtBy(w.log, 'p'), w.time).total / seconds;
}

/** 武器をそのまま使う技 */
const basic = (weapon: WeaponTypeId): ActiveSkillId => (WEAPON_TYPES[weapon].kind === 'melee' ? 'slash' : 'shoot');

describe('火力の釣り合い', () => {
  for (const targets of ['solo', 'group'] as const) {
    it(`近接の武器は遠距離の武器の ${MELEE_OVER_RANGED} 倍以上のDPSが出る(${targets === 'solo' ? '1体' : '群れ'})`, () => {
      // 武器の属性は拾うたびに変わるので、形と属性の組み合わせを全て測る
      const dps = (kind: 'melee' | 'ranged') =>
        LOOT_WEAPON_TYPE_IDS.filter((id) => WEAPON_TYPES[id].kind === kind).flatMap((id) =>
          ELEMENT_IDS.map((element) => measureDps({ type: id, element }, basic(id), targets)),
        );
      expect(Math.min(...dps('melee')) / Math.max(...dps('ranged'))).toBeGreaterThanOrEqual(MELEE_OVER_RANGED);
      // 形と属性の組み合わせが多いので、時間がかかる
    }, 120000);
  }
});
