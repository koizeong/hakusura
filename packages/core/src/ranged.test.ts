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
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type: 'capGun' }], autoBattle: true, tactics: [{ skill: 'shoot', condition: 'always', enabled: true }] });
    w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 120, y: 0, maxHp: 1e9 });
    w.addUnit({ id: 't2', name: '案山子', team: 'enemy', x: 130, y: 60, maxHp: 1e9 });
    run(w, 12000);
    expect(w.log.some((r) => r.attackerId === 'p' && r.combos.length > 0)).toBe(true);
    expect(w.comboStacksOf(p)).toBe(0);
  });
});
