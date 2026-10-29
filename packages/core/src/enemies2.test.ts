import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ENEMIES, ENEMY_IDS } from './data/enemies';
import { ACTIVE_SKILLS } from './data/skills';
import { ENCOUNTERS, ENCOUNTER_IDS } from './data/encounters';
import { Encounter } from './encounter';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function arena() {
  const w = new CombatWorld({ seed: 4, bounds: { width: 1600, height: 1000 } });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 800, y: 500, maxHp: 1e9, weapons: [{ type: 'ironSword' }] });
  return { w, p };
}

describe('敵の一覧', () => {
  it('雑魚15種と大物と取り巻き。どれも問うこと(concept)を持ち、一戦に出るか、誰かに呼ばれる', () => {
    expect(ENEMY_IDS.filter((id) => !('boss' in ENEMIES[id]) && !('minion' in ENEMIES[id]))).toHaveLength(15);
    const used = new Set<string>(ENCOUNTER_IDS.flatMap((id) => ENCOUNTERS[id].waves.flatMap((w) => w.spawn.map((s) => s.enemy))));
    const summoned = new Set<string>(
      Object.values(ACTIVE_SKILLS).flatMap((d) => ('action' in d && d.action.type === 'summon' ? [d.action.enemy] : [])),
    );
    for (const id of ENEMY_IDS) {
      expect(ENEMIES[id].concept.length).toBeGreaterThan(0);
      expect('minion' in ENEMIES[id] ? summoned.has(id) : used.has(id)).toBe(true);
    }
  });
});

describe('新しい敵', () => {
  it('屍術師:近くの死体を屍喰いとして起こし、死体は消える。死体がなければ起こさない', () => {
    const { w } = arena();
    const c = w.spawnEnemy('corpseCaller', 'c', 1100, 500);
    c.cooldowns = {};
    run(w, 2000);
    expect(c.minions).toHaveLength(0);
    w.addFloor('corpse', 1050, 520, 28, w.time + 20000);
    c.cooldowns = {};
    run(w, 2500);
    expect(c.minions.length).toBe(1);
    expect(w.units.get(c.minions[0]!)!.kind).toBe('ghoul');
    expect(w.floors.some((f) => f.field === 'corpse')).toBe(false);
  });

  it('巣袋:動かずに屍喰いを産み、上限を超えない', () => {
    const { w } = arena();
    const sac = w.spawnEnemy('broodSac', 's', 1200, 500);
    run(w, 40000);
    expect(sac.x).toBe(1200);
    expect(sac.minions.filter((id) => w.units.has(id)).length).toBeLessThanOrEqual(4);
    expect(sac.minions.length).toBeGreaterThan(0);
  });

  it('棘の亡者:近攻撃を受けると、その一部を返す', () => {
    const { w, p } = arena();
    const h = w.spawnEnemy('thornHusk', 'h', 860, 500);
    w.forceStatus('h', 'stun', true);
    w.useSkill('p', 'slash', h, 'h');
    run(w, 600);
    expect(w.log.some((r) => r.targetId === p.id && r.tags.includes('reflect'))).toBe(true);
  });

  it('影潜み:相手の背後へ移る', () => {
    const { w, p } = arena();
    p.facing = 0;
    const s = w.spawnEnemy('shadowStalker', 's', 1100, 500);
    s.cooldowns = {};
    run(w, 1500);
    expect(w.drainEvents().some((e) => e.type === 'blink' && e.unitId === 's')).toBe(true);
    // 自分は東を向いているので、背後は西
    expect(s.x).toBeLessThan(p.x + 30);
  });

  it('疫病の運び手:傷ついた仲間を癒す。腐っていれば癒しは傷になる', () => {
    const { w } = arena();
    const c = w.spawnEnemy('plagueCarrier', 'c', 1200, 500);
    const k = w.spawnEnemy('rustKnight', 'k', 1250, 520);
    w.forceStatus('k', 'stun', true);
    k.hp = k.maxHp * 0.5;
    c.cooldowns = { miasmaCall: Infinity };
    run(w, 2500);
    expect(k.hp).toBeGreaterThan(k.maxHp * 0.5);
    const healed = k.hp;
    w.forceStatus('k', 'rot', true);
    c.cooldowns = { miasmaCall: Infinity };
    run(w, 2500);
    expect(k.hp).toBeLessThan(healed);
    expect(w.log.some((r) => r.targetId === 'k' && r.tags.includes('rotHeal'))).toBe(true);
  });

  it('宣告者:宣告の矢で死の宣告を溜める', () => {
    const { w, p } = arena();
    const d = w.spawnEnemy('doomHerald', 'd', 1150, 500);
    d.cooldowns = {};
    run(w, 4000);
    expect(p.statuses.doom.buildup > 0 || w.isActive(p, 'doom')).toBe(true);
  });

  it('黙りの修道士:沈黙の輪で静寂を溜める。静寂でも切り札は使える', () => {
    const { w, p } = arena();
    w.spawnEnemy('hushMonk', 'm', 1000, 500).cooldowns = {};
    // 輪の弾が当たった瞬間を見る
    for (let t = 0; t < 10000 && !w.log.some((r) => r.attackerId === 'm' && r.targetId === 'p'); t += 25) w.update(25);
    expect(p.statuses.silence.buildup > 0 || w.isActive(p, 'silence')).toBe(true);
    w.forceStatus('p', 'silence', true);
    expect(w.canUseSkill('p', 'slash')).toBe(false);
    expect(w.canUseSkill('p', 'rainBell')).toBe(true);
  });

  it('血の狂信者:跳びかかって目の前に来る', () => {
    const { w, p } = arena();
    const z = w.spawnEnemy('bloodZealot', 'z', 1150, 500);
    z.cooldowns = {};
    run(w, 1200);
    expect(Math.hypot(z.x - p.x, z.y - p.y)).toBeLessThan(120);
  });

  it('霜の巫女:相手の足元を凍った床にする', () => {
    const { w } = arena();
    w.spawnEnemy('frostWitch', 'f', 1100, 500).cooldowns = {};
    run(w, 2500);
    expect(w.floors.some((f) => f.field === 'iceFloor')).toBe(true);
  });
});

describe('新しい一戦', () => {
  it('霧の墓守りは霧、疫病の行軍は無風で戦う。呼び出された敵も残る敵に数える', () => {
    const { w, p } = arena();
    const e = new Encounter(w, 'fogVigil', p);
    expect(w.weather).toBe('fog');
    e.update();
    const extra = w.spawnEnemy('ghoul', 'extra', 100, 100);
    expect(e.alive()).toContain(extra);
    const w2 = new CombatWorld();
    const p2 = w2.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0 });
    new Encounter(w2, 'plagueMarch', p2);
    expect(w2.weather).toBe('calm');
  });
});

describe('弩の射手', () => {
  it('離れた相手を狙い撃つ。近すぎる相手には狙い撃ちを使わない', () => {
    for (const far of [true, false]) {
      const { w } = arena();
      const s = w.spawnEnemy('boltSniper', 's', far ? 1300 : 900, 500);
      s.cooldowns = {};
      const winds: string[] = [];
      for (let t = 0; t < 3000; t += 25) {
        w.update(25);
        for (const e of w.drainEvents()) if (e.type === 'windup' && e.unitId === 's') winds.push(e.skill);
        // 歩かせず、間合いを保たせる
        w.moveUnit('s', far ? 1300 : 900, 500);
      }
      expect(winds.includes('snipeBolt')).toBe(far);
    }
  });

  it('狙いは振りかぶったときに決まる。動かなければ当たり、横へ外れれば当たらない', () => {
    for (const dodge of [false, true]) {
      const { w, p } = arena();
      const s = w.spawnEnemy('boltSniper', 's', 1300, 500);
      s.cooldowns = { huskClaw: 1e9 };
      let shot = false;
      for (let t = 0; t < 4000; t += 25) {
        w.update(25);
        w.moveUnit('s', 1300, 500);
        for (const e of w.drainEvents()) if (e.type === 'windup' && e.unitId === 's' && e.skill === 'snipeBolt') shot = true;
        // 狙われたら横へ外れる
        if (shot && dodge) w.moveUnit('p', 800, 380);
      }
      expect(shot).toBe(true);
      expect(w.log.some((r) => r.targetId === p.id && r.skill === '狙い撃ちの矢')).toBe(!dodge);
    }
  });
});
