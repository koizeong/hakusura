import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { resolveSkill } from './data/skills';
import { WEAPON_TYPES, WEAPON_KIND_POWER } from './data/weapons';
import { ATTRIBUTE_RULES, baseAttributes, expToNext, missingPoints, pointsAtLevel, shortfallPenalty, type Attributes } from './data/attributes';
import { addExp, applyBuild, buildProblems, characterPoints, decodeBuild, encodeBuild, levelForPoints, newCharacter, unspentPoints, type Build } from './build';

const attrs = (extra: Partial<Attributes>): Attributes => ({ ...baseAttributes(), ...extra });
const power = (r: ReturnType<typeof resolveSkill>) => (r && 'power' in r.action ? r.action.power : 0);

describe('能力値の足りなさ', () => {
  it('足りていれば威力も間隔も変わらない', () => {
    const r = resolveSkill('slash', 'rustGreatsword', attrs({ str: 18 }))!;
    expect(r.missing).toBe(0);
    expect(power(r)).toBe((WEAPON_TYPES.rustGreatsword.power * WEAPON_KIND_POWER.melee));
  });

  it('足りない1点ごとに威力-8%、間隔+4%', () => {
    const r = resolveSkill('slash', 'rustGreatsword', attrs({ str: 14 }))!;
    expect(r.missing).toBe(4);
    expect(power(r)).toBeCloseTo((WEAPON_TYPES.rustGreatsword.power * WEAPON_KIND_POWER.melee) * 0.68);
    expect(r.cooldown).toBeCloseTo(WEAPON_TYPES.rustGreatsword.interval * 1.16);
  });

  it('武器と技の両方で足りなければ合算する', () => {
    // 叩き割りは筋力20、錆びた大剣は筋力18。筋力14なら 6 + 4
    const r = resolveSkill('cleave', 'rustGreatsword', attrs({ str: 14 }))!;
    expect(r.missing).toBe(10);
    expect(power(r)).toBeCloseTo((WEAPON_TYPES.rustGreatsword.power * WEAPON_KIND_POWER.melee) * 2.2 * 0.2);
  });

  it('威力は0を下回らない', () => {
    expect(shortfallPenalty(30).power).toBe(0);
    expect(missingPoints({ str: 20, dex: 12 }, attrs({ str: 10 }))).toBe(14);
  });

  it('付与も足りなければ追撃が弱くなる', () => {
    const r = resolveSkill('emberOil', undefined, attrs({ fai: 8 }))!;
    expect(r.action.type === 'imbue' && r.action.ratio).toBeCloseTo(0.5 * (1 - 0.08 * 4));
  });

  it('戦っている最中も、足りない分だけ与ダメージが落ちる', () => {
    const run = (str: number) => {
      const w = new CombatWorld();
      w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: ['rustGreatsword'], attributes: attrs({ str }) });
      w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
      w.useSkill('p', 'slash', { x: 60, y: 0 });
      for (let t = 0; t < 400; t += 10) w.update(10);
      return w.log[0]!.amount;
    };
    // 筋力は近攻撃も伸ばすので、その分も掛け合わせる
    const R = ATTRIBUTE_RULES;
    expect(run(13)).toBeCloseTo(((run(18) * 0.6) / (1 + R.meleePerStr * 10)) * (1 + R.meleePerStr * 5));
  });
});

describe('能力値の振り分け', () => {
  const build = (attributes: Attributes): Build => ({ actives: [], passives: [], equipment: {}, tactics: [], attributes });

  it('体力1につき最大HP+3%', () => {
    const w = new CombatWorld();
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 300 });
    applyBuild(w, p, build(attrs({ vit: 18 })));
    expect(p.maxHp).toBe(Math.round(300 * (1 + ATTRIBUTE_RULES.hpPerVit * 10)));
  });

  it('振れる点数を超えたり、基礎より下げたりすると知らせる', () => {
    expect(buildProblems(build(attrs({ str: 11 })))).toEqual([]);
    expect(buildProblems(build(attrs({ str: 12 })))).toContain('能力値は3点まで振れる');
    expect(buildProblems(build(attrs({ str: 12 })), 4)).toEqual([]);
    expect(buildProblems(build(attrs({ str: 7 })))).toContain('能力値は8より下げられない');
  });

  it('ビルドコードに入り、壊れていれば断る', () => {
    const b = build(attrs({ dex: 20, int: 12 }));
    expect(decodeBuild(encodeBuild(b))).toEqual({ build: b });
    const bad = encodeBuild({ ...b, attributes: { ...b.attributes!, str: 'たくさん' as unknown as number } });
    expect(decodeBuild(bad)).toEqual({ error: '能力値が壊れている' });
  });
});

describe('能力値は基礎値として効く', () => {
  it('筋力は近攻撃、技量は間隔、理力は雷、信仰は火、体力は最大HP', () => {
    const R = ATTRIBUTE_RULES;
    const w = new CombatWorld();
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, attributes: attrs({ str: 18, dex: 18, int: 18, fai: 18, vit: 18 }) });
    expect(w.statOf(p, 'damage', ['melee'])).toBeCloseTo(1 + R.meleePerStr * 10);
    expect(w.statOf(p, 'damage', ['ranged'])).toBeCloseTo(1);
    expect(w.statOf(p, 'cooldown')).toBeCloseTo(Math.pow(R.intervalPerDex, 10));
    expect(w.statOf(p, 'damage', ['lightning'])).toBeCloseTo(1 + R.lightningPerInt * 10);
    expect(w.statOf(p, 'damage', ['fire'])).toBeCloseTo(1 + R.firePerFai * 10);
    expect(w.statOf(p, 'maxHp')).toBeCloseTo(1 + R.hpPerVit * 10);
  });

  it('Lv50の点数を全て筋力に振っても、近攻撃は2倍に届かない(ビルドの方が大きく効く)', () => {
    const w = new CombatWorld();
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, attributes: attrs({ str: 8 + pointsAtLevel(ATTRIBUTE_RULES.maxLevel) }) });
    expect(w.statOf(p, 'damage', ['melee'])).toBeLessThan(2);
  });

  it('技量をいくら上げても、間隔は0にならない', () => {
    const w = new CombatWorld();
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, attributes: attrs({ dex: 500 }) });
    expect(w.statOf(p, 'cooldown')).toBeGreaterThan(0);
  });
});

describe('レベル', () => {
  const blank = { actives: [], passives: [], equipment: {}, tactics: [] };

  it('新しいキャラはLv1、能力値は基礎のまま', () => {
    const c = newCharacter('c1', '灰の巡礼者', 0, blank);
    expect(c.level).toBe(1);
    expect(c.build.attributes).toEqual(baseAttributes());
    expect(unspentPoints(c)).toBe(ATTRIBUTE_RULES.startPoints);
  });

  it('経験値が貯まるとレベルが上がり、1レベルごとに1点増える', () => {
    const c = newCharacter('c1', '灰の巡礼者', 0, blank);
    expect(addExp(c, expToNext(1) + expToNext(2) + 5)).toBe(2);
    expect(c.level).toBe(3);
    expect(c.exp).toBe(5);
    expect(characterPoints(c)).toBe(ATTRIBUTE_RULES.startPoints + 2);
  });

  it('レベルは50で止まり、それ以上は貯まらない', () => {
    const c = newCharacter('c1', '灰の巡礼者', 0, blank);
    addExp(c, 1e9);
    expect(c.level).toBe(50);
    expect(c.exp).toBe(0);
    expect(characterPoints(c)).toBe(52);
  });

  it('振った分だけ、振れる残りが減る', () => {
    const c = newCharacter('c1', '灰の巡礼者', 0, blank);
    c.build.attributes = attrs({ str: 10 });
    expect(unspentPoints(c)).toBe(ATTRIBUTE_RULES.startPoints - 2);
    expect(levelForPoints(24)).toBe(22);
  });
});
