import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ACTIVE_SKILLS, ACTIVE_SKILL_IDS, type ActiveSkillId } from './data/skills';
import { dealtBy, summarize } from './breakdown';

/** 近攻撃のDPSは、遠攻撃のDPSのこの倍以上にする。遠攻撃は弾を避けながら撃てて楽なので */
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
 * そのスキルだけで案山子と60秒戦ったときのDPS。状態の発動や連鎖で出た分も含む。
 * 案山子は動かず、攻めてこない
 */
export function measureDps(skill: ActiveSkillId, targets: 'solo' | 'group', seconds = 60): number {
  const w = new CombatWorld();
  w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, tactics: [{ skill, condition: 'always', enabled: true }], autoBattle: true });
  (targets === 'solo' ? GROUP.slice(0, 1) : GROUP).forEach((at, i) => w.addUnit({ id: `e${i}`, name: '案山子', team: 'enemy', ...at, maxHp: 1e9 }));
  for (let t = 0; t < seconds * 1000; t += 20) w.update(20);
  return summarize(dealtBy(w.log, 'p'), w.time).total / seconds;
}

const playerAttacks = (category: 'melee' | 'ranged') =>
  ACTIVE_SKILL_IDS.filter((id) => {
    const def = ACTIVE_SKILLS[id];
    const tags: readonly string[] = def.tags;
    return def.category === category && tags.includes('attack') && !tags.includes('enemy') && !tags.includes('trump');
  });

describe('火力の釣り合い', () => {
  for (const targets of ['solo', 'group'] as const) {
    it(`近攻撃は遠攻撃の ${MELEE_OVER_RANGED} 倍以上のDPSが出る(${targets === 'solo' ? '1体' : '群れ'})`, () => {
      const melee = Math.min(...playerAttacks('melee').map((id) => measureDps(id, targets)));
      const ranged = Math.max(...playerAttacks('ranged').map((id) => measureDps(id, targets)));
      expect(melee / ranged).toBeGreaterThanOrEqual(MELEE_OVER_RANGED);
    });
  }
});
