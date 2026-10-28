import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { RITE_TACTICS } from './data/tactics';
import { STATS } from './data/stats';
import type { ActiveSkillId } from './data/skills';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function duel() {
  const w = new CombatWorld({ seed: 4 });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, weapons: [{ type: 'ironSword' }] });
  w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  return { w, p };
}

/** 儀式を順に唱えてから斬り、斬りの与ダメージの合計・ヒット数・属性を返す */
function ritesThenSlash(rites: ActiveSkillId[]) {
  const { w, p } = duel();
  const t = w.units.get('t')!;
  for (const r of rites) {
    p.busyUntil = 0;
    w.useSkill('p', r, t);
    run(w, 1000);
  }
  const before = w.log.length;
  const hpBefore = p.hp;
  p.busyUntil = 0;
  w.useSkill('p', 'slash', t, 't');
  run(w, 800);
  const slash = w.log.slice(before).filter((r) => r.tags.includes('melee') && !r.tags.includes('strike'));
  return { w, p, hpBefore, total: slash.reduce((s, r) => s + r.amount, 0), count: slash.length, elements: [...new Set(slash.map((r) => r.element))], log: w.log.slice(before) };
}

describe('儀式', () => {
  it('黙祷は次の技の与ダメージを+60%する', () => {
    const plain = ritesThenSlash([]);
    const prayed = ritesThenSlash(['stillPrayer']);
    expect(plain.total).toBeGreaterThan(0);
    expect(prayed.total).toBeCloseTo(plain.total * 1.6, 0);
  });

  it('重ねた儀式は別の種類として掛け合わさり、血の誓いは身を削る', () => {
    const plain = ritesThenSlash([]);
    const both = ritesThenSlash(['stillPrayer', 'bloodOath']);
    expect(both.total).toBeCloseTo(plain.total * 1.6 * 2.5, 0);
    expect(both.p.maxHp - both.hpBefore).toBeCloseTo(both.p.maxHp * 0.08, 0);
  });

  it('焚き上げは、宿している儀式の数だけ強くなる', () => {
    const plain = ritesThenSlash([]);
    const offered = ritesThenSlash(['stillPrayer', 'pyreOffering']);
    // 黙祷 +60% と、儀式2つぶんの焚き上げ +100%
    expect(offered.total).toBeCloseTo(plain.total * 1.6 * (1 + 0.5 * 2), 0);
  });

  it('研ぎの儀はヒットを3つ足し、灰の祝詞は技を灰に変える', () => {
    const plain = ritesThenSlash([]);
    expect(ritesThenSlash(['whetRite']).count).toBe(plain.count * 4);
    const ash = ritesThenSlash(['ashLitany']);
    expect(ash.elements).toEqual(['ash']);
    const target = ash.w.units.get('t')!;
    expect(target.statuses.ashen.buildup > 0 || ash.w.isActive(target, 'ashen')).toBe(true);
  });

  it('雷の印は、当たると雷の追撃を落とす', () => {
    const r = ritesThenSlash(['stormSigil']);
    expect(r.log.some((x) => x.element === 'lightning' && x.tags.includes('strike'))).toBe(true);
  });

  it('儀式は次の攻撃の技で使い切る。儀式どうしでは使い切らず、時間が経つと消える', () => {
    const { w, p } = duel();
    const t = w.units.get('t')!;
    w.useSkill('p', 'stillPrayer', t);
    run(w, 600);
    p.busyUntil = 0;
    w.useSkill('p', 'bloodOath', t);
    run(w, 800);
    expect(p.rites).toHaveLength(2);
    p.busyUntil = 0;
    w.useSkill('p', 'slash', t, 't');
    run(w, 800);
    expect(p.rites).toHaveLength(0);
    expect(w.drainEvents().some((e) => e.type === 'riteReleased' && e.names.length === 2)).toBe(true);
    p.cooldowns = {};
    p.busyUntil = 0;
    w.useSkill('p', 'stillPrayer', t);
    run(w, 11000);
    p.busyUntil = 0;
    p.cooldowns = {};
    const before = w.log.length;
    w.useSkill('p', 'slash', t, 't');
    run(w, 800);
    expect(w.log.slice(before).some((r) => r.via.includes('黙祷'))).toBe(false);
  });

  it('儀式の手本の作戦は、儀式を重ねてから大技で使い切る', () => {
    const { w, p } = duel();
    p.autoBattle = true;
    p.tactics = RITE_TACTICS.map((t) => ({ ...t }));
    run(w, 20000);
    const released = w.drainEvents().filter((e) => e.type === 'riteReleased');
    expect(released.length).toBeGreaterThan(0);
    expect(Math.max(...released.map((e) => (e.type === 'riteReleased' ? e.names.length : 0)))).toBeGreaterThanOrEqual(3);
  });

  it('三度の祈りの型:儀式を三つ重ねて斬ると決まる', () => {
    const { w, p } = duel();
    p.forms = ['threefoldPrayer'];
    const t = w.units.get('t')!;
    for (const r of ['stillPrayer', 'whetRite', 'bloodOath', 'slash'] as const) {
      p.busyUntil = 0;
      w.useSkill('p', r, t, 't');
      run(w, 700);
    }
    expect(w.drainEvents().some((e) => e.type === 'form' && e.form === 'threefoldPrayer')).toBe(true);
  });
});

describe('被ダメージの下限', () => {
  it('被ダメージをどれだけ積んでも、7割減より下がらない', () => {
    expect(STATS.damageTaken.min).toBe(0.3);
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000 });
    p.equipment = [
      { id: 'a', name: '鎧', kind: 'armor', slot: 'body', affixes: [{ affix: 'damageTaken', value: -200 }] },
      { id: 'b', name: '兜', kind: 'armor', slot: 'head', affixes: [{ affix: 'damageTaken', value: -200 }] },
    ];
    expect(w.statOf(p, 'damageTaken')).toBe(0.3);
  });
});
