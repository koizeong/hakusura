import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { MARKS, MARK_RULES } from './data/marks';
import { conditionDef, conditionStacking, type ConditionId } from './data/conditions';
import { FORMS, MASTERY, masteryLevel } from './data/forms';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function duel(conditions: ConditionId[], weapon: 'ironSword' | 'cinderAxe' = 'ironSword') {
  const w = new CombatWorld({ seed: 1, markCurve: false });
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
    w.gainMark(p, 'edge', 50000);
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
    // 研ぎ20は抱えの恩恵の1段(近攻撃+12%)も乗る
    expect(total(['keenEdge'], 20) / plain).toBeCloseTo((1 + 0.15 * MARK_RULES.perMarkCap) * (1 + MARKS.edge.blessing.perTier), 2);
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

  it('生成力:札から得る印は、溜まっている量 100 ごとに1倍ずつ増える。別の印で伸ばす札もある', () => {
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, conditions: ['honeEdge'] });
    const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
    const gainOnce = () => {
      const before = p.marks.edge?.count ?? 0;
      p.busyUntil = 0;
      p.cooldowns = {};
      p.streak = { count: 0 };
      w.useSkill('p', 'slash', t, 't');
      run(w, 700);
      return (p.marks.edge?.count ?? 0) - before;
    };
    // 0から:そのまま
    expect(gainOnce()).toBeCloseTo(1, 5);
    // 外から直に足すときは、そのまま
    w.gainMark(p, 'edge', 300 - (p.marks.edge?.count ?? 0));
    expect(w.marksOf(p, 'edge')).toBe(300);
    // 300溜まっていれば4倍
    expect(gainOnce()).toBeCloseTo(1 + 300 / MARK_RULES.growthPer, 5);
    // 血の研ぎ場:血潮の量で研ぎの生成力が伸びる
    p.conditions = ['honeEdge', 'bloodForge'];
    w.gainMark(p, 'blood', 100);
    expect(w.markGrowthOf(p, 'edge')).toBeCloseTo(1 + (p.marks.edge!.count) / MARK_RULES.growthPer + 100 / 50, 5);
  });

  it('変換効率:変える札は、元の印の量で増える', () => {
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, conditions: ['bloodWhetstone'] });
    w.gainMark(p, 'blood', 200);
    // 血潮を200持っていれば、研ぎは3倍
    expect(w.marksOf(p, 'edge')).toBe(3);
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
      const w = new CombatWorld({ seed: 1, markCurve: false });
      const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type: 'ironSword' }] });
      p.formUses = { steppingCut: uses };
      w.gainMark(p, 'edge', 100);
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
    const w = new CombatWorld({ seed: 11, markCurve: false });
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
    const w = new CombatWorld({ seed: 12, markCurve: false });
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
    const w = new CombatWorld({ seed: 1, markCurve: false });
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
    w.gainMark(p, 'edge', 99);
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

describe('技と印(溜める・保つ・使う)', () => {
  it('基本の技のほかは、どの技も印を溜める・保つ・使う', async () => {
    const { ACTIVE_SKILLS } = await import('./data/skills');
    const basics = ['slash', 'sweep', 'shoot', 'quickShot'];
    for (const [id, def] of Object.entries(ACTIVE_SKILLS) as [string, { tags: readonly string[]; markGain?: unknown; markHold?: unknown; markCost?: unknown }][]) {
      if (basics.includes(id) || def.tags.includes('enemy') || def.tags.includes('trump') || def.tags.includes('art')) continue;
      expect(!!(def.markGain || def.markHold || def.markCost), id).toBe(true);
    }
  });

  it('溜める技は当てると印を得る。儀式は使うと得る', () => {
    const { w, p } = duel([]);
    const t = w.units.get('t')!;
    w.useSkill('p', 'thrust', t, 't');
    run(w, 900);
    expect(w.marksOf(p, 'edge')).toBe(2);
    p.busyUntil = 0;
    w.useSkill('p', 'whetRite', t);
    expect(w.marksOf(p, 'edge')).toBeGreaterThanOrEqual(5);
  });

  it('保つ技は印が足りなければ出ず、出しても印は減らず、条件がきついほど重い', async () => {
    const { resolveSkill } = await import('./data/skills');
    const { holdPower } = await import('./data/marks');
    const { w, p } = duel([]);
    p.cooldowns = {};
    expect(w.canUseSkill('p', 'lunge')).toBe(false);
    w.gainMark(p, 'edge', 10);
    expect(w.canUseSkill('p', 'lunge')).toBe(true);
    w.useSkill('p', 'lunge', w.units.get('t')!, 't');
    expect(w.marksOf(p, 'edge')).toBe(10);
    const r = resolveSkill('lunge', 'ironSword')!;
    const base = resolveSkill('slash', 'ironSword')!;
    const pw = (x: typeof r) => ('power' in x.action ? x.action.power : 0);
    expect(pw(r) / pw(base)).toBeCloseTo(1.15 * holdPower(10));
    expect(holdPower(30)).toBeGreaterThan(holdPower(10));
  });

  it('使う技は印を消費し、消費に見合う威力が足される', async () => {
    const { resolveSkill } = await import('./data/skills');
    const { spendBonus } = await import('./data/marks');
    const { w, p } = duel([]);
    p.cooldowns = {};
    w.gainMark(p, 'edge', 32);
    w.useSkill('p', 'cleave', w.units.get('t')!, 't');
    expect(w.marksOf(p, 'edge')).toBe(2);
    const r = resolveSkill('cleave', 'ironSword')!;
    const base = resolveSkill('slash', 'ironSword')!;
    const pw = (x: typeof r) => ('power' in x.action ? x.action.power : 0);
    expect(pw(r) / pw(base)).toBeCloseTo(2.2 + spendBonus(30));
  });
});

describe('印の札・二の巻', () => {
  it('飢える札は、印がないときだけ働く', () => {
    const { w, p, swing } = duel(['edgeHunger']);
    const count = () => w.log.filter((r) => r.via.includes('刃こぼれの執念')).length;
    swing();
    expect(count()).toBeGreaterThan(0);
    const before = count();
    w.gainMark(p, 'edge', 3);
    swing();
    expect(count()).toBe(before);
  });

  it('取り揃える札は、印の種類で伸びる', () => {
    const dmg = (marks: readonly ('edge' | 'ember' | 'blood' | 'stillness' | 'prayer')[]) => {
      const { w, p, swing } = duel(['fiveMarks', 'prismBlade']);
      for (const m of marks) w.gainMark(p, m, 1);
      swing();
      return w.log.find((r) => r.depth === 0)!.amount;
    };
    const none = dmg([]);
    expect(dmg(['edge', 'ember'])).toBeCloseTo(none * 1.24, 0);
    expect(dmg(['edge', 'ember', 'blood', 'stillness', 'prayer'])).toBeCloseTo(none * 1.6 * 2, 0);
  });

  it('頂の札は、その数に届いた瞬間だけ働く', () => {
    const { w, p } = duel(['bloodCrest']);
    p.hp = 100;
    w.gainMark(p, 'blood', 29);
    expect(p.hp).toBe(100);
    w.gainMark(p, 'blood', 1);
    expect(p.hp).toBeCloseTo(100 + p.maxHp * 0.2);
    w.gainMark(p, 'blood', 5);
    expect(p.hp).toBeCloseTo(100 + p.maxHp * 0.2);
  });

  it('名残の札は、印が消えたときと倒れたときに、失った数で働く', () => {
    const { w, p } = duel(['stillnessToEdge']);
    w.gainMark(p, 'stillness', 6);
    run(w, MARKS.stillness.duration + 100);
    expect(w.marksOf(p, 'stillness')).toBe(0);
    expect(w.marksOf(p, 'edge')).toBe(6);
  });

  it('埋み火の札で、印が消えるまでの時間が延びる', () => {
    const { w, p } = duel(['restingEdge']);
    w.gainMark(p, 'edge', 5);
    run(w, MARKS.edge.duration * 2);
    expect(w.marksOf(p, 'edge')).toBe(5);
  });

  it('倹約の札は、使った数の一部を取り戻す', () => {
    const { w, p } = duel(['edgeThrift']);
    p.cooldowns = {};
    w.gainMark(p, 'edge', 30);
    w.useSkill('p', 'cleave', w.units.get('t')!, 't');
    expect(w.marksOf(p, 'edge')).toBe(9);
  });

  it('使い手の札は、印を使う技にだけ効く', () => {
    const hit = (conditions: ConditionId[], skill: 'cleave' | 'slash') => {
      const { w, p } = duel(conditions);
      p.cooldowns = {};
      w.gainMark(p, 'edge', 30);
      w.useSkill('p', skill, w.units.get('t')!, 't');
      run(w, 1500);
      return w.log.find((r) => r.depth === 0)!.amount;
    };
    expect(hit(['spenderHand'], 'cleave') / hit([], 'cleave')).toBeCloseTo(1.5, 1);
    expect(hit(['spenderHand'], 'slash') / hit([], 'slash')).toBeCloseTo(1, 1);
  });

  it('状態の発動から印を生む札', () => {
    const { w, p, t, swing } = duel(['bleedEdge']);
    t.statuses.bleed.buildup = 99;
    swing();
    expect(w.isActive(t, 'bleed')).toBe(true);
    expect(w.marksOf(p, 'edge')).toBe(3);
  });
});

describe('印は被弾でこぼれる', () => {
  it('敵の直撃を受けると、印をそれぞれ1割と傷の割合だけ失い、失ったときの札が働く', () => {
    const w = new CombatWorld({ seed: 1, markCurve: false });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, conditions: ['lostBlood'] });
    const e = w.addUnit({ id: 'e', name: '亡者', team: 'enemy', x: 40, y: 0, maxHp: 1e9, ai: ['strawSwipe'] });
    w.gainMark(p, 'edge', 100);
    const before = w.marksOf(p, 'edge');
    run(w, 4000);
    const hurt = w.log.filter((r) => r.targetId === 'p' && r.attackerId === e.id && r.depth === 0);
    expect(hurt.length).toBeGreaterThan(0);
    expect(w.marksOf(p, 'edge')).toBeLessThan(before);
    // 失せ物の血:失った数の半分の血潮
    expect(w.marksOf(p, 'blood')).toBeGreaterThan(0);
  });

  it('被弾で失う印の割合は、上限で止まり、補正値で減らせる', () => {
    const w = new CombatWorld({ seed: 1, markCurve: false });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000 });
    w.gainMark(p, 'ember', 100);
    w.shakeMarks(p, 10_000);
    expect(w.marksOf(p, 'ember')).toBe(50);
    const q = w.addUnit({ id: 'q', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, conditions: ['steadyHeart'] });
    w.gainMark(q, 'ember', 100);
    w.shakeMarks(q, 0);
    expect(w.marksOf(q, 'ember')).toBe(95);
    // こぼれた怒り:直撃でこぼした数だけ血潮(消えたときは働かない)
    const r = w.addUnit({ id: 'r', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, conditions: ['spilledFury'] });
    w.gainMark(r, 'edge', 100);
    w.shakeMarks(r, 0);
    expect(w.marksOf(r, 'blood')).toBe(10);
  });
});

describe('抱えの恩恵', () => {
  it('持っている印の段(10・100・1000・10000)ごとにバフがかかり、補正値で強まる', async () => {
    const { blessingTier } = await import('./data/marks');
    expect([9, 10, 99, 100, 1000, 10000].map(blessingTier)).toEqual([0, 1, 1, 2, 3, 4]);
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000 });
    expect(w.statOf(p, 'cooldown')).toBeCloseTo(1);
    w.gainMark(p, 'prayer', 1000);
    expect(w.statOf(p, 'cooldown')).toBeCloseTo(1 + MARKS.prayer.blessing.perTier * 3);
    p.equipment = [{ id: 'a', name: '祈りの護符', kind: 'accessory', affixes: [{ affix: 'prayerBlessing', value: 100 }] }];
    expect(w.statOf(p, 'cooldown')).toBeCloseTo(1 + MARKS.prayer.blessing.perTier * 3 * 2);
  });
});
