import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { MARKS } from './data/marks';
import { conditionDef, type ConditionId } from './data/conditions';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function duel(conditions: ConditionId[], weapon: 'ironSword' | 'cinderAxe' = 'ironSword') {
  const w = new CombatWorld({ seed: 1 });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, weapons: [{ type: weapon, element: weapon === 'cinderAxe' ? 'fire' : undefined }], conditions });
  const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  const swing = () => {
    p.busyUntil = 0;
    p.cooldowns = {};
    p.streak = { count: 0 };
    w.useSkill('p', 'slash', t, 't');
    run(w, 700);
  };
  return { w, p, t, swing };
}

describe('印', () => {
  it('生む札で印が溜まり、最大で止まり、時間が経つと消える', () => {
    const { w, p, swing } = duel(['honeEdge']);
    swing();
    expect(w.marksOf(p, 'edge')).toBe(1);
    for (let i = 0; i < 8; i++) swing();
    expect(w.marksOf(p, 'edge')).toBe(MARKS.edge.max);
    run(w, MARKS.edge.duration + 100);
    expect(w.marksOf(p, 'edge')).toBe(0);
  });

  it('使う札は、生む札がなければ働かない。揃えると効く', () => {
    const total = (conditions: ConditionId[]) => {
      const { w, swing } = duel(conditions);
      for (let i = 0; i < 6; i++) swing();
      const before = w.log.length;
      swing();
      return w.log.slice(before).filter((r) => r.depth === 0).reduce((s, r) => s + r.amount, 0);
    };
    const plain = total([]);
    expect(total(['keenEdge'])).toBeCloseTo(plain, 5);
    // 研ぎ5つで +75%
    expect(total(['honeEdge', 'keenEdge']) / plain).toBeCloseTo(1.75, 1);
  });

  it('変える札:血潮を得るたび研ぎも得る(連鎖は上限の段まで)', () => {
    const { w, p } = duel(['bloodWhetstone']);
    w.gainMark(p, 'blood', 2);
    expect(w.marksOf(p, 'edge')).toBe(1);
  });

  it('吐く札:研ぎが5つ溜まると全て使い、5回多く当たる', () => {
    const { w, p, swing } = duel(['honeEdge', 'edgeRelease']);
    for (let i = 0; i < 4; i++) swing();
    w.gainMark(p, 'edge', 5);
    const before = w.log.length;
    swing();
    const hits = w.log.slice(before).filter((r) => r.via.includes('研ぎ放ち'));
    expect(hits).toHaveLength(5);
    expect(w.marksOf(p, 'edge')).toBeLessThanOrEqual(1);
  });

  it('倒れると印を失う', () => {
    const { w, p } = duel([]);
    w.gainMark(p, 'ember', 3);
    p.hp = 1;
    w.addUnit({ id: 'e', name: '敵', team: 'enemy', x: 40, y: 0, maxHp: 100, ai: ['strawSwipe'] });
    for (let i = 0; i < 200 && p.falls === 0; i++) w.update(25);
    expect(p.falls).toBeGreaterThan(0);
    expect(w.marksOf(p, 'ember')).toBe(0);
  });

  it('印の条件文は役割(生む・変える・使う)を持つ', () => {
    expect(conditionDef('kindleEmber').marks?.gives).toEqual(['ember']);
    expect(conditionDef('bloodWhetstone').marks).toEqual({ gives: ['edge'], uses: ['blood'] });
    expect(conditionDef('emberBlaze').marks?.uses).toEqual(['ember']);
  });
});
