import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { MARKS } from './data/marks';
import { conditionDef, conditionStacking, type ConditionId } from './data/conditions';
import { FORMS, MASTERY, masteryLevel } from './data/forms';

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

describe('使うたびに', () => {
  it('印を使うと、使うたびの札が働く(研ぎを吐くと祈りを得る)', () => {
    const { w, p, swing } = duel(['honeEdge', 'edgeRelease', 'spentPrayer']);
    w.gainMark(p, 'edge', 5);
    swing();
    expect(w.marksOf(p, 'prayer')).toBe(2);
  });

  it('研ぎ傷:研ぎを使うたび、相手に出血が溜まる', () => {
    const { w, p, t, swing } = duel(['edgeRelease', 'edgeBleed']);
    w.gainMark(p, 'edge', 5);
    swing();
    expect(w.isActive(t, 'bleed') || t.statuses.bleed.buildup >= 150).toBe(true);
  });
});

describe('条件文の重なり方', () => {
  it('+の条件文どうしは足し算、×の条件文は掛け算', () => {
    expect(conditionStacking('unscathed')).toBe('add');
    expect(conditionStacking('stormConduit')).toBe('mult');
    expect(conditionStacking('link:melee>ranged:mult')).toBe('link');
    expect(conditionStacking('kindleEmber')).toBe('none');
    const first = (conditions: ConditionId[]) => {
      const { w, swing } = duel(conditions);
      for (const s of ['wet', 'oiled', 'stun'] as const) w.forceStatus('t', s, true);
      swing();
      return w.log.find((r) => r.depth === 0 && r.targetId === 't')!.amount;
    };
    const plain = first([]);
    // 無傷の驕り+25% と 病み重ね+50% は足し算で+75%(掛け算なら+87.5%)
    expect(first(['unscathed', 'manyAilments']) / plain).toBeCloseTo(1.75, 2);
  });
});

describe('型の熟達', () => {
  it('型を決めた回数で熟達が上がり、最後の一手の見返りが増える', () => {
    expect(masteryLevel(0)).toBe(1);
    expect(masteryLevel(MASTERY.levels[0]!)).toBe(2);
    const finisher = (uses: number) => {
      const w = new CombatWorld({ seed: 1 });
      const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type: 'ironSword' }] });
      p.formUses = { steppingCut: uses };
      const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
      w.useSkill('p', 'slash', t, 't');
      run(w, 800);
      p.busyUntil = 0;
      const before = w.log.length;
      w.useSkill('p', 'lunge', t, 't');
      run(w, 900);
      const hit = w.log.slice(before).find((r) => r.depth === 0 && r.via.includes('踏み込み斬り'))!;
      return { amount: hit.amount, uses: p.formUses.steppingCut };
    };
    const fresh = finisher(0);
    const seasoned = finisher(MASTERY.levels[1]!);
    expect(fresh.uses).toBe(1);
    const bonus = FORMS.steppingCut.bonus;
    expect(seasoned.amount / fresh.amount).toBeCloseTo((1 + bonus * (1 + MASTERY.perLevel * 2)) / (1 + bonus), 2);
  });
});

describe('吐き出す息', () => {
  it('印を使うと、次の2つの技の振りかぶりと硬直が半分になる', () => {
    const { w, p, swing } = duel(['edgeRelease', 'spentHaste']);
    const busy = () => p.busyUntil - w.time;
    p.busyUntil = 0;
    w.useSkill('p', 'slash', w.units.get('t')!, 't');
    const normal = busy();
    run(w, 700);
    w.gainMark(p, 'edge', 5);
    swing();
    expect(p.quicken?.charges).toBe(2);
    p.busyUntil = 0;
    p.cooldowns = {};
    w.useSkill('p', 'slash', w.units.get('t')!, 't');
    expect(busy()).toBeCloseTo(normal * 0.5, 0);
    expect(p.quicken?.charges).toBe(1);
  });
});
