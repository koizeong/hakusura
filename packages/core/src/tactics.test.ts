import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ACTIVE_SKILLS } from './data/skills';
import { WEAPON_TYPES } from './data/weapons';
import type { Tactic } from './data/tactics';
import { TEST_WEAPONS, SWORD } from './testkit';

function setup(tactics: Tactic[], enemyX = 60, extra: { passives?: ('readTheBlow' | 'parryStance')[] } = {}) {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0, maxHp: 1e9, tactics, autoBattle: true, ...extra });
  const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: enemyX, y: 0, maxHp: 1e9 });
  return { w, p, e };
}

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

describe('作戦', () => {
  it('上の行から順に見て、条件に合う最初のスキルを使う', () => {
    const { w } = setup([
      { skill: 'shoot', condition: 'targetWet', enabled: true },
      { skill: 'slash', condition: 'always', enabled: true },
    ]);
    run(w, 400);
    expect(w.log[0]!.skill).toBe('錆びた大剣の斬りつけ');

    w.forceStatus('e', 'wet', true);
    w.units.get('p')!.cooldowns = {};
    w.units.get('p')!.busyUntil = 0;
    run(w, 600);
    expect(w.log.some((r) => r.skill === '雷管銃の射撃')).toBe(true);
  });

  it('切ってある行は使わない', () => {
    const { w } = setup([
      { skill: 'slash', condition: 'always', enabled: false },
      { skill: 'shoot', condition: 'always', enabled: true },
    ]);
    run(w, 600);
    expect(w.log[0]!.skill).toBe('雷管銃の射撃');
  });

  it('届かないときは、寄る先を教える', () => {
    const { w } = setup([{ skill: 'slash', condition: 'always', enabled: true }], 400);
    run(w, 100);
    expect(w.log.length).toBe(0);
    const goal = w.autoMoveGoal('p');
    expect(goal).toMatchObject({ x: 400, y: 0 });
    expect(goal!.stopAt).toBeLessThan(WEAPON_TYPES.rustGreatsword.range + 20);
  });

  it('付与は相手が遠くても使え、切れている間だけ使う', () => {
    const { w, p } = setup([{ skill: 'emberOil', condition: 'imbueOff', enabled: true }], 2000);
    run(w, 1000);
    expect(p.imbue).toBeDefined();
    const first = p.imbue!.until;
    p.cooldowns = {};
    run(w, 1000);
    expect(p.imbue!.until).toBe(first);
  });

  it('狙う相手を指定できる', () => {
    const { w, p } = setup([{ skill: 'shoot', condition: 'always', enabled: true }]);
    w.addUnit({ id: 'far', name: '案山子', team: 'enemy', x: 0, y: 300, maxHp: 1e9 });
    p.focusId = 'far';
    run(w, 800);
    expect(w.log[0]!.targetId).toBe('far');
  });
});

describe('自動の見切り・弾き', () => {
  const enemySwipe = (w: CombatWorld) => {
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    run(w, ACTIVE_SKILLS.strawSwipe.windup + 20);
    return w.drainEvents();
  };

  it('見切りの心得は確率で直撃を見切る', () => {
    let dodged = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const w = new CombatWorld({ seed });
      w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0, maxHp: 1e9, passives: ['readTheBlow'] });
      w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
      if (enemySwipe(w).some((e) => e.type === 'justDodge')) dodged++;
    }
    // 30% のはず
    expect(dodged).toBeGreaterThan(40);
    expect(dodged).toBeLessThan(80);
  });

  it('弾きの構えで弾くと相手が昏倒する', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const w = new CombatWorld({ seed });
      w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0, maxHp: 1e9, passives: ['parryStance'] });
      const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
      const events = enemySwipe(w);
      const parried = events.some((ev) => ev.type === 'justGuard');
      expect(w.isActive(e, 'stun')).toBe(parried);
      expect(w.log.some((r) => r.targetId === 'p')).toBe(!parried);
    }
  });

  it('同じ種なら同じ結果になる', () => {
    const once = (seed: number) => {
      const w = new CombatWorld({ seed });
      w.addUnit({ id: 'p', name: '巡礼者', team: 'player', weapons: TEST_WEAPONS, x: 0, y: 0, maxHp: 1e9, passives: ['readTheBlow'] });
      w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9, ai: 'strawSwipe' });
      run(w, 20000);
      return w.log.map((r) => r.amount).join(',');
    };
    expect(once(7)).toBe(once(7));
  });
});

describe('切り札', () => {
  it('雨乞いの鈴は雨を呼び、切れると元に戻る', () => {
    const { w } = setup([]);
    w.useSkill('p', 'rainBell', { x: 1, y: 0 });
    run(w, ACTIVE_SKILLS.rainBell.windup + 10);
    expect(w.weather).toBe('rain');
    run(w, ACTIVE_SKILLS.rainBell.action.duration);
    expect(w.weather).toBe(null);
  });
});
