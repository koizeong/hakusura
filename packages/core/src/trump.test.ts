import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ACTIVE_SKILLS, TRUMP_SKILL_IDS, resolveSkill } from './data/skills';
import { TEST_WEAPONS, SWORD } from './testkit';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

describe('切り札', () => {
  it('trump のタグを持つスキルを選べる', () => {
    expect(TRUMP_SKILL_IDS).toEqual(['rainBell', 'oilFlask', 'thunderPrayer']);
  });

  it('油壺の投擲は狙った敵の足元に油溜まりを撒き、時間で消える', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0 });
    const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 300, y: 50, maxHp: 1e9 });
    w.useSkill('p', 'oilFlask', e, 'e');
    run(w, ACTIVE_SKILLS.oilFlask.windup + 10);
    expect(w.floors).toMatchObject([{ field: 'oilPool', x: 300, y: 50 }]);
    run(w, 1000);
    expect(w.isActive(e, 'oiled')).toBe(true);
    run(w, ACTIVE_SKILLS.oilFlask.action.duration);
    expect(w.floors.length).toBe(0);
  });

  it('雷鳴の祈祷は周りの敵すべてを感電させる', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0 });
    const near = [w.addUnit({ id: 'a', name: '案山子', team: 'enemy', x: 150, y: 0, maxHp: 1e9 }), w.addUnit({ id: 'b', name: '案山子', team: 'enemy', x: -200, y: 100, maxHp: 1e9 })];
    const far = w.addUnit({ id: 'far', name: '案山子', team: 'enemy', x: 2000, y: 0, maxHp: 1e9 });
    w.useSkill('p', 'thunderPrayer', { x: 1, y: 0 });
    run(w, ACTIVE_SKILLS.thunderPrayer.windup + 10);
    for (const u of near) expect(w.isActive(u, 'shock')).toBe(true);
    expect(w.isActive(far, 'shock')).toBe(false);
  });
});

describe('近攻撃の弾消し', () => {
  it('大剣は振った範囲の敵の弾をかき消す', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0, maxHp: 1e9 });
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 600, y: 0, maxHp: 1e9 });
    const bullet = (x: number, y: number) => ({ id: Math.random(), ownerId: 'e', skill: 'strawScatter' as const, resolved: resolveSkill('strawScatter')!, element: 'slash' as const, x, y, vx: 0, vy: 0, radius: 6, traveled: 0, range: 1e9 });
    w.projectiles = [bullet(60, 0), bullet(-60, 0)];
    w.useSkill('p', 'slash', { x: 100, y: 0 });
    run(w, SWORD.windup + 10);
    // 前の弾だけ消え、背中側の弾は残る
    expect(w.projectiles.map((p) => p.x)).toEqual([-60]);
    expect(w.drainEvents().some((e) => e.type === 'projectileEnd' && e.cleared)).toBe(true);
  });
});

describe('スキルの予約', () => {
  it('予約したスキルは、作戦より先に使う', () => {
    const w = new CombatWorld();
    const p = w.addUnit({
      id: 'p',
      name: '巡礼者',
      team: 'player',
      weapons: TEST_WEAPONS,
      x: 0,
      y: 0,
      tactics: [{ skill: 'slash', condition: 'always', enabled: true }],
      autoBattle: true,
    });
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
    run(w, 50); // 大剣を振りかぶる
    w.queueSkill('p', 'rainBell', 3000);
    run(w, 1500);
    expect(w.weather).toBe('rain');
    expect(p.queued).toBeUndefined();
  });

  it('届かなければ寄る先を教え、その間も作戦は続く', () => {
    const w = new CombatWorld();
    const p = w.addUnit({
      id: 'p',
      name: '巡礼者',
      team: 'player',
      weapons: TEST_WEAPONS,
      x: 0,
      y: 0,
      tactics: [{ skill: 'shoot', condition: 'always', enabled: true }],
      autoBattle: true,
    });
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 500, y: 0, maxHp: 1e9 });
    w.queueSkill('p', 'thunderPrayer', 6000);
    run(w, 1200);
    expect(w.queuedGoal('p')?.id).toBe('e');
    expect(w.log.some((r) => r.skill === '雷の短銃の射撃')).toBe(true);
    w.moveUnit('p', 300, 0);
    run(w, 1500);
    expect(w.log.some((r) => r.skill === '雷鳴の祈祷')).toBe(true);
    expect(p.queued).toBeUndefined();
  });
});
