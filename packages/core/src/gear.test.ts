import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { applyBuild, decodeBuild, encodeBuild, type Build } from './build';
import { resolveSkill, activeSkillDef, isTechnique, techniqueFits } from './data/skills';
import { WEAPON_TYPES, rollWeapon, weaponDef, weaponName } from './data/weapons';
import { SHIELD_TYPES } from './data/shields';
import { generateItem, type Item } from './data/equipment';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

function seeded(seed = 1) {
  let n = seed;
  return () => ((n = (n * 16807) % 2147483647) - 1) / 2147483646;
}

const shieldItem = (shieldType: Item['shieldType'], element?: Item['element']): Item => ({ id: 's', name: '盾', kind: 'weapon', affixes: [], shieldType, element });
const weaponItem = (weaponType: Item['weaponType'], element?: Item['element']): Item => ({ id: 'w', name: '武器', kind: 'weapon', affixes: [], weaponType, element });

function withGear(items: Item[], extra: Partial<Build> = {}) {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9 });
  const slots = ['weapon1', 'weapon2'] as const;
  applyBuild(w, p, { actives: [], passives: [], tactics: [], equipment: Object.fromEntries(items.map((it, i) => [slots[i], it])), ...extra });
  p.attributes = undefined;
  return { w, p };
}

describe('武器の形・属性・性質', () => {
  it('属性を変えると、名前と属性と必要な能力値が変わる', () => {
    const spear = weaponDef({ type: 'stormSpear', element: 'fire' });
    expect(spear.element).toBe('fire');
    expect(spear.name).toBe('熾火の槍');
    expect(spear.needs).toMatchObject({ dex: 14, fai: 10 });
    expect(weaponName({ type: 'ironSword' })).toBe('鉄の剣');
    expect(weaponName({ type: 'stormSpear' })).toBe('雷の槍');
  });

  it('性質は数値を傾け、名前の頭に付く', () => {
    const heavy = weaponDef({ type: 'ironSword', tempers: ['heavy'] });
    expect(heavy.name).toBe('重い鉄の剣');
    expect(heavy.power).toBeCloseTo(WEAPON_TYPES.ironSword.power * 1.2);
    expect(heavy.needs).toMatchObject({ str: 14 });
    const rusted = weaponDef({ type: 'rustGreatsword', tempers: ['rusted'] });
    expect(rusted.needs).toMatchObject({ str: Math.round(18 * 0.6) });
  });

  it('属性を変えた武器で出す技は、その属性で当たる', () => {
    const r = resolveSkill('slash', { type: 'ironSword', element: 'lightning' })!;
    expect(r.element).toBe('lightning');
    expect(r.name).toBe('雷の鉄の剣の斬りつけ');
  });

  it('雷の技は、雷にした武器でも出せる', () => {
    const def = activeSkillDef('discharge');
    if (!isTechnique(def)) throw new Error();
    expect(techniqueFits(def, { type: 'ironSword', element: 'lightning' })).toBe(true);
    expect(techniqueFits(def, { type: 'ironSword' })).toBe(false);
  });

  it('拾う武器の属性と性質はばらつく', () => {
    const random = seeded(3);
    const names = new Set(Array.from({ length: 40 }, () => weaponName(rollWeapon(random, 'ironSword'))));
    expect(names.size).toBeGreaterThan(8);
  });
});

describe('杖', () => {
  it('杖の技は杖でしか出ない', () => {
    expect(resolveSkill('burstBolt', 'staff')).toBeDefined();
    expect(resolveSkill('burstBolt', 'capGun')).toBeUndefined();
    expect(resolveSkill('prayerTorrent', 'staff')!.action.type).toBe('nova');
  });

  it('魔弾は当たると弾け、周りの相手にも当たる', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons: ['staff'] });
    w.addUnit({ id: 'a', name: '案山子', team: 'enemy', x: 200, y: 0, maxHp: 1e9 });
    w.addUnit({ id: 'b', name: '案山子', team: 'enemy', x: 240, y: 30, maxHp: 1e9 });
    w.useSkill('p', 'shoot', { x: 200, y: 0 }, 'a');
    run(w, 1500);
    const direct = w.log.filter((r) => r.depth === 0);
    expect(new Set(direct.map((r) => r.targetId))).toEqual(new Set(['a', 'b']));
    const a = direct.find((r) => r.targetId === 'a')!.amount;
    const b = direct.find((r) => r.targetId === 'b')!.amount;
    expect(b).toBeCloseTo(a * 0.35);
  });
});

describe('盾', () => {
  it('盾を持つと持ち方が「片手と盾」になる', () => {
    const { p } = withGear([weaponItem('ironSword'), shieldItem('woodShield')]);
    expect(p.grip).toBe('swordAndShield');
    expect(p.weapons.map((w) => w.type)).toEqual(['ironSword']);
    expect(p.shields).toHaveLength(1);
  });

  it('直撃を1回だけ防ぎ、時間で張り直す', () => {
    const { w, p } = withGear([shieldItem('woodShield')]);
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    expect(w.log.filter((r) => r.targetId === 'p')).toHaveLength(0);
    expect(p.shields[0]!.ready).toBe(false);
    const e = w.units.get('e')!;
    e.cooldowns = {};
    e.busyUntil = 0;
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    expect(w.log.filter((r) => r.targetId === 'p')).toHaveLength(1);
    run(w, SHIELD_TYPES.woodShield.recharge);
    expect(p.shields[0]!.ready).toBe(true);
  });

  it('祈りの小盾は弾しか防がない', () => {
    const { w, p } = withGear([shieldItem('prayerBuckler')]);
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    expect(w.log.filter((r) => r.targetId === 'p')).toHaveLength(1);
    expect(p.shields[0]!.ready).toBe(true);
  });

  it('属性つきの盾は、砕けるとその属性で周りに弾ける', () => {
    const { w, p } = withGear([shieldItem('woodShield', 'lightning')]);
    w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    const burst = w.log.filter((r) => r.attackerId === 'p' && r.targetId === 'e');
    expect(burst.length).toBeGreaterThan(0);
    expect(burst[0]!.element).toBe('lightning');
  });

  it('盾が張られている間だけ効く条件文と、砕けたときのパッシブ', () => {
    const { w, p } = withGear([shieldItem('woodShield')], { passives: ['shatterRage'] });
    p.conditions = ['behindShield'];
    const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
    w.useSkill('p', 'slash', e);
    run(w, 800);
    const shielded = w.log.find((r) => r.attackerId === 'p')!;
    expect(shielded.via).toContain('盾の陰');
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    expect(p.buffs.some((b) => b.label === '砕けた盾の怒り')).toBe(true);
  });
});

describe('拾い物', () => {
  it('武器の枠には、ときどき盾が出る。防具は素材を持つ', () => {
    const random = seeded(7);
    const weapons = Array.from({ length: 60 }, () => generateItem(random, { kind: 'weapon', slot: 'weapon1' }));
    expect(weapons.some((i) => i.shieldType)).toBe(true);
    expect(weapons.some((i) => i.weaponType)).toBe(true);
    const armor = generateItem(random, { kind: 'armor', slot: 'body' });
    expect(armor.material).toBeDefined();
  });

  it('属性・性質・盾はビルドコードに乗り、知らない性質は読み込めない', () => {
    const build: Build = {
      actives: [],
      passives: [],
      tactics: [],
      equipment: {
        weapon1: { id: 'w', name: '重い雷の槍', kind: 'weapon', affixes: [], weaponType: 'stormSpear', element: 'lightning', tempers: ['heavy'] },
        weapon2: shieldItem('towerShield', 'fire'),
      },
    };
    const decoded = decodeBuild(encodeBuild(build));
    expect('build' in decoded && decoded.build.equipment.weapon1?.tempers).toEqual(['heavy']);
    const bad = { ...build, equipment: { weapon1: { ...build.equipment.weapon1!, tempers: ['cursed'] } } } as unknown as Build;
    expect(decodeBuild(encodeBuild(bad))).toEqual({ error: '知らない性質がある' });
  });
});
