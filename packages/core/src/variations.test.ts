import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { activeSkillDef, isTechnique, resolveSkill, type ActiveSkillId } from './data/skills';
import type { WeaponTypeId } from './data/weapons';
import { VARIANT_RULES, generateVariant, variantCost, variantName, variantProblem, type SkillVariant, type VariationId } from './data/variations';
import { DEFAULT_TACTICS } from './data/tactics';
import { decodeBuild, encodeBuild, newCharacter, type Build } from './build';
import { STARTING_SKILLS, VARIANT_BASES, finishExpedition, rollVariant, startExpedition, variantPowerRatio } from './expedition';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

const variant = (base: ActiveSkillId, ...variations: VariationId[]): SkillVariant => ({ id: 'v', base, variations });

function duel(weapon: WeaponTypeId, v?: SkillVariant, enemies: { x: number; y: number }[] = [{ x: 70, y: 0 }]) {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons: [weapon] });
  if (v) p.variants[v.base] = v;
  enemies.forEach((at, i) => w.addUnit({ id: `e${i}`, name: '案山子', team: 'enemy', ...at, maxHp: 1e9 }));
  return { w, p };
}

/** クールダウンを待たずに、続けて使う */
function useNow(w: CombatWorld, p: { cooldowns: object; busyUntil: number }, skill: ActiveSkillId, at = { x: 70, y: 0 }) {
  p.cooldowns = {};
  p.busyUntil = 0;
  expect(w.useSkill('p', skill, at)).toBe(true);
  run(w, 900);
}

describe('技の変化', () => {
  it('変化つきの技は名前に変化が付き、代償は名前に出ない', () => {
    expect(variantName(variant('sweep', 'wetting'), '薙ぎ払い')).toBe('雨垂れの薙ぎ払い');
    expect(variantName(variant('sweep', 'wetting', 'heavy', 'dull'), '薙ぎ払い')).toBe('重い雨垂れの薙ぎ払い');
    expect(resolveSkill('sweep', 'ironSword', undefined, variant('sweep', 'wetting'))!.name).toBe('鉄の剣の雨垂れの薙ぎ払い');
  });

  it('数値の変化は技の倍率に重なり、威力の上下は蓄積にも効く', () => {
    const plain = resolveSkill('slash', 'ironSword')!;
    const heavy = resolveSkill('slash', 'ironSword', undefined, variant('slash', 'heavy'))!;
    expect(heavy.cooldown).toBeCloseTo(plain.cooldown * 1.4);
    expect(heavy.action).toMatchObject({ power: (plain.action as { power: number }).power * 1.5, buildup: (plain.action as { buildup: number }).buildup * 1.5 });
    const wide = resolveSkill('slash', 'ironSword', undefined, variant('slash', 'wide'))!;
    expect((wide.action as { arc: number }).arc).toBeCloseTo((plain.action as { arc: number }).arc * 1.8);
  });

  it('別の技の変化は効かない', () => {
    const plain = resolveSkill('slash', 'ironSword')!;
    expect(resolveSkill('slash', 'ironSword', undefined, variant('sweep', 'heavy'))).toEqual(plain);
  });

  it('雨垂れ:当てると濡れが溜まる', () => {
    const { w, p } = duel('ironSword', variant('slash', 'wetting'));
    useNow(w, p, 'slash');
    expect(w.units.get('e0')!.statuses.wet.buildup).toBeGreaterThan(0);
    const plain = duel('ironSword');
    useNow(plain.w, plain.p, 'slash');
    expect(plain.w.units.get('e0')!.statuses.wet.buildup).toBe(0);
  });

  it('連撃は1回で3度当たる', () => {
    const { w, p } = duel('ironSword');
    useNow(w, p, 'flurry');
    expect(w.log.filter((r) => r.depth === 0 && r.skill.includes('連撃'))).toHaveLength(3);
  });

  it('貫き撃ちは、並んだ相手を貫いて当たる', () => {
    const line = [{ x: 120, y: 0 }, { x: 200, y: 0 }, { x: 280, y: 0 }];
    const { w, p } = duel('capGun', undefined, line);
    useNow(w, p, 'pierceShot', { x: 300, y: 0 });
    run(w, 600);
    const struck = new Set(w.log.filter((r) => r.depth === 0).map((r) => r.targetId));
    expect(struck.size).toBe(3);
    const shot = duel('capGun', undefined, line);
    useNow(shot.w, shot.p, 'shoot', { x: 300, y: 0 });
    run(shot.w, 600);
    expect(new Set(shot.w.log.filter((r) => r.depth === 0).map((r) => r.targetId)).size).toBe(1);
  });

  it('三度目の:3回目に使ったときだけ雷が落ちる', () => {
    const { w, p } = duel('ironSword', variant('slash', 'thirdThunder'));
    const strikes = () => w.log.filter((r) => r.via.includes('三度目の雷')).length;
    useNow(w, p, 'slash');
    useNow(w, p, 'slash');
    expect(strikes()).toBe(0);
    useNow(w, p, 'slash');
    expect(strikes()).toBe(1);
  });

  it('木霊:4割の威力でもう一度当たる', () => {
    const { w, p } = duel('ironSword', variant('slash', 'echoing'));
    useNow(w, p, 'slash');
    const direct = w.log.find((r) => r.depth === 0)!;
    const echo = w.log.find((r) => r.via.includes('木霊'))!;
    expect(echo.amount).toBeCloseTo(direct.amount * 0.4);
  });

  it('空を切る:誰にも当たらなければ、次の一撃が強くなる', () => {
    const { w, p } = duel('ironSword', variant('slash', 'vengeful'), [{ x: 400, y: 0 }]);
    useNow(w, p, 'slash', { x: 400, y: 0 });
    expect(p.buffs.some((b) => b.label === '空を切る')).toBe(true);
  });

  it('雨乞う:雨の間は間隔が縮む', () => {
    const { w, p } = duel('ironSword', variant('slash', 'rainSwift'));
    w.useSkill('p', 'slash', { x: 70, y: 0 });
    const dry = p.cooldownSpans.slash!;
    w.weather = 'rain';
    p.cooldowns = {};
    p.busyUntil = 0;
    w.useSkill('p', 'slash', { x: 70, y: 0 });
    expect(p.cooldownSpans.slash!).toBeCloseTo(dry * 0.6);
  });
});

describe('変化の生成', () => {
  it('作った変化は決まりに収まる(数・付く技・コスト)', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 300; i++) {
      const base = VARIANT_BASES[i % VARIANT_BASES.length]!;
      const def = activeSkillDef(base);
      if (!isTechnique(def)) continue;
      const v = generateVariant(random, base, def.technique);
      expect(variantProblem(v, def.technique)).toBeNull();
      expect(variantCost(v)).toBeLessThanOrEqual(VARIANT_RULES.costMax);
    }
  });

  it('早回しで測って、強すぎる変化は作り直す', () => {
    let seed = 5;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const base of ['slash', 'shoot', 'flurry', 'sweep'] as const) {
      expect(variantPowerRatio(rollVariant(random, base))).toBeLessThanOrEqual(VARIANT_RULES.maxPowerRatio);
    }
  }, 30000);

  it('変化つきの技はビルドコードに乗り、決まりの外の変化は読み込めない', () => {
    const build: Build = {
      actives: ['sweep'],
      passives: [],
      equipment: {},
      tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
      variants: { sweep: variant('sweep', 'wetting', 'heavy') },
    };
    const decoded = decodeBuild(encodeBuild(build));
    expect('build' in decoded && decoded.build.variants?.sweep?.variations).toEqual(['wetting', 'heavy']);
    const cheat = { ...build, variants: { sweep: variant('sweep', 'bloodHound', 'echoing') } };
    expect(decodeBuild(encodeBuild(cheat))).toEqual({ error: '技の型:変化が強すぎる' });
    const wrong = { ...build, variants: { sweep: variant('sweep', 'split') } };
    expect(decodeBuild(encodeBuild(wrong))).toEqual({ error: '技の型:その技には付かない変化がある' });
  });

  it('遠征で変化つきの技を見つけ、元の技を覚えていなければ一緒に覚える', () => {
    let found = 0;
    for (let seed = 1; seed <= 8 && found === 0; seed++) {
      const learned = { actives: [...STARTING_SKILLS.actives], passives: [...STARTING_SKILLS.passives] };
      const c = newCharacter('c', '骨拾い', 0, {
        actives: ['slash'],
        passives: [],
        equipment: { weapon1: { id: 'w', name: 'w', kind: 'weapon', affixes: [], weaponType: 'ironSword' } },
        tactics: [{ skill: 'slash', condition: 'always', enabled: true }],
      });
      startExpedition(c, 'drownedChapel', 0, seed);
      const report = finishExpedition(c, learned)!;
      for (const v of report.variants) {
        found++;
        expect(learned.actives).toContain(v.base);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
