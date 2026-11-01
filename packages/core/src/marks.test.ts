import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { MARKS, MARK_RULES } from './data/marks';
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
    w.gainMark(p, 'edge', 500);
    expect(w.marksOf(p, 'edge')).toBe(MARKS.edge.max);
    run(w, MARKS.edge.duration + 100);
    expect(w.marksOf(p, 'edge')).toBe(0);
  });

  it('使う札は、印がなければ働かない。1つにつきの札は10まで数える', () => {
    const total = (conditions: ConditionId[], edges: number) => {
      const { w, p, swing } = duel(conditions);
      if (edges > 0) w.gainMark(p, 'edge', edges);
      const before = w.log.length;
      swing();
      return w.log.slice(before).filter((r) => r.depth === 0).reduce((s, r) => s + r.amount, 0);
    };
    const plain = total([], 0);
    expect(total(['keenEdge'], 0)).toBeCloseTo(plain, 5);
    // 研ぎ4つで +60%、20あっても数えるのは10まで(+150%)
    expect(total(['keenEdge'], 4) / plain).toBeCloseTo(1.6, 2);
    expect(total(['keenEdge'], 20) / plain).toBeCloseTo(1 + 0.15 * MARK_RULES.perMarkCap, 2);
  });

  it('変える札:血潮を得るたび研ぎも得る(連鎖は上限の段まで)', () => {
    const { w, p } = duel(['bloodWhetstone']);
    w.gainMark(p, 'blood', 2);
    expect(w.marksOf(p, 'edge')).toBe(1);
  });

  it('吐く札:研ぎが10以上あれば5つ使い、5回多く当たる(多く溜めても5つだけ)', () => {
    const { w, p, swing } = duel(['edgeRelease']);
    w.gainMark(p, 'edge', 12);
    const before = w.log.length;
    swing();
    // 出血のように、追加のヒットから広がった傷は数えない
    const hits = w.log.slice(before).filter((r) => r.via.includes('研ぎ放ち') && r.tags.includes('repeat'));
    expect(hits).toHaveLength(5);
    expect(w.marksOf(p, 'edge')).toBe(7);
    // 10に満たなければ吐かない(5つは印の技のために残る)
    const second = duel(['edgeRelease']);
    second.w.gainMark(second.p, 'edge', 9);
    second.swing();
    expect(second.w.marksOf(second.p, 'edge')).toBe(9);
  });

  it('溜まるほど溜まりやすい', () => {
    const { w, p } = duel([]);
    w.gainMark(p, 'edge', 30);
    expect(w.marksOf(p, 'edge')).toBe(30);
    w.gainMark(p, 'edge', 1);
    expect(w.marksOf(p, 'edge')).toBe(32);
    // 32溜まっていれば、30得ると60余り増える(倍より多い)
    w.gainMark(p, 'edge', 30);
    expect(w.marksOf(p, 'edge')).toBe(94);
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
    w.gainMark(p, 'edge', 10);
    swing();
    expect(w.marksOf(p, 'prayer')).toBe(2);
  });

  it('研ぎ傷:研ぎを使うたび、相手に出血が溜まる', () => {
    const { w, p, t, swing } = duel(['edgeRelease', 'edgeBleed']);
    w.gainMark(p, 'edge', 10);
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
    w.gainMark(p, 'edge', 10);
    swing();
    expect(p.quicken?.charges).toBe(2);
    p.busyUntil = 0;
    p.cooldowns = {};
    w.useSkill('p', 'slash', w.units.get('t')!, 't');
    expect(busy()).toBeCloseTo(normal * 0.5, 0);
    expect(p.quicken?.charges).toBe(1);
  });
});

describe('印の札の拾い物', () => {
  it('条件文の半分ほどが印の札で、足りない側の札が出やすい', async () => {
    const { generateItem, EQUIP_RULES } = await import('./data/equipment');
    const { lootFit } = await import('./build');
    const w = new CombatWorld({ seed: 11 });
    // 研ぎを使う札だけを着けたビルド。研ぎを生む札が欲しい
    const build = {
      actives: ['slash'],
      passives: [],
      tactics: [],
      equipment: { weapon1: { id: 's', name: '剣', kind: 'weapon', weaponType: 'ironSword', affixes: [], condition: 'keenEdge' } },
    } as never;
    const fit = lootFit(build);
    expect(fit.marks?.needGivers).toEqual(['edge']);
    const conds = Array.from({ length: 600 }, () => generateItem(() => w.random(), { fit, conditionChance: 1 }))
      .flatMap((i) => (i.condition ? [conditionDef(i.condition)] : []));
    const markCards = conds.filter((c) => c.marks);
    expect(markCards.length / conds.length).toBeGreaterThan(EQUIP_RULES.markChance * 0.8);
    const giveEdge = markCards.filter((c) => c.marks?.gives?.includes('edge')).length / markCards.length;
    expect(giveEdge).toBeGreaterThan(0.3);
  });
});

describe('印の札に役目を譲った札', () => {
  it('どこでも効く+の札は拾い物に出ない。代わりの印を生む札は働く', async () => {
    const { generateItem } = await import('./data/equipment');
    const w = new CombatWorld({ seed: 12 });
    const conds = Array.from({ length: 800 }, () => generateItem(() => w.random(), { conditionChance: 1 })).flatMap((i) => (i.condition ? [i.condition] : []));
    for (const id of ['unscathed', 'manyAilments', 'woundedFury', 'behindShield'] as const) {
      expect(conditionDef(id).retired).toBe(true);
      expect(conds).not.toContain(id);
    }
    const { p, swing } = duel(['pristineQuiet']);
    swing();
    expect(p.marks.stillness?.count).toBe(1);
  });

  it('群れ斬り:1回の攻撃で3体以上に当てると研ぎを2つ得る', () => {
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, weapons: [{ type: 'rustGreatsword' }], conditions: ['throngEdge'] });
    for (const [i, y] of [-30, 0, 30].entries()) w.addUnit({ id: `t${i}`, name: '案山子', team: 'enemy', x: 70, y, maxHp: 1e9 });
    w.useSkill('p', 'sweep', { x: 70, y: 0 });
    run(w, 1000);
    expect(w.marksOf(p, 'edge')).toBe(2);
  });
});

describe('印の技', () => {
  it('印が足りなければ使えず、使えば消費し、使うたびの札が働く', () => {
    const { w, p } = duel(['spentPrayer']);
    p.cooldowns = {};
    expect(w.canUseSkill('p', 'edgeSever')).toBe(false);
    w.gainMark(p, 'edge', 14);
    expect(w.canUseSkill('p', 'edgeSever')).toBe(false);
    w.gainMark(p, 'edge', 2);
    expect(w.canUseSkill('p', 'edgeSever')).toBe(true);
    w.useSkill('p', 'edgeSever', w.units.get('t')!, 't');
    expect(w.marksOf(p, 'edge')).toBe(1);
    expect(w.marksOf(p, 'prayer')).toBe(2);
  });

  it('消費が多いほど強く、印1つあたりの効き目も上がる', async () => {
    const { ACTIVE_SKILLS, resolveSkill } = await import('./data/skills');
    const families = [
      ['edgeCut', 'edgeSever', 'edgeStorm'],
      ['quietShot', 'breathShot', 'quietRain'],
      ['emberFist', 'emberSurge', 'pyreJudgement'],
      ['bloodStab', 'bloodWhirl', 'crimsonVerdict'],
      ['prayerLight', 'prayerVerdict', 'revelation'],
    ] as const;
    for (const family of families) {
      const perMark = family.map((id) => {
        const def = ACTIVE_SKILLS[id] as { markCost: { amount: number }; technique: { power: number; hits?: number; count?: number } };
        const t = def.technique;
        return (t.power * (t.hits ?? 1) * (t.count ?? 1)) / def.markCost.amount;
      });
      expect(perMark[1]!).toBeGreaterThan(perMark[0]!);
      expect(perMark[2]!).toBeGreaterThan(perMark[1]!);
      // どの武器でも出せる印の技か、合う種類の武器なら出せる
      expect(resolveSkill(family[0], family[0] === 'quietShot' ? 'boneBow' : 'ironSword')).toBeDefined();
    }
  });
});
