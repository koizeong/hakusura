import { describe, expect, it } from 'vitest';
import { CombatWorld, type Unit } from './world';
import { ACTIVE_SKILLS, type ActiveSkillId } from './data/skills';
import { applyBuild, type Build } from './build';
import type { Item } from './data/equipment';
import type { ConditionId } from './data/conditions';
import type { PassiveId } from './data/passives';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

const weapon = (id: string, affixes: Item['affixes'] = [{ affix: 'maxHp', value: 10 }]): Item => ({ id, name: '刃', kind: 'weapon', affixes });
const accessory = (condition: ConditionId): Item => ({ id: condition, name: '護符', kind: 'accessory', affixes: [], condition });

function setup(opts: { weapons?: Item[]; conditions?: ConditionId[]; passives?: PassiveId[]; enemies?: { x: number; y: number }[] } = {}) {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 300 });
  (opts.enemies ?? [{ x: 60, y: 0 }]).forEach((at, i) => w.addUnit({ id: `e${i}`, name: '案山子', team: 'enemy', ...at, maxHp: 1e9 }));
  const equipment: Build['equipment'] = {};
  (opts.weapons ?? []).forEach((it, i) => (equipment[i === 0 ? 'weapon1' : 'weapon2'] = it));
  (opts.conditions ?? []).forEach((c, i) => (equipment[(['accessory1', 'accessory2', 'accessory3'] as const)[i]!] = accessory(c)));
  applyBuild(w, p, { actives: [], passives: opts.passives ?? [], equipment, tactics: [] });
  return { w, p };
}

function swing(w: CombatWorld, p: Unit, skill: ActiveSkillId, at = { x: 60, y: 0 }) {
  p.cooldowns = {};
  p.busyUntil = 0;
  w.useSkill('p', skill, at);
  run(w, ACTIVE_SKILLS[skill].windup + 20);
}

const power = (id: ActiveSkillId) => {
  const a = ACTIVE_SKILLS[id].action;
  return 'power' in a ? a.power : 0;
};

describe('武器の持ち方', () => {
  it('武器の数で、素手・両手持ち・二刀流が決まり、タグになる', () => {
    expect(setup().p.tags).toEqual(['unarmed']);
    expect(setup({ weapons: [weapon('a')] }).p.tags).toEqual(['twoHanded']);
    expect(setup({ weapons: [weapon('a'), weapon('b', [{ affix: 'maxHp', value: 20 }])] }).p.tags).toEqual(['dualWield']);
    expect(setup({ weapons: [weapon('a'), weapon('b')] }).p.tags).toEqual(['dualWield', 'dualTotalsEqual']);
  });

  it('両手持ちは近攻撃のダメージ+25%、二刀流はクールダウン-15%', () => {
    const two = setup({ weapons: [weapon('a', [])] });
    swing(two.w, two.p, 'rustGreatsword');
    expect(two.w.log[0]!.amount).toBeCloseTo(power('rustGreatsword') * 1.25);
    const dual = setup({ weapons: [weapon('a', []), weapon('b', [])] });
    expect(dual.w.statOf(dual.p, 'cooldown')).toBeCloseTo(0.85);
  });
});

describe('武器の条件文', () => {
  it('32: 両手持ちのとき、攻撃範囲が2倍', () => {
    const { w, p } = setup({ weapons: [weapon('a')], conditions: ['twoHandedReach'], enemies: [{ x: 180, y: 0 }] });
    swing(w, p, 'rustGreatsword', { x: 180, y: 0 });
    expect(w.log.length).toBe(1);
    const unarmed = setup({ conditions: ['twoHandedReach'], enemies: [{ x: 180, y: 0 }] });
    swing(unarmed.w, unarmed.p, 'rustGreatsword', { x: 180, y: 0 });
    expect(unarmed.w.log.length).toBe(0);
  });

  it('176: 両手持ちのとき、二刀流向けのスキルの威力が2倍', () => {
    const { w, p } = setup({ weapons: [weapon('a', [])], conditions: ['twoHandedDual'] });
    swing(w, p, 'boneFlail');
    expect(w.log[0]!.amount).toBeCloseTo(power('boneFlail') * 1.25 * 2);
    expect(w.log[0]!.combos).toContain('oddGrip');
  });

  it('177: 二刀流で左右の補正値の合計が同じなら、近攻撃が左右同時に出る', () => {
    const same = setup({ weapons: [weapon('a'), weapon('b')], conditions: ['mirroredBlades'] });
    swing(same.w, same.p, 'boneFlail');
    expect(same.w.log.filter((r) => r.skill === '骨の連枷').length).toBe(2);
    const differ = setup({ weapons: [weapon('a'), weapon('b', [])], conditions: ['mirroredBlades'] });
    swing(differ.w, differ.p, 'boneFlail');
    expect(differ.w.log.filter((r) => r.skill === '骨の連枷').length).toBe(1);
  });
});

describe('追加した条件文', () => {
  it('47: 無傷の間、移動速度と攻撃速度+30%。被弾で消え、勘定をやり直すと戻る', () => {
    const { w, p } = setup({ conditions: ['untouched'] });
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(1.3);
    expect(w.statOf(p, 'cooldown')).toBeCloseTo(0.77);
    w.useSkill('e0', 'strawSwipe', p);
    run(w, 1000);
    expect(w.statOf(p, 'moveSpeed')).toBe(1);
    w.resetLog();
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(1.3);
  });

  it('106: 移動した距離に応じて、次のアクティブの威力が上がる', () => {
    const { w, p } = setup({ conditions: ['runningBlade'] });
    for (let x = 0; x <= 300; x += 10) w.moveUnit('p', -x, 0);
    w.moveUnit('p', 0, 0);
    swing(w, p, 'rustGreatsword');
    // 600 歩いたので +100%(上限)
    expect(w.log[0]!.amount).toBeCloseTo(power('rustGreatsword') * 2);
    swing(w, p, 'rustGreatsword');
    expect(w.log.filter((r) => r.depth === 0)[1]!.amount).toBeCloseTo(power('rustGreatsword'));
  });

  it('123: 1回の攻撃で5体以上に当てると、全てのクールダウンが1秒短くなる', () => {
    const ring = [0, 1, 2, 3, 4].map((i) => ({ x: Math.cos(i * 1.25) * 70, y: Math.sin(i * 1.25) * 70 }));
    const { w, p } = setup({ conditions: ['crowdCleaver'], enemies: ring });
    p.cooldowns.emberOil = w.time + 5000;
    w.useSkill('p', 'whirlwind', { x: 1, y: 0 });
    const before = p.cooldowns.whirlwind!;
    run(w, ACTIVE_SKILLS.whirlwind.windup + 20);
    expect(p.cooldowns.whirlwind).toBeCloseTo(before - 1000);
    expect(p.cooldowns.emberOil! - w.time).toBeLessThan(4000);
  });
});

describe('追加したパッシブ', () => {
  it('間合い詰め: 近攻撃のクールダウン-20%(遠攻撃には効かない)', () => {
    const { w, p } = setup({ passives: ['closeQuarters'] });
    w.useSkill('p', 'rustGreatsword', { x: 60, y: 0 });
    expect(p.cooldowns.rustGreatsword! - w.time).toBeCloseTo(ACTIVE_SKILLS.rustGreatsword.cooldown * 0.8);
    p.busyUntil = 0;
    w.useSkill('p', 'thunderGun', { x: 60, y: 0 });
    expect(p.cooldowns.thunderGun! - w.time).toBeCloseTo(ACTIVE_SKILLS.thunderGun.cooldown);
  });

  it('血の昂り: 出血が発動すると、近攻撃のクールダウンが縮む', () => {
    const { w, p } = setup({ passives: ['bloodRush'] });
    swing(w, p, 'rustGreatsword');
    p.cooldowns = {};
    p.busyUntil = 0;
    w.useSkill('p', 'rustGreatsword', { x: 60, y: 0 });
    const before = p.cooldowns.rustGreatsword!;
    run(w, ACTIVE_SKILLS.rustGreatsword.windup + 20);
    expect(p.cooldowns.rustGreatsword).toBeCloseTo(before - 500);
  });

  it('油染み: 自分が油まみれの間、火ダメージ+60%', () => {
    const { w, p } = setup({ passives: ['oilSoaked'] });
    w.forceStatus('p', 'oiled', true);
    swing(w, p, 'cinderAxe');
    expect(w.log[0]!.amount).toBeCloseTo(power('cinderAxe') * 1.6);
    expect(w.log[0]!.combos).toContain('selfImmolation');
  });
});
