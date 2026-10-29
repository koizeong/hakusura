import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { WEAPON_TYPES } from './data/weapons';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

describe('短剣の返しの踏み込み', () => {
  function daggerman() {
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type: 'dagger' }] });
    // 短剣のふだんの間合いより少し遠く、2倍の間合いの内
    const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 120, y: 0, maxHp: 1e9 });
    return { w, p, t };
  }

  it('ふだんは届かない所でも、ステップの直後の一撃は届いて重い', () => {
    const plain = daggerman();
    plain.w.useSkill('p', 'slash', plain.t, 't');
    run(plain.w, 500);
    expect(plain.w.log.filter((r) => r.targetId === 't')).toHaveLength(0);

    const { w, p, t } = daggerman();
    expect(w.dodge('p')).toBe(true);
    run(w, 200);
    p.busyUntil = 0;
    w.useSkill('p', 'slash', t, 't');
    run(w, 500);
    const hits = w.log.filter((r) => r.targetId === 't');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.via).toContain('返しの踏み込み');
  });

  it('1回で使い切り、間が空くと効かない', () => {
    const { w, p, t } = daggerman();
    w.dodge('p');
    run(w, WEAPON_TYPES.dagger.stepStrike.window + 200);
    p.busyUntil = 0;
    w.useSkill('p', 'slash', t, 't');
    run(w, 500);
    expect(w.log.filter((r) => r.targetId === 't')).toHaveLength(0);
  });
});

describe('盾の返し', () => {
  it('盾で直撃を受け止めると、次の一撃が重くなる(見切り)', () => {
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, weapons: [{ type: 'ironSword' }] });
    p.shields = [{ type: 'towerShield', readyAt: 0, ready: true }];
    const foe = w.addUnit({ id: 'f', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9, ai: 'strawSwipe' });
    foe.cooldowns = {};
    run(w, 1500);
    expect(p.shields[0]!.ready).toBe(false);
    expect(p.buffs.some((b) => b.label === '見切り')).toBe(true);
  });
});

describe('回り込むステップ', () => {
  it('止まって踏むと、近接は相手の周りを回り込み(踏むたびに左右が入れ替わる)、遠距離は離れる', () => {
    const w = new CombatWorld({ seed: 1 });
    const m = w.addUnit({ id: 'm', name: '剣士', team: 'player', x: 0, y: 0, weapons: [{ type: 'ironSword' }] });
    const r = w.addUnit({ id: 'r', name: '射手', team: 'player', x: 0, y: 0, weapons: [{ type: 'boneBow' }] });
    const foe = { x: 100, y: 0 };
    const a = w.stepDirection(m, foe);
    const b = w.stepDirection(m, foe);
    // 横へ(y が大きい)、少し相手へ(x が正)、左右は逆
    expect(Math.abs(a.y)).toBeGreaterThan(0.8);
    expect(a.x).toBeGreaterThan(0);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
    expect(w.stepDirection(r, foe).x).toBeCloseTo(-1);
  });
});
