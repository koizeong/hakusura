import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ENEMIES } from './data/enemies';
import { ENCOUNTERS } from './data/encounters';
import { LEVEL_RULES, levelCooldown } from './data/levels';
import { Encounter, advanceEncounterLevel, claimEncounterReward, encounterLevel } from './encounter';
import { newCharacter } from './build';
import { STARTING_SKILLS } from './expedition';
import type { EncounterId } from './data/encounters';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function arena() {
  const w = new CombatWorld({ seed: 7, bounds: { width: 1600, height: 1000 } });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 800, y: 500, maxHp: 1e9, weapons: [{ type: 'ironSword' }] });
  return { w, p };
}

/** 屍喰いに噛ませて、最初の一噛みの与ダメージ */
function biteAt(level: number): number {
  const { w } = arena();
  w.spawnEnemy('ghoul', 'g', 830, 500, 'enemy', level);
  run(w, 4000);
  return w.log.find((r) => r.targetId === 'p')!.amount;
}

describe('敵のレベル', () => {
  it('レベルが上がるほど体力・与ダメージが増え、技の間隔が縮む', () => {
    const { w } = arena();
    const g1 = w.spawnEnemy('ghoul', 'a', 0, 0);
    const g3 = w.spawnEnemy('ghoul', 'b', 0, 0, 'enemy', 3);
    expect(g1.level).toBe(1);
    expect(g3.maxHp).toBe(Math.round(ENEMIES.ghoul.maxHp * LEVEL_RULES.hp ** 2));
    expect(biteAt(3) / biteAt(1)).toBeCloseTo(LEVEL_RULES.damage ** 2, 1);
    expect(w.statOf(g3, 'cooldown')).toBeCloseTo(levelCooldown(3), 5);
    expect(levelCooldown(99)).toBe(LEVEL_RULES.cooldownFloor);
  });

  it('飛竜はレベルで新しい技を得る。呼んだ雛も飛竜のレベルを受け継ぐ', () => {
    const { w } = arena();
    expect(w.spawnEnemy('wyvern', 'a', 0, 0).ai!.skills).not.toContain('groundEmbers');
    expect(w.spawnEnemy('wyvern', 'b', 0, 0, 'enemy', 3).ai!.skills).toContain('groundEmbers');
    const b5 = w.spawnEnemy('wyvern', 'c', 900, 500, 'enemy', 5);
    expect(b5.ai!.skills).toEqual(expect.arrayContaining(['groundEmbers', 'ashStorm']));
    w.units.delete('a');
    w.units.delete('b');
    run(w, 16000);
    const whelps = [...w.units.values()].filter((u) => u.kind === 'ashWhelp');
    expect(whelps.length).toBeGreaterThan(0);
    for (const u of whelps) expect(u.level).toBe(5);
    expect(w.drainEvents().some((e) => e.type === 'windup' && e.skill === 'groundEmbers')).toBe(true);
  });

  it('一戦は選んだレベルで敵を呼ぶ', () => {
    const { w, p } = arena();
    const e = new Encounter(w, 'ashNight', p, 4);
    e.update();
    const ghouls = e.alive();
    expect(ghouls.length).toBeGreaterThan(0);
    for (const u of ghouls) expect(u.level).toBe(4);
  });
});

describe('一戦のレベル', () => {
  const finish = (level: number, kill: boolean) => {
    const { w, p } = arena();
    const e = new Encounter(w, 'ashWyvern', p, level);
    e.update();
    const boss = e.boss()!;
    if (kill) {
      w.units.delete(boss.id);
      w.deaths.push({ unitId: boss.id, kind: 'wyvern', team: 'enemy', time: w.time });
    } else {
      boss.ai!.enabled = false;
      (w as unknown as { time: number }).time += ENCOUNTERS.ashWyvern.duration;
    }
    e.update();
    return { w, e };
  };

  it('討ち果たせば次のレベルが開く。時間切れや、開いたより下のレベルでは上がらない', () => {
    const levels: Partial<Record<EncounterId, number>> = {};
    expect(encounterLevel(levels, 'ashWyvern')).toBe(1);
    expect(advanceEncounterLevel(levels, finish(1, false).e)).toBe(false);
    expect(advanceEncounterLevel(levels, finish(1, true).e)).toBe(true);
    expect(encounterLevel(levels, 'ashWyvern')).toBe(2);
    expect(advanceEncounterLevel(levels, finish(1, true).e)).toBe(false);
    expect(encounterLevel(levels, 'ashWyvern')).toBe(2);
    expect(advanceEncounterLevel(levels, finish(2, true).e)).toBe(true);
    expect(encounterLevel(levels, 'ashWyvern')).toBe(3);
  });

  it('レベルが高いほど多く持ち帰る', () => {
    const spoils = (level: number) => {
      const { w, e } = finish(level, true);
      const c = newCharacter('c', '巡礼者', 0, { actives: [], passives: [], equipment: {}, tactics: [] });
      const learned = { actives: [...STARTING_SKILLS.actives], passives: [...STARTING_SKILLS.passives], forms: [...(STARTING_SKILLS.forms ?? [])] };
      return claimEncounterReward(e, c, learned, () => w.random())!;
    };
    const low = spoils(1);
    const high = spoils(4);
    expect(high.exp).toBeCloseTo(low.exp * LEVEL_RULES.reward ** 3, -1);
    expect(high.items.length).toBeGreaterThan(low.items.length);
  });
});
