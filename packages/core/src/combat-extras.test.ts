import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ACTIVE_SKILLS } from './data/skills';
import { matchCombos } from './data/combos';
import { dealtBy, summarize } from './breakdown';
import { TEST_WEAPONS } from './testkit';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

describe('コンボ', () => {
  it('ラベルとタグが全て揃うと成立する', () => {
    expect(matchCombos(['濡れで倍'], new Set(['shock']))).toEqual(['thunderRain']);
    expect(matchCombos(['濡れで倍'], new Set(['shock', 'chain']))).toEqual(['thunderRain', 'chainShock']);
    expect(matchCombos([], new Set(['chain']))).toEqual([]);
  });

  it('濡れた相手への感電の連鎖で「雷雨」と「連鎖」が成立し、内訳に出る', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0, maxHp: 1e9 });
    const d = w.addUnit({ id: 'd', name: '案山子', team: 'enemy', x: 100, y: 0, maxHp: 1e9 });
    w.addUnit({ id: 'a', name: '案山子', team: 'enemy', x: 160, y: 0, maxHp: 1e9 });
    w.forceStatus('d', 'wet', true);
    w.forceStatus('a', 'wet', true);
    d.statuses.shock.buildup = 99;
    w.useSkill('p', 'shoot', d);
    run(w, 600);
    const chained = w.log.find((r) => r.targetId === 'a')!;
    expect(chained.combos).toEqual(['thunderRain', 'chainShock']);
    const summary = summarize(dealtBy(w.log, 'p'), w.time);
    expect(summary.byCombo.map((r) => r.key)).toEqual(expect.arrayContaining(['雷雨', '連鎖']));
  });
});

describe('弾幕', () => {
  it('ring は全方位に count 発撒き、撃つたびに向きがずれる', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 0, y: 0 });
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 2000, y: 0 });
    const { action, windup } = ACTIVE_SKILLS.strawScatter;
    w.useSkill('e', 'strawScatter', { x: 1, y: 0 });
    run(w, windup + 10);
    expect(w.projectiles.length).toBe(action.count);
    const first = Math.atan2(w.projectiles[0]!.vy, w.projectiles[0]!.vx);
    w.projectiles = [];
    const e = w.units.get('e')!;
    e.cooldowns = {};
    e.busyUntil = 0;
    w.useSkill('e', 'strawScatter', { x: 1, y: 0 });
    run(w, windup + 10);
    const second = Math.atan2(w.projectiles[0]!.vy, w.projectiles[0]!.vx);
    expect(second - first).toBeCloseTo((action.spin * Math.PI) / 180);
  });

  it('fan は狙った方向へ広がり、当たると状態が溜まる', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 0, y: 0 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 300, maxHp: 1e9 });
    w.useSkill('e', 'emberFan', p);
    run(w, ACTIVE_SKILLS.emberFan.windup + 10);
    const angles = w.projectiles.map((pr) => Math.atan2(pr.vy, pr.vx));
    const mid = angles[Math.floor(angles.length / 2)]!;
    expect(mid).toBeCloseTo(Math.PI / 2);
    run(w, 2000);
    expect(w.log.some((r) => r.targetId === 'p' && r.skill === '火の粉の扇')).toBe(true);
    expect(p.statuses.burn.buildup + (w.isActive(p, 'burn') ? 100 : 0)).toBeGreaterThan(0);
  });

  it('自分で動く者は、並んだ順に届くスキルを使う', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 0, y: 0, ai: ['strawSwipe', 'strawScatter'] });
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 400, y: 0, maxHp: 1e9 });
    run(w, 100);
    // 薙ぎは届かないので散弾を使う
    expect(w.units.get('e')!.cooldowns.strawScatter).toBeDefined();
    expect(w.units.get('e')!.cooldowns.strawSwipe).toBeUndefined();
  });
});
