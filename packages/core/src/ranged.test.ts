import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { WEAPON_KIND_PACE, WEAPON_TYPES, weaponDef } from './data/weapons';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

describe('遠距離の速射', () => {
  it('遠距離の武器は間隔が短く、1発が軽い。近接は変わらない', () => {
    const bow = weaponDef({ type: 'boneBow' });
    expect(bow.interval).toBeCloseTo(WEAPON_TYPES.boneBow.interval * WEAPON_KIND_PACE.ranged.interval);
    expect(bow.interval).toBeLessThan(1000);
    expect(bow.power).toBeLessThan(WEAPON_TYPES.boneBow.power);
    expect(weaponDef({ type: 'ironSword' }).interval).toBe(WEAPON_TYPES.ironSword.interval);
  });

  it('速射なので、同じ時間に当たる数が多い(当てたときの条件文が多く出る)', () => {
    const shots = (type: 'boneBow' | 'ironSword') => {
      const w = new CombatWorld({ seed: 1 });
      w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type }], autoBattle: true, tactics: [{ skill: type === 'boneBow' ? 'shoot' : 'slash', condition: 'always', enabled: true }] });
      w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
      run(w, 10000);
      return w.log.filter((r) => r.attackerId === 'p' && r.depth === 0).length;
    };
    expect(shots('boneBow')).toBeGreaterThan(shots('ironSword'));
  });
});

describe('杖の魔力の高まり', () => {
  /** 雨の中、雷の杖で濡れた案山子を撃ち続ける(雷雨のコンボが続く) */
  function rainStaff() {
    const w = new CombatWorld({ seed: 3 });
    w.weather = 'rain';
    const p = w.addUnit({
      id: 'p',
      name: '術師',
      team: 'player',
      x: 0,
      y: 0,
      weapons: [{ type: 'staff', element: 'lightning' }],
      autoBattle: true,
      tactics: [
        { skill: 'discharge', condition: 'always', enabled: true },
        { skill: 'burstBolt', condition: 'always', enabled: true },
        { skill: 'shoot', condition: 'always', enabled: true },
      ],
    });
    w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 120, y: 0, maxHp: 1e9 });
    w.addUnit({ id: 't2', name: '案山子', team: 'enemy', x: 130, y: 60, maxHp: 1e9 });
    return { w, p };
  }

  it('コンボが続くほど溜まり、術のヒットが重くなる', () => {
    const { w, p } = rainStaff();
    run(w, 12000);
    expect(w.comboStacksOf(p)).toBeGreaterThan(3);
    const boosted = w.log.filter((r) => r.attackerId === 'p' && r.via.includes('魔力の高まり'));
    expect(boosted.length).toBeGreaterThan(0);
  });

  it('コンボが途切れると消える。上限を超えない', () => {
    const { w, p } = rainStaff();
    run(w, 30000);
    const g = w.comboGrowthOf(p)!;
    expect(w.comboStacksOf(p)).toBeLessThanOrEqual(g.max);
    p.autoBattle = false;
    run(w, g.window + 500);
    expect(w.comboStacksOf(p)).toBe(0);
  });

  it('杖を持たなければ溜まらない', () => {
    const w = new CombatWorld({ seed: 3 });
    w.weather = 'rain';
    // 連用の疲れで1つの技だけでは間が延びるので、2つの技を回す
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type: 'capGun' }], autoBattle: true, tactics: [{ skill: 'quickShot', condition: 'always', enabled: true }, { skill: 'shoot', condition: 'always', enabled: true }] });
    w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 120, y: 0, maxHp: 1e9 });
    w.addUnit({ id: 't2', name: '案山子', team: 'enemy', x: 130, y: 60, maxHp: 1e9 });
    run(w, 12000);
    expect(w.log.some((r) => r.attackerId === 'p' && r.combos.length > 0)).toBe(true);
    expect(w.comboStacksOf(p)).toBe(0);
  });
});

describe('狙いの締まり(弓・銃・投石紐)', () => {
  function bowman() {
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '射手', team: 'player', x: 0, y: 0, weapons: [{ type: 'boneBow' }], autoBattle: true, tactics: [{ skill: 'shoot', condition: 'always', enabled: true }] });
    w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 150, y: 0, maxHp: 1e9 });
    return { w, p };
  }

  it('同じ相手に当て続けるほど重くなり、上限で止まる', () => {
    const { w, p } = bowman();
    run(w, 20000);
    const hits = w.log.filter((r) => r.attackerId === 'p' && r.depth === 0);
    expect(hits.at(-1)!.amount).toBeGreaterThan(hits[0]!.amount * 1.3);
    expect(w.focusStacksOf(p)).toBe(w.focusGrowthOf(p)!.max);
  });

  it('別の相手に当てるか、間が空くと数え直す', () => {
    const { w, p } = bowman();
    run(w, 5000);
    expect(w.focusStacksOf(p)).toBeGreaterThan(2);
    p.autoBattle = false;
    run(w, w.focusGrowthOf(p)!.window + 200);
    expect(w.focusStacksOf(p)).toBe(0);
  });
});

describe('速射のビルドの拾い物', () => {
  it('遠距離の武器が中心なら、当てる数で伸びる条件文が出やすい', async () => {
    const { lootFit } = await import('./build');
    const { generateItem } = await import('./data/equipment');
    const { conditionDef } = await import('./data/conditions');
    const bowBuild = { actives: ['shoot'], passives: [], tactics: [], equipment: { weapon1: { id: 'b', name: '弓', kind: 'weapon', weaponType: 'boneBow', affixes: [] } } } as never;
    const fit = lootFit(bowBuild);
    expect(fit.rapid).toBe(true);
    const w = new CombatWorld({ seed: 5 });
    const handmade = Array.from({ length: 400 }, () => generateItem(() => w.random(), { fit, conditionChance: 1 }))
      .flatMap((i) => (i.condition && !conditionDef(i.condition).link ? [conditionDef(i.condition)] : []));
    expect(handmade.filter((c) => c.rapid).length / handmade.length).toBeGreaterThan(0.5);
  });
});

describe('灰の雛', () => {
  it('飛竜は咆哮で雛を3体呼ぶ', () => {
    const w = new CombatWorld({ seed: 2, bounds: { width: 1600, height: 1000 } });
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 800, y: 500, maxHp: 1e9 });
    const b = w.spawnEnemy('wyvern', 'b', 1000, 500);
    b.cooldowns = { fireRain: 1e9, emberVolley: 1e9, wyvernTakeOff: 1e9, flameBreath: 1e9, tailSweep: 1e9, wyvernBite: 1e9 };
    run(w, 3000);
    expect(b.minions.filter((id) => w.units.get(id)?.kind === 'ashWhelp').length).toBe(3);
  });
});
