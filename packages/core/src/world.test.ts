import { describe, expect, it } from 'vitest';
import { CombatWorld, type UnitSpec } from './world';
import { MAX_TRIGGER_DEPTH } from './constants';
import { summarize, dealtBy } from './breakdown';

const player = (extra: Partial<UnitSpec> = {}): UnitSpec => ({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, ...extra });
const dummy = (id: string, x: number, y = 0): UnitSpec => ({ id, name: '案山子', team: 'enemy', x, y, maxHp: 1e9 });

/** 弾が届くまで進める */
function shoot(world: CombatWorld, skill: 'thunderGun', at: { x: number; y: number }) {
  world.units.get('p')!.cooldowns = {};
  world.useSkill('p', skill, at);
  for (let i = 0; i < 100 && world.projectiles.length > 0; i++) world.update(10);
}

function slash(world: CombatWorld, at: { x: number; y: number }) {
  world.units.get('p')!.cooldowns = {};
  world.useSkill('p', 'rustGreatsword', at);
}

describe('状態の蓄積', () => {
  it('満タンで発動し、持続が切れると終わる', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    slash(w, d); // 35
    slash(w, d); // 70
    expect(w.isActive(d, 'bleed')).toBe(false);
    slash(w, d); // 105
    expect(w.isActive(d, 'bleed')).toBe(true);
    w.update(6001);
    expect(w.isActive(d, 'bleed')).toBe(false);
  });

  it('出血は動くとダメージを受ける', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    w.forceStatus('d', 'bleed', true);
    w.moveUnit('d', 50 + 200, 0);
    expect(w.log.filter((r) => r.targetId === 'd').length).toBe(5);
  });

  it('状態は味方にもかかる(雨で自分も濡れる)', () => {
    const w = new CombatWorld();
    const p = w.addUnit(player());
    w.weather = 'rain';
    for (let i = 0; i < 30; i++) w.update(100);
    expect(w.isActive(p, 'wet')).toBe(true);
  });

  it('油溜まりを踏むと油まみれになる', () => {
    const w = new CombatWorld();
    const p = w.addUnit(player());
    w.addFloor('oilPool', 0, 0, 50);
    for (let i = 0; i < 10; i++) w.update(100);
    expect(w.isActive(p, 'oiled')).toBe(true);
  });
});

describe('状態の相互作用', () => {
  it('濡れていると炎上しない', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    w.forceStatus('d', 'wet', true);
    w.units.get('p')!.imbue = { skill: 'emberOil', until: 1e9 };
    for (let i = 0; i < 10; i++) slash(w, d);
    expect(w.isActive(d, 'burn')).toBe(false);
    expect(d.statuses.burn.buildup).toBe(0);
  });

  it('炎上中に濡れると火が消える', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    w.units.get('p')!.imbue = { skill: 'emberOil', until: 1e9 };
    for (let i = 0; i < 4; i++) slash(w, d);
    expect(w.isActive(d, 'burn')).toBe(true);
    w.forceStatus('d', 'wet', true);
    w.update(10);
    expect(w.isActive(d, 'burn')).toBe(false);
  });

  it('濡れていると感電のダメージが倍になり、発動元に「濡れで倍」が添えられる', () => {
    const run = (wet: boolean) => {
      const w = new CombatWorld();
      w.addUnit(player());
      const d = w.addUnit(dummy('d', 100));
      if (wet) w.forceStatus('d', 'wet', true);
      d.statuses.shock.buildup = 99;
      shoot(w, 'thunderGun', d);
      return w.log.filter((r) => r.source.startsWith('感電'));
    };
    const dry = run(false);
    const wet = run(true);
    expect(dry[0]!.source).toBe('感電');
    expect(wet[0]!.source).toBe('感電(濡れで倍)');
    expect(wet[0]!.amount).toBeCloseTo(dry[0]!.amount * 2);
  });

  it('油まみれだと炎上の時間と範囲が倍', () => {
    const run = (oiled: boolean) => {
      const w = new CombatWorld();
      w.addUnit(player());
      const d = w.addUnit(dummy('d', 50));
      w.addUnit(dummy('near', 150)); // 大剣は届かず、炎上の範囲 70 の外、140 の内
      if (oiled) w.forceStatus('d', 'oiled', true);
      w.units.get('p')!.imbue = { skill: 'emberOil', until: 1e9 };
      for (let i = 0; i < 4; i++) slash(w, d);
      return { w, d, nearHit: w.log.some((r) => r.targetId === 'near') };
    };
    const plain = run(false);
    const oiled = run(true);
    expect(plain.nearHit).toBe(false);
    expect(oiled.nearHit).toBe(true);
    expect(oiled.w.log.find((r) => r.targetId === 'near')!.source).toBe('炎上(油で倍)');
    const remain = (r: typeof plain) => r.d.statuses.burn.activeUntil - r.w.time;
    expect(remain(oiled)).toBeCloseTo(remain(plain) * 2);
  });

  it('感電は近くの敵に連鎖する', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 100));
    w.addUnit(dummy('a', 150));
    w.addUnit(dummy('b', 100, 80));
    w.addUnit(dummy('far', 1000));
    d.statuses.shock.buildup = 99;
    shoot(w, 'thunderGun', d);
    const chained = new Set(w.log.filter((r) => r.source === '感電' && r.targetId !== 'd').map((r) => r.targetId));
    expect(chained).toEqual(new Set(['a', 'b']));
  });
});

describe('トリガー連鎖の上限', () => {
  /** 一列に並んだ濡れた案山子。どれも感電寸前 */
  function cascade(maxTriggerDepth?: number) {
    const w = new CombatWorld({ maxTriggerDepth });
    w.addUnit(player());
    for (let i = 0; i < 12; i++) {
      const u = w.addUnit(dummy(`d${i}`, 100 + i * 150));
      u.statuses.shock.buildup = 99;
    }
    shoot(w, 'thunderGun', { x: 100, y: 0 });
    return w;
  }

  it(`既定では ${MAX_TRIGGER_DEPTH} 段で止まる`, () => {
    const w = cascade();
    const depths = w.log.map((r) => r.depth);
    expect(Math.max(...depths)).toBe(MAX_TRIGGER_DEPTH);
    // 直撃 → 1段目で d1 → 2段目で d2 → 3段目で d3 に連鎖。d4 には届かない
    expect(w.log.some((r) => r.targetId === 'd3')).toBe(true);
    expect(w.log.some((r) => r.targetId === 'd4')).toBe(false);
  });

  it('上限は変更できる', () => {
    const w = cascade(1);
    expect(Math.max(...w.log.map((r) => r.depth))).toBe(1);
    expect(w.log.some((r) => r.targetId === 'd2')).toBe(false);
  });
});

describe('条件文', () => {
  it('1: 炎上状態の敵に攻撃すると、2回攻撃になる', () => {
    const w = new CombatWorld();
    w.addUnit(player({ conditions: ['twinStrikeOnBurning'] }));
    const d = w.addUnit(dummy('d', 50));
    w.forceStatus('d', 'burn', true);
    slash(w, d);
    const swords = w.log.filter((r) => r.skill === '錆びた大剣');
    expect(swords.length).toBe(2);
    expect(swords[1]!.via).toContain('炎への二撃');
    expect(swords[1]!.emphasized).toBe(true);
  });

  it('11: 直前と違う属性で攻撃すると、与ダメージ+80%', () => {
    const w = new CombatWorld();
    w.addUnit(player({ conditions: ['shiftingElement'] }));
    const d = w.addUnit(dummy('d', 100));
    slash(w, d); // 初撃は比べる相手がない
    shoot(w, 'thunderGun', d); // 斬 → 雷
    shoot(w, 'thunderGun', d); // 雷 → 雷
    const [first, second, third] = w.log.filter((r) => r.depth === 0);
    expect(first!.amount).toBeCloseTo(18);
    expect(second!.amount).toBeCloseTo(12 * 1.8);
    expect(second!.via).toContain('移ろう属性');
    expect(third!.amount).toBeCloseTo(12);
  });

  it('51: 雨の間、全ての攻撃が濡れを付与する', () => {
    const w = new CombatWorld();
    w.addUnit(player({ conditions: ['rainSoaked'] }));
    const d = w.addUnit(dummy('d', 50));
    slash(w, d);
    expect(d.statuses.wet.buildup).toBe(0);
    w.weather = 'rain';
    slash(w, d);
    expect(d.statuses.wet.buildup).toBe(50);
  });
});

describe('パッシブ', () => {
  it('煤けた祈り: 雷のダメージ+30%', () => {
    const w = new CombatWorld();
    w.addUnit(player({ passives: ['sootPrayer'] }));
    const d = w.addUnit(dummy('d', 100));
    shoot(w, 'thunderGun', d);
    expect(w.log[0]!.amount).toBeCloseTo(12 * 1.3);
  });

  it('血を呼ぶ雷: 自分が付けた出血が発動すると雷が落ちる', () => {
    const w = new CombatWorld();
    w.addUnit(player({ passives: ['bloodCallsThunder'] }));
    const d = w.addUnit(dummy('d', 50));
    for (let i = 0; i < 3; i++) slash(w, d);
    const bolt = w.log.find((r) => r.source === '血を呼ぶ雷');
    expect(bolt).toBeDefined();
    expect(bolt!.element).toBe('lightning');
    expect(bolt!.skill).toBe('錆びた大剣');
  });
});

describe('完了の目安', () => {
  it('雨の中で雷の遠攻撃を当てると、連鎖して内訳に「感電(濡れで倍)」が出る', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    w.addUnit(dummy('d', 200));
    w.addUnit(dummy('a', 260, 40));
    w.addUnit(dummy('b', 260, -40));
    w.weather = 'rain';
    for (let i = 0; i < 30; i++) w.update(100);
    for (let i = 0; i < 6; i++) shoot(w, 'thunderGun', { x: 200, y: 0 });
    const summary = summarize(dealtBy(w.log, 'p'), w.time);
    const row = summary.bySource.find((r) => r.key === '感電(濡れで倍)');
    expect(row).toBeDefined();
    expect(row!.share).toBeGreaterThan(0);
    expect(w.log.some((r) => r.targetId !== 'd' && r.source === '感電(濡れで倍)')).toBe(true);
  });
});
