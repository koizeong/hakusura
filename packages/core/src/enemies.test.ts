import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { Encounter } from './encounter';
import { ENCOUNTERS } from './data/encounters';
import { ENEMIES, ENEMY_IDS } from './data/enemies';
import { ACTIVE_SKILLS } from './data/skills';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function arena() {
  const w = new CombatWorld({ seed: 2, bounds: { width: 1600, height: 1000 } });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 800, y: 500, maxHp: 1e9 });
  return { w, p };
}

describe('敵', () => {
  it('敵のスキルは全て定義にあり、敵のタグを持つ', () => {
    for (const id of ENEMY_IDS) {
      for (const skill of ENEMIES[id].skills) expect(ACTIVE_SKILLS[skill].tags).toContain('enemy');
    }
  });

  it('倒れた敵は消え、記録に残る', () => {
    const { w } = arena();
    const g = w.spawnEnemy('ghoul', 'g', 830, 500);
    g.hp = 1;
    w.useSkill('p', 'slash', g, 'g');
    run(w, 600);
    expect(w.units.has('g')).toBe(false);
    expect(w.deaths.map((d) => d.kind)).toEqual(['ghoul']);
    expect(w.drainEvents().some((e) => e.type === 'died' && e.unitId === 'g')).toBe(true);
  });

  it('油袋は倒れると油溜まりを残し、周りを焼く。焼いた分は倒した者の手柄', () => {
    const { w } = arena();
    const bloat = w.spawnEnemy('oilBloat', 'b', 840, 500);
    w.spawnEnemy('ghoul', 'g', 900, 540);
    bloat.hp = 1;
    w.useSkill('p', 'slash', bloat, 'b');
    run(w, 600);
    expect(w.floors.some((f) => f.field === 'oilPool')).toBe(true);
    const burst = w.log.filter((r) => r.source === '油袋の破裂');
    expect(burst.some((r) => r.targetId === 'g' && r.attackerId === 'p')).toBe(true);
  });

  it('屍喰いは寄ってきて、煤吹きは寄られると下がる', () => {
    const { w } = arena();
    w.spawnEnemy('ghoul', 'g', 1200, 500);
    const s = w.spawnEnemy('sootSpitter', 's', 900, 500);
    run(w, 1500);
    expect(w.units.get('g')!.x).toBeLessThan(1150);
    expect(s.x).toBeGreaterThan(950);
  });

  it('鐘守は近くに相手がいると雨を呼ぶ', () => {
    const { w } = arena();
    w.spawnEnemy('bellKeeper', 'k', 1100, 500);
    run(w, 5000);
    expect(w.weather).toBe('rain');
  });

  it('錆鎧は斬に強く雷に弱い', () => {
    expect(ENEMIES.rustKnight.resist.slash).toBeGreaterThan(0);
    expect(ENEMIES.rustKnight.resist.lightning).toBeLessThan(0);
  });
});

describe('一戦', () => {
  it('決まった時刻に群れを呼び、時間まで持ちこたえれば終わる', () => {
    const { w, p } = arena();
    p.maxHp = p.hp = 1e12;
    const e = new Encounter(w, 'ashNight', p);
    e.update();
    expect(e.spawned).toHaveLength(4);
    const def = ENCOUNTERS.ashNight;
    while (!e.result) {
      e.update();
      w.update(250);
    }
    expect(e.result).toBe('survived');
    expect(e.elapsed).toBeGreaterThanOrEqual(def.duration);
    expect(e.wave).toBe(def.waves.length);
    // 呼んだ敵はどれも場の中にいる
    for (const u of e.alive()) {
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(1600);
    }
  });

  it('全ての群れを倒せば、時間の前でも終わる', () => {
    const { w, p } = arena();
    const e = new Encounter(w, 'ashNight', p);
    while (e.wave < ENCOUNTERS.ashNight.waves.length) {
      e.update();
      w.update(1000);
    }
    // 残った敵を片付けたことにする
    for (const u of e.alive()) w.units.delete(u.id);
    e.update();
    expect(e.result).toBe('cleared');
    expect(e.elapsed).toBeLessThan(ENCOUNTERS.ashNight.duration);
  });
});

describe('一戦の前倒し', () => {
  it('場を片付けたら、次の群れは少しの間を置いて来る', () => {
    const { w, p } = arena();
    const e = new Encounter(w, 'ashNight', p);
    e.update();
    for (const u of e.alive()) w.units.delete(u.id);
    e.update();
    expect(e.nextWaveIn).toBeLessThanOrEqual(3000);
    for (let t = 0; t < 3100; t += 100) {
      w.update(100);
      e.update();
    }
    expect(e.wave).toBe(2);
    expect(e.elapsed).toBeLessThan(5000);
  });
});
