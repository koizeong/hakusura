import { WEAPON_HITS } from './constants';
import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { resolveSkill } from './data/skills';
import { WEAPON_TYPES, weaponName, type WeaponTypeId, WEAPON_KIND_POWER } from './data/weapons';
import { generateItem, itemWeapon } from './data/equipment';
import { applyBuild, buildWeapons, unusableActives, type Build } from './build';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

function armed(weapons: WeaponTypeId[]) {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons });
  w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 70, y: 0, maxHp: 1e9 });
  return { w, p };
}

describe('武器と技', () => {
  it('技の数値は、武器の数値に倍率を掛けたもの', () => {
    const sweep = resolveSkill('sweep', 'ironSword')!;
    const sword = WEAPON_TYPES.ironSword;
    expect(sweep.name).toBe('鉄の剣の薙ぎ払い');
    expect(sweep.element).toBe('slash');
    expect(sweep.cooldown).toBeCloseTo(sword.interval * 1.3);
    expect(sweep.action).toMatchObject({ type: 'melee', arc: 180, range: sword.range, power: sword.power * WEAPON_KIND_POWER.melee * 0.9 });
    expect(sweep.category).toBe('melee');
  });

  it('技は条件に合う武器がなければ使えない', () => {
    expect(resolveSkill('sweep', 'capGun')).toBeUndefined();
    expect(resolveSkill('shoot', 'ironSword')).toBeUndefined();
    expect(resolveSkill('discharge', 'stormSpear')).toBeDefined();
    expect(resolveSkill('discharge', 'ironSword')).toBeUndefined();
    expect(resolveSkill('gouge', 'cinderAxe')).toBeUndefined();
    const { w, p } = armed(['capGun']);
    expect(w.canUseSkill('p', 'sweep')).toBe(false);
    expect(w.canUseSkill('p', 'shoot')).toBe(true);
    void p;
  });

  it('近接と遠距離を1つずつ持てば、技ごとに合う方で出る', () => {
    const { w, p } = armed(['ironSword', 'capGun']);
    expect(w.skillFor(p, 'slash')!.weapon).toBe('ironSword');
    expect(w.skillFor(p, 'shoot')!.weapon).toBe('capGun');
  });

  it('二刀流で両手とも合うなら、左右交互に出る', () => {
    const { w, p } = armed(['ironSword', 'cinderAxe']);
    const used: string[] = [];
    for (let i = 0; i < 4; i++) {
      p.cooldowns = {};
      p.busyUntil = 0;
      used.push(w.skillFor(p, 'slash')!.weapon!);
      w.useSkill('p', 'slash', { x: 70, y: 0 });
      run(w, 600);
    }
    expect(used).toEqual(['ironSword', 'cinderAxe', 'ironSword', 'cinderAxe']);
    expect(w.log.filter((r) => r.depth === 0).map((r) => r.element)).toEqual(['slash', 'fire', 'slash', 'fire'].flatMap((e) => Array(WEAPON_HITS.split).fill(e)));
  });

  it('武器がなければ素手で出る', () => {
    const { w, p } = armed([]);
    expect(w.skillFor(p, 'slash')!.weapon).toBe('fists');
    expect(w.canUseSkill('p', 'shoot')).toBe(false);
  });

  it('三連射は3発を扇に撃つ', () => {
    const { w } = armed(['boneBow']);
    w.moveUnit('e', 500, 0);
    w.useSkill('p', 'volley', { x: 500, y: 0 });
    run(w, WEAPON_TYPES.boneBow.windup + 10);
    expect(w.projectiles.length).toBe(3);
  });
});

describe('武器の装備', () => {
  const build = (weapons: WeaponTypeId[], actives: Build['actives']): Build => ({
    actives,
    passives: [],
    equipment: Object.fromEntries(weapons.map((t, i) => [i === 0 ? 'weapon1' : 'weapon2', { id: `w${i}`, name: t, kind: 'weapon', affixes: [], weaponType: t }])),
    tactics: [],
  });

  it('拾った武器は形・属性・性質を持ち、名前はそれを並べたもの', () => {
    const random = (() => {
      let n = 0;
      return () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    })();
    const item = generateItem(random, { kind: 'weapon', slot: 'weapon1', weaponType: 'stormSpear' });
    expect(item.weaponType).toBe('stormSpear');
    expect(item.name).toBe(weaponName(itemWeapon(item)!));
    expect(item.name.endsWith(WEAPON_TYPES.stormSpear.name)).toBe(true);
  });

  it('ビルドに着けた武器を戦う者が持つ', () => {
    const w = new CombatWorld();
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0 });
    applyBuild(w, p, build(['stormSpear', 'boneBow'], []));
    expect(p.weapons.map((w) => w.type)).toEqual(['stormSpear', 'boneBow']);
  });

  it('今の武器では使えない技を知らせる', () => {
    expect(buildWeapons(build([], []))).toEqual([{ type: 'fists' }]);
    expect(unusableActives(build(['ironSword'], ['slash', 'shoot', 'discharge']))).toEqual(['shoot', 'discharge']);
    expect(unusableActives(build(['stormSpear', 'capGun'], ['slash', 'shoot', 'discharge']))).toEqual([]);
  });
});

describe('弓の大技', () => {
  it('骨矢の驟雨は弓でしか使えず、5本を一度に放つ', () => {
    expect(resolveSkill('boneVolley', 'boneBow')).toBeDefined();
    expect(resolveSkill('boneVolley', 'capGun')).toBeUndefined();
    const r = resolveSkill('boneVolley', 'boneBow')!;
    expect(r.action.type === 'projectile' && r.action.count).toBe(5);
  });
});
