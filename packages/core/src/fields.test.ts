import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { FIELDS, FIELD_IDS, FLOOR_IDS, WEATHER_IDS, type FieldDef } from './data/fields';
import { STATUSES, STATUS_IDS, type StatusDef } from './data/statuses';
import { Encounter } from './encounter';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

function field() {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons: [{ type: 'capGun' }] });
  const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  return { w, p, e };
}

describe('天候と床の一覧', () => {
  it('天候は6種、床は7種', () => {
    expect(WEATHER_IDS).toEqual(['rain', 'sandstorm', 'fog', 'night', 'miasma', 'calm']);
    expect(FLOOR_IDS).toEqual(['oilPool', 'bloodPool', 'puddle', 'ashPile', 'corpse', 'scorch', 'iceFloor']);
  });

  it('床の変わり先と、状態が残す床は、どれも定義にある', () => {
    for (const id of FIELD_IDS) {
      for (const t of (FIELDS[id] as FieldDef).transforms ?? []) expect(FIELD_IDS).toContain(t.into);
    }
    for (const id of STATUS_IDS) {
      const floor = (STATUSES[id] as StatusDef).leavesFloor;
      if (floor) expect(FLOOR_IDS).toContain(floor.field);
    }
  });
});

describe('天候', () => {
  it('砂嵐:盲目が溜まり、足が鈍り、弾が遠くへ届かない', () => {
    const { w, p } = field();
    const reach = w.reachOf(p, 'shoot')!;
    w.weather = 'sandstorm';
    expect(w.reachOf(p, 'shoot')).toBeCloseTo(reach * 0.65);
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(0.9);
    run(w, 3000);
    expect(p.statuses.blind.buildup + (w.isActive(p, 'blind') ? 100 : 0)).toBeGreaterThan(0);
  });

  it('霧:背後からの奇襲が効く', () => {
    const { w, p, e } = field();
    e.facing = 0;
    w.weather = 'fog';
    w.useSkill('p', 'shoot', e, 'e');
    run(w, 800);
    expect(w.log.find((r) => r.depth === 0)!.source).toContain('霧からの奇襲');
  });

  it('夜:闇と呪いが強まる', () => {
    const { w, p } = field();
    w.weather = 'night';
    expect(w.statOf(p, 'damage', ['dark'])).toBeCloseTo(1.4);
    expect(w.statOf(p, 'damage', ['curse'])).toBeCloseTo(1.2);
    expect(w.statOf(p, 'damage', ['fire'])).toBe(1);
  });

  it('瘴気:全員が腐っていき、回復が鈍る', () => {
    const { w, p, e } = field();
    w.weather = 'miasma';
    expect(w.statOf(p, 'healing')).toBeCloseTo(0.7);
    run(w, 10000);
    expect(w.isActive(e, 'rot') || e.statuses.rot.buildup > 0).toBe(true);
  });

  it('無風:炎上が長く燃える', () => {
    const plain = field();
    plain.w.forceStatus('e', 'oiled', false);
    const still = field();
    still.w.weather = 'calm';
    for (const { w, e } of [plain, still]) {
      w.useSkill('p', 'shoot', e, 'e');
      e.statuses.burn.buildup = 99;
      w.units.get('p')!.weapons = [{ type: 'capGun', element: 'fire' }];
      w.units.get('p')!.cooldowns = {};
      w.units.get('p')!.busyUntil = 0;
      w.useSkill('p', 'shoot', e, 'e');
      run(w, 800);
    }
    const left = (w: CombatWorld) => w.units.get('e')!.statuses.burn.activeUntil - w.time;
    expect(left(still.w)).toBeGreaterThan(left(plain.w));
  });

  it('一戦「灰の街道の夜」は夜に戦う', () => {
    const { w, p } = field();
    new Encounter(w, 'ashNight', p);
    expect(w.weather).toBe('night');
  });
});

describe('床', () => {
  it('出血すると足元に血だまりが残り、立つと渇きが溜まる', () => {
    const { w, e } = field();
    e.statuses.bleed.buildup = 99;
    w.units.get('p')!.weapons = [{ type: 'ironSword' }];
    w.useSkill('p', 'slash', e, 'e');
    run(w, 600);
    expect(w.floors.some((f) => f.field === 'bloodPool')).toBe(true);
    run(w, 1500);
    expect(e.statuses.thirst.buildup > 0 || w.isActive(e, 'thirst')).toBe(true);
  });

  it('凍った者が解けると水たまりが残る。水たまりの上で凍ると凍った床になり、燃えると水たまりに戻る', () => {
    const { w, e } = field();
    e.statuses.frozen.activeUntil = w.time + 50;
    run(w, 100);
    const puddle = w.floors.find((f) => f.field === 'puddle')!;
    expect(puddle).toBeDefined();
    e.statuses.frozen.buildup = 99;
    w.units.get('p')!.weapons = [{ type: 'capGun', element: 'ice' }];
    w.useSkill('p', 'shoot', e, 'e');
    run(w, 600);
    expect(puddle.field).toBe('iceFloor');
    expect(w.statOf(e, 'moveSpeed')).toBeCloseTo(1.25);
  });

  it('油溜まりの上で燃えると、燃え跡になる', () => {
    const { w, e } = field();
    const oil = w.addFloor('oilPool', 60, 0, 80);
    e.statuses.burn.buildup = 99;
    w.units.get('p')!.weapons = [{ type: 'capGun', element: 'fire' }];
    w.useSkill('p', 'shoot', e, 'e');
    run(w, 600);
    expect(oil.field).toBe('scorch');
  });

  it('倒れた者は死体を残す。灰になって崩れた者は残らない', () => {
    const { w } = field();
    // 動かないよう、昏倒させておく
    const g = w.spawnEnemy('ghoul', 'g', 0, 300);
    w.forceStatus('g', 'stun', true);
    g.hp = 1;
    w.units.get('p')!.cooldowns = {};
    w.useSkill('p', 'shoot', g, 'g');
    run(w, 800);
    expect(w.floors.filter((f) => f.field === 'corpse')).toHaveLength(1);
    const a = w.spawnEnemy('ghoul', 'a', 0, -300);
    w.forceStatus('a', 'stun', true);
    a.hp = 1;
    a.statuses.ashen.activeUntil = w.time + 5000;
    w.units.get('p')!.cooldowns = {};
    w.units.get('p')!.busyUntil = 0;
    w.useSkill('p', 'shoot', a, 'a');
    run(w, 800);
    expect(w.units.has('a')).toBe(false);
    expect(w.floors.filter((f) => f.field === 'corpse')).toHaveLength(1);
  });

  it('状態が残した床で溜まったものは、その状態をかけた者の手柄になる', () => {
    const { w, e } = field();
    e.statuses.burn.buildup = 99;
    w.units.get('p')!.weapons = [{ type: 'capGun', element: 'fire' }];
    w.useSkill('p', 'shoot', e, 'e');
    run(w, 6000);
    const scorch = w.floors.find((f) => f.field === 'scorch');
    expect(scorch?.ownerId).toBe('p');
  });

  it('消える床は増えすぎると古い順に消える', () => {
    const w = new CombatWorld();
    for (let i = 0; i < 80; i++) w.addFloor('bloodPool', i, 0, 10, 1e9);
    expect(w.floors).toHaveLength(60);
    expect(w.floors[0]!.x).toBe(20);
  });
});
