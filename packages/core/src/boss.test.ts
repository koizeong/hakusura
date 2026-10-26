import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ENEMIES } from './data/enemies';
import { ENCOUNTERS } from './data/encounters';
import { Encounter, claimEncounterReward } from './encounter';
import { newCharacter } from './build';
import { STARTING_SKILLS } from './expedition';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function arena() {
  const w = new CombatWorld({ seed: 7, bounds: { width: 1600, height: 1000 } });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 800, y: 500, maxHp: 1e9, weapons: [{ type: 'ironSword' }, { type: 'capGun' }] });
  return { w, p };
}

describe('灰翼の飛竜', () => {
  it('1体で現れる大物。体力が多く図体が大きい', () => {
    const def = ENEMIES.wyvern;
    expect(def.boss).toBe(true);
    const others = Object.values(ENEMIES).filter((e) => !('boss' in e));
    expect(def.maxHp).toBeGreaterThan(10 * Math.max(...others.map((e) => e.maxHp)));
    expect(def.radius).toBeGreaterThan(Math.max(...others.map((e) => e.radius)));
    expect(ENCOUNTERS.ashWyvern.waves).toEqual([{ at: 0, spawn: [{ enemy: 'wyvern', count: 1 }] }]);
  });

  it('飛んでいる間は近攻撃が届かず、弾は当たる。床も踏まない', () => {
    const { w } = arena();
    const b = w.spawnEnemy('wyvern', 'b', 880, 500);
    b.ai!.enabled = false;
    b.airborneUntil = w.time + 10000;
    w.addFloor('oilPool', 880, 500, 120);
    w.useSkill('p', 'slash', b, 'b');
    run(w, 800);
    expect(w.log.filter((r) => r.targetId === 'b')).toHaveLength(0);
    w.useSkill('p', 'shoot', b, 'b');
    run(w, 2500);
    expect(w.log.some((r) => r.targetId === 'b')).toBe(true);
    expect(b.statuses.oiled.buildup).toBe(0);
  });

  it('作戦は、飛んでいる相手に近攻撃を出さず遠攻撃へ回す', () => {
    const { w, p } = arena();
    p.autoBattle = true;
    p.tactics = [
      { skill: 'slash', condition: 'always', enabled: true },
      { skill: 'shoot', condition: 'always', enabled: true },
    ];
    const b = w.spawnEnemy('wyvern', 'b', 880, 500);
    b.ai!.enabled = false;
    b.airborneUntil = w.time + 10000;
    run(w, 3000);
    expect(p.skillUses.slash ?? 0).toBe(0);
    expect(p.skillUses.shoot ?? 0).toBeGreaterThan(0);
  });

  it('飛ぶ時間が切れると、狙った所へ急降下して周りを砕く。離れていれば避けられる', () => {
    for (const away of [false, true]) {
      const { w, p } = arena();
      const b = w.spawnEnemy('wyvern', 'b', 1200, 500);
      b.ai!.enabled = false;
      b.cooldowns = {};
      w.useSkill('b', 'wyvernTakeOff', p);
      run(w, 1100);
      expect(w.isAirborne(b)).toBe(true);
      // 飛ぶ時間を早く切らせる
      b.airborneUntil = w.time + 25;
      run(w, 100);
      // 振りかぶりの間に離れれば、狙った所に降りても当たらない
      if (away) w.moveUnit('p', 300, 500);
      run(w, 1500);
      expect(w.isAirborne(b)).toBe(false);
      expect(Math.hypot(b.x - 800, b.y - 500)).toBeLessThan(5);
      const hit = w.log.some((r) => r.targetId === 'p' && r.skill === '急降下');
      expect(hit).toBe(!away);
    }
  });

  it('深手を負うと逆鱗に触れ、技の間隔が縮む', () => {
    const { w, p } = arena();
    const b = w.spawnEnemy('wyvern', 'b', 900, 500);
    b.cooldowns = {};
    w.useSkill('b', 'wyvernBite', p);
    const calm = b.cooldownSpans.wyvernBite!;
    run(w, 2000);
    b.hp = b.maxHp * 0.2;
    run(w, 50);
    expect(b.enraged).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'enraged')).toBe(true);
    b.cooldowns = {};
    b.busyUntil = 0;
    w.useSkill('b', 'wyvernBite', p);
    expect(b.cooldownSpans.wyvernBite!).toBeCloseTo(calm * ENEMIES.wyvern.enrage.cooldown);
  });

  it('動きを止める状態は溜まりにくい(大物の踏ん張り)', () => {
    const { w } = arena();
    const b = w.spawnEnemy('wyvern', 'b', 900, 500);
    const g = w.spawnEnemy('ghoul', 'g', 900, 600);
    w.applyBuildup('b', 'stun', 50);
    w.applyBuildup('g', 'stun', 50);
    expect(b.statuses.stun.buildup).toBeCloseTo(g.statuses.stun.buildup * ENEMIES.wyvern.poise);
    // 動きを止めない状態は普通に溜まる
    w.applyBuildup('b', 'bleed', 30);
    expect(b.statuses.bleed.buildup).toBeCloseTo(30);
  });
});

describe('灰翼の巣', () => {
  it('飛竜を討てば討ち尽くし、多くを持ち帰る。時間切れなら僅か', () => {
    const results: Record<string, number> = {};
    for (const kill of [true, false]) {
      const { w, p } = arena();
      const e = new Encounter(w, 'ashWyvern', p);
      e.update();
      const boss = e.boss()!;
      expect(boss.kind).toBe('wyvern');
      if (kill) {
        w.units.delete(boss.id);
        w.deaths.push({ unitId: boss.id, kind: 'wyvern', team: 'enemy', time: w.time });
      } else {
        boss.ai!.enabled = false;
        run(w, 1000);
        (w as unknown as { time: number }).time += ENCOUNTERS.ashWyvern.duration;
      }
      e.update();
      expect(e.result).toBe(kill ? 'cleared' : 'survived');
      const c = newCharacter('c', '巡礼者', 0, { actives: [], passives: [], equipment: {}, tactics: [] });
      const learned = { actives: [...STARTING_SKILLS.actives], passives: [...STARTING_SKILLS.passives], forms: [...(STARTING_SKILLS.forms ?? [])] };
      const spoils = claimEncounterReward(e, c, learned, () => w.random())!;
      results[kill ? 'kill' : 'fled'] = spoils.items.length;
      if (kill) {
        expect(spoils.items).toHaveLength(ENCOUNTERS.ashWyvern.reward.items);
        expect(spoils.variants).toHaveLength(1);
        expect(c.level).toBeGreaterThan(1);
      } else {
        expect(spoils.share).toBe(ENCOUNTERS.ashWyvern.reward.partial);
        expect(spoils.variants).toHaveLength(0);
      }
    }
    expect(results.kill!).toBeGreaterThan(results.fled!);
  });

  it('群れの一戦は持ち帰りがない', () => {
    const { w, p } = arena();
    const e = new Encounter(w, 'ashNight', p);
    (w as unknown as { time: number }).time += ENCOUNTERS.ashNight.duration;
    e.update();
    const c = newCharacter('c', '巡礼者', 0, { actives: [], passives: [], equipment: {}, tactics: [] });
    expect(claimEncounterReward(e, c, { actives: [], passives: [] }, () => 0.5)).toBeUndefined();
  });
});
