import { describe, expect, it } from 'vitest';
import { CombatWorld, type Unit } from './world';
import { TACTIC_CONDITIONS, type Tactic } from './data/tactics';
import { FERVOR, FORMS } from './data/forms';
import { evaluatePredicate } from './rules';
import { decodeBuild, encodeBuild, newCharacter, type Build } from './build';
import { STARTING_SKILLS, finishExpedition, learnedForms, startExpedition } from './expedition';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

function duel(tactics: Tactic[] = [], weapons: Unit['weapons'] = [{ type: 'ironSword' }, { type: 'capGun' }]) {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons, tactics, autoBattle: true });
  const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  return { w, p, e };
}

/** 条件が今の相手に合うか */
function holds(w: CombatWorld, p: Unit, e: Unit, id: string): boolean {
  const ctx = (w as unknown as { context(t: Unit, a: Unit, x: object): Parameters<typeof evaluatePredicate>[1] }).context(e, p, {});
  return TACTIC_CONDITIONS[id]!.when.every((pr) => evaluatePredicate(pr, ctx));
}

describe('作戦の条件(溜まり具合・直前の手・床・天候)', () => {
  it('状態・天候・床・スキルから条件が作られる', () => {
    for (const id of ['targetNear:shock', 'targetNot:oiled', 'self:wrath', 'weather:fog', 'targetFloor:puddle', 'selfFloor:iceFloor', 'last:shoot']) {
      expect(TACTIC_CONDITIONS[id]).toBeDefined();
    }
    expect(TACTIC_CONDITIONS['targetNear:dying']).toBeUndefined();
  });

  it('溜まり具合:7割以上溜まっていて、まだ発動していないとき', () => {
    const { w, p, e } = duel();
    e.statuses.shock.buildup = 50;
    expect(holds(w, p, e, 'targetNear:shock')).toBe(false);
    e.statuses.shock.buildup = 75;
    expect(holds(w, p, e, 'targetNear:shock')).toBe(true);
    w.forceStatus('e', 'shock', true);
    expect(holds(w, p, e, 'targetNear:shock')).toBe(false);
  });

  it('直前の手と、自分の足元の床', () => {
    const { w, p, e } = duel();
    w.useSkill('p', 'shoot', e, 'e');
    expect(holds(w, p, e, 'last:shoot')).toBe(true);
    expect(holds(w, p, e, 'last:slash')).toBe(false);
    expect(holds(w, p, e, 'selfFloor:puddle')).toBe(false);
    w.addFloor('puddle', 0, 0, 50);
    expect(holds(w, p, e, 'selfFloor:puddle')).toBe(true);
  });
});

describe('連携と型', () => {
  it('連携:1行のスキルを出したら、次の一手を優先して出す', () => {
    const { w, p } = duel([
      { skill: 'shoot', condition: 'always', enabled: true, then: ['slash'] },
      { skill: 'shoot', condition: 'always', enabled: true },
    ]);
    run(w, 3000);
    const order = w.drainEvents().flatMap((e) => (e.type === 'windup' && e.unitId === p.id ? [e.skill] : []));
    expect(order.slice(0, 2)).toEqual(['shoot', 'slash']);
  });

  it('型:撃ってから斬り込むと「撃ち込みの型」が決まり、最後の一手が強くなる', () => {
    const plain = duel([{ skill: 'slash', condition: 'always', enabled: true }]);
    run(plain.w, 700);
    const base = plain.w.log.find((r) => r.depth === 0)!.amount;
    const { w } = duel([{ skill: 'shoot', condition: 'always', enabled: true, then: ['slash'] }]);
    run(w, 3000);
    const cut = w.log.find((r) => r.via.includes(FORMS.shootAndCut.name))!;
    expect(cut).toBeDefined();
    expect(cut.amount).toBeCloseTo(base * (1 + FORMS.shootAndCut.bonus));
    expect(cut.combos).toContain('form:shootAndCut');
  });

  it('知らない型は決まらない。覚えれば決まる', () => {
    const tactics: Tactic[] = [{ skill: 'shoot', condition: 'always', enabled: true, then: ['slash'] }];
    const weapons = [{ type: 'ironSword' as const, element: 'blunt' as const }, { type: 'capGun' as const, element: 'ice' as const }];
    const unknown = duel(tactics, weapons);
    run(unknown.w, 3000);
    expect(unknown.w.log.some((r) => r.via.includes(FORMS.frostBreak.name))).toBe(false);
    const known = duel(tactics, weapons);
    known.p.forms = ['frostBreak'];
    run(known.w, 3000);
    expect(known.w.log.some((r) => r.via.includes(FORMS.frostBreak.name))).toBe(true);
  });

  it('間が空きすぎると型は決まらない', () => {
    const { w, p, e } = duel();
    w.useSkill('p', 'shoot', e, 'e');
    run(w, FORMS.shootAndCut.window + 500);
    p.cooldowns = {};
    w.useSkill('p', 'slash', e, 'e');
    run(w, 700);
    expect(w.log.some((r) => r.via.includes(FORMS.shootAndCut.name))).toBe(false);
  });

  it('連携はビルドコードに乗る', () => {
    const build: Build = { actives: ['shoot', 'slash'], passives: [], equipment: {}, tactics: [{ skill: 'shoot', condition: 'targetNear:shock', enabled: true, then: ['slash'] }] };
    const decoded = decodeBuild(encodeBuild(build));
    expect('build' in decoded && decoded.build.tactics[0]!.then).toEqual(['slash']);
    const bad = { ...build, tactics: [{ ...build.tactics[0]!, then: ['slash', 'slash', 'slash'] }] } as Build;
    expect(decodeBuild(encodeBuild(bad))).toEqual({ error: '作戦の連携が壊れている' });
  });
});

describe('昂り', () => {
  it('コンボで溜まり、同じコンボが続くほど溜まりにくい', () => {
    const { w, p } = duel();
    const gain = (combo: string) => {
      const before = p.fervor;
      (w as unknown as { onCombo(u: Unit, c: string[]): void }).onCombo(p, [combo]);
      return p.fervor - before;
    };
    const first = gain('thunderRain');
    const second = gain('thunderRain');
    const other = gain('oilFire');
    expect(first).toBeCloseTo(FERVOR.perCombo);
    expect(second).toBeLessThan(first);
    expect(other).toBeCloseTo(FERVOR.perCombo);
  });

  it('満ちると切り札が早く戻り、続く数撃が強くなる', () => {
    const { w, p } = duel();
    p.trump = 'rainBell';
    p.cooldowns.rainBell = w.time + 30000;
    p.fervor = FERVOR.max - 1;
    (w as unknown as { gainFervor(u: Unit, n: number): void }).gainFervor(p, 5);
    expect(p.fervor).toBe(0);
    expect(p.cooldowns.rainBell).toBeCloseTo(w.time + 30000 - FERVOR.trumpCut);
    expect(p.buffs.some((b) => b.label === FERVOR.buff.label && b.charges === FERVOR.buff.charges)).toBe(true);
  });

  it('型が決まると大きく溜まる', () => {
    const { w, p } = duel([{ skill: 'shoot', condition: 'always', enabled: true, then: ['slash'] }]);
    run(w, 1500);
    expect(p.fervor).toBeGreaterThanOrEqual(FORMS.shootAndCut.fervor);
  });
});

describe('型の書', () => {
  it('遠征で型の書を見つけて覚える', () => {
    let found = 0;
    for (let seed = 1; seed <= 10 && found === 0; seed++) {
      const learned = { actives: [...STARTING_SKILLS.actives], passives: [...STARTING_SKILLS.passives] };
      const c = newCharacter('c', '骨拾い', 0, {
        actives: ['slash'],
        passives: [],
        equipment: { weapon1: { id: 'w', name: 'w', kind: 'weapon', affixes: [], weaponType: 'ironSword' } },
        tactics: [{ skill: 'slash', condition: 'always', enabled: true }],
      });
      startExpedition(c, 'drownedChapel', 0, seed);
      const report = finishExpedition(c, learned)!;
      for (const f of report.forms) {
        found++;
        expect(learnedForms(learned)).toContain(f);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
