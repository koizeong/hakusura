import { WEAPON_HITS } from './constants';
import { describe, expect, it } from 'vitest';
import { CombatWorld, type Unit } from './world';
import { applyBuild, buildWeight, weightCapacity, type Build } from './build';
import { ELEMENT_IDS } from './data/elements';
import { STATUSES, STATUS_IDS, statusForElement } from './data/statuses';
import type { Item } from './data/equipment';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

function field() {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons: [{ type: 'ironSword' }] });
  const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  return { w, p, e };
}

/** p から e へ1回斬る。クールダウンは待たない */
function strike(w: CombatWorld, p: Unit, e: Unit, weapon = p.weapons[0]!) {
  p.weapons = [weapon];
  p.cooldowns = {};
  p.busyUntil = 0;
  w.useSkill(p.id, 'slash', e, e.id);
  run(w, 700);
}

const lastDirect = (w: CombatWorld) => [...w.log].reverse().find((r) => r.depth === 0)!;

describe('属性と状態の一覧', () => {
  it('属性は11種、状態は23種。属性はそれぞれ1つの状態を持つ', () => {
    expect(ELEMENT_IDS).toHaveLength(11);
    expect(STATUS_IDS).toHaveLength(23);
    for (const e of ELEMENT_IDS) expect(statusForElement(e)).toBeDefined();
    expect(STATUS_IDS.filter((s) => !(STATUSES[s] as { element?: string }).element)).toHaveLength(12);
  });

  it('打は昏倒、刺は露出、氷は凍結を溜める', () => {
    expect(statusForElement('blunt')).toBe('stun');
    expect(statusForElement('pierce')).toBe('exposed');
    expect(statusForElement('ice')).toBe('frozen');
  });
});

describe('属性の状態', () => {
  it('露出:被ダメージが増える', () => {
    const { w, p, e } = field();
    strike(w, p, e);
    const before = lastDirect(w).amount;
    w.forceStatus('e', 'exposed', true);
    strike(w, p, e);
    expect(lastDirect(w).amount).toBeCloseTo(before * 1.3);
  });

  it('凍結:動けず、打で叩くと砕けて大きく効き、凍結は解ける', () => {
    const { w, p, e } = field();
    strike(w, p, e, { type: 'ironSword', element: 'blunt' });
    const plain = lastDirect(w).amount;
    w.units.get('e')!.statuses.frozen.activeUntil = w.time + 5000;
    expect(w.isIncapacitated(e)).toBe(true);
    strike(w, p, e, { type: 'ironSword', element: 'blunt' });
    const shattered = w.log.find((r) => r.source.includes('砕氷'))!;
    expect(shattered.amount).toBeGreaterThan(plain * 2);
    expect(shattered.combos).toContain('shatter');
    expect(w.isActive(e, 'frozen')).toBe(false);
  });

  it('呪縛:受けたダメージの一部を溜め、切れたときにまとめて受ける', () => {
    const { w, p, e } = field();
    e.statuses.bind.activeUntil = w.time + 1500;
    strike(w, p, e);
    const dealt = w.log.filter((r) => r.targetId === 'e').reduce((s, r) => s + r.amount, 0);
    run(w, 1200);
    const release = w.log.find((r) => r.tags.includes('bindRelease'))!;
    expect(release.amount).toBeCloseTo(dealt * STATUSES.bind.storesDamage, 0);
  });

  it('盲目:攻撃がときどき外れ、背後からの攻撃は急所に入る', () => {
    const { w, p, e } = field();
    // 案山子は東を向いているので、西に立つ自分は背後にいる
    e.facing = 0;
    strike(w, p, e);
    const before = lastDirect(w).amount;
    w.forceStatus('e', 'blind', true);
    strike(w, p, e);
    const back = lastDirect(w);
    expect(back.source).toContain('背後の一撃');
    expect(back.combos).toContain('backstab');
    expect(back.amount).toBeCloseTo(before * 2);
    // 盲目の者の攻撃は外れることがある
    w.forceStatus('e', 'blind', false);
    w.forceStatus('p', 'blind', true);
    let misses = 0;
    for (let i = 0; i < 40; i++) {
      const before = w.log.length;
      strike(w, p, e);
      if (w.log.length === before) misses++;
    }
    expect(misses).toBeGreaterThan(5);
  });

  it('灰化:溜まるほど足が鈍り、満タンで崩れる', () => {
    const { w, e } = field();
    e.statuses.ashen.buildup = 50;
    expect(w.statOf(e, 'moveSpeed')).toBeCloseTo(0.75);
  });

  it('腐敗:回復がダメージになる', () => {
    const { w, p } = field();
    p.hp = 1000;
    p.maxHp = 2000;
    w.heal(p, 100);
    expect(p.hp).toBe(1100);
    w.forceStatus('p', 'rot', true);
    w.heal(p, 100);
    w.update(10);
    expect(p.hp).toBeLessThan(1100);
    expect(w.log.some((r) => r.tags.includes('rotHeal'))).toBe(true);
  });

  it('渇き:血の攻撃は自分に渇きを溜める。渇くと強くなるがHPを払い、出血した相手から吸う', () => {
    const { w, p, e } = field();
    for (let i = 0; i < 6; i++) strike(w, p, e, { type: 'ironSword', element: 'blood' });
    expect(w.isActive(p, 'thirst')).toBe(true);
    expect(w.isActive(e, 'thirst')).toBe(false);
    p.maxHp = 1000;
    p.hp = 500;
    w.forceStatus('e', 'bleed', true);
    strike(w, p, e, { type: 'ironSword', element: 'blood' });
    // 払った分(最大HPの2%)より、吸った分が多い
    expect(p.hp).toBeGreaterThan(500 - 20 * WEAPON_HITS.split);
  });
});

describe('属性を持たない状態', () => {
  it('瀕死と無傷は、本人の様子で決まる', () => {
    const { w, p, e } = field();
    expect(w.isActive(p, 'unhurt')).toBe(true);
    expect(w.isActive(p, 'dying')).toBe(false);
    p.hp = p.maxHp * 0.2;
    expect(w.isActive(p, 'dying')).toBe(true);
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    expect(w.isActive(p, 'unhurt')).toBe(false);
  });

  it('静寂と恐怖の間は、アクティブスキルを使えない', () => {
    const { w } = field();
    expect(w.canUseSkill('p', 'slash')).toBe(true);
    w.forceStatus('p', 'silence', true);
    expect(w.canUseSkill('p', 'slash')).toBe(false);
    w.forceStatus('p', 'silence', false);
    w.forceStatus('p', 'fear', true);
    expect(w.canUseSkill('p', 'slash')).toBe(false);
  });

  it('恐怖の敵は背を向けて逃げる', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9 });
    const g = w.spawnEnemy('ghoul', 'g', 200, 0);
    w.forceStatus('g', 'fear', true);
    run(w, 1000);
    expect(g.x).toBeGreaterThan(250);
  });

  it('狂気:火力が上がり、仲間にも当たる', () => {
    const w = new CombatWorld();
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons: [{ type: 'ironSword' }] });
    w.addUnit({ id: 'ally', name: '仲間', team: 'player', x: 60, y: 0, maxHp: 1e9 });
    w.forceStatus('p', 'madness', true);
    w.useSkill('p', 'slash', { x: 60, y: 0 });
    run(w, 700);
    expect(w.log.some((r) => r.targetId === 'ally')).toBe(true);
    expect(w.statOf(p, 'damage', ['weapon'])).toBeCloseTo(1.8);
  });

  it('加護:次の直撃を1回だけ無効にして消える', () => {
    const { w, p } = field();
    w.useSkill('p', 'blessedPrayer', p);
    run(w, 900);
    expect(w.isActive(p, 'blessing')).toBe(true);
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1700);
    expect(w.log.filter((r) => r.targetId === 'p')).toHaveLength(0);
    expect(w.isActive(p, 'blessing')).toBe(false);
  });

  it('憤怒:被弾するたびに溜まり、満ちると与ダメージが上がる', () => {
    const { w, p, e } = field();
    for (let i = 0; i < 8; i++) {
      e.cooldowns = {};
      e.busyUntil = 0;
      w.useSkill('e', 'strawSwipe', p);
      run(w, 1700);
    }
    expect(w.isActive(p, 'wrath')).toBe(true);
    expect(w.statOf(p, 'damage')).toBeCloseTo(1.5);
  });

  it('死の宣告:切れると倒れる。宣告のまま倒されると、周りの仲間に呪縛を撒く', () => {
    const w = new CombatWorld();
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9 });
    const a = w.spawnEnemy('ghoul', 'a', 400, 0);
    a.statuses.doom.activeUntil = w.time + 100;
    run(w, 200);
    expect(w.units.has('a')).toBe(false);
    const b = w.spawnEnemy('rustKnight', 'b', 400, 0);
    const c = w.spawnEnemy('ghoul', 'c', 450, 0);
    b.statuses.doom.activeUntil = w.time + 5000;
    b.hp = 1;
    w.useSkill('p', 'shoot', b, 'b');
    w.units.get('p')!.weapons = [{ type: 'capGun' }];
    w.units.get('p')!.cooldowns = {};
    w.useSkill('p', 'shoot', b, 'b');
    run(w, 1000);
    expect(w.units.has('b')).toBe(false);
    expect(w.isActive(c, 'bind')).toBe(true);
  });

  it('飢え:戦っている間に溜まり、満ちると回復が半分になる', () => {
    const { w, p } = field();
    w.forceStatus('p', 'hunger', true);
    expect(w.statOf(p, 'healing')).toBeCloseTo(0.5);
  });

  it('鈍重:重さが担える重さを超えると足が遅くなり、打が強くなる', () => {
    const heavy = (id: string, type: Item['weaponType']): Item => ({ id, name: id, kind: 'weapon', affixes: [], weaponType: type });
    const build: Build = {
      actives: [],
      passives: [],
      tactics: [],
      equipment: {
        weapon1: heavy('a', 'warHammer'),
        weapon2: { id: 's', name: '大盾', kind: 'weapon', affixes: [], shieldType: 'towerShield' },
      },
      attributes: { str: 8, dex: 8, int: 8, fai: 8, vit: 8 },
    };
    expect(buildWeight(build)).toBeGreaterThan(weightCapacity(build.attributes!));
    const { w, p } = field();
    applyBuild(w, p, build);
    expect(w.isActive(p, 'sluggish')).toBe(true);
    p.attributes = undefined;
    expect(w.statOf(p, 'damage', ['blunt'])).toBeCloseTo(1.3);
  });
});
