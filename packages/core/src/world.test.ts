import { describe, expect, it } from 'vitest';
import { CombatWorld, type UnitSpec } from './world';
import { DEFENSE, MAX_TRIGGER_DEPTH, WEAPON_HITS } from './constants';
import { ACTIVE_SKILLS, resolveSkill, type ActiveSkillId } from './data/skills';
import { STATUSES } from './data/statuses';
import { summarize, dealtBy } from './breakdown';
import { SWORD, GUN, hitPw, pw, TEST_WEAPONS } from './testkit';

const player = (extra: Partial<UnitSpec> = {}): UnitSpec => ({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1e9, weapons: TEST_WEAPONS, ...extra });
const dummy = (id: string, x: number, y = 0, extra: Partial<UnitSpec> = {}): UnitSpec => ({
  id,
  name: '案山子',
  team: 'enemy',
  x,
  y,
  maxHp: 1e9,
  ...extra,
});

/** 1ヒットの威力(武器の技は手数で分けて当てる) */
const power = (id: ActiveSkillId) => {
  const r = id === 'slash' ? SWORD : id === 'shoot' ? GUN : resolveSkill(id)!;
  return r.weapon ? hitPw(r) : pw(r);
};

/** 振りかぶりと弾の飛翔が済むまで進める */
function use(w: CombatWorld, skill: ActiveSkillId, at: { x: number; y: number }, targetId?: string, unitId = 'p') {
  const u = w.units.get(unitId)!;
  u.cooldowns = {};
  u.busyUntil = 0;
  expect(w.useSkill(unitId, skill, at, targetId)).toBe(true);
  for (let i = 0; i < 300 && (u.windupUntil > w.time || w.projectiles.length > 0); i++) w.update(10);
}

const slash = (w: CombatWorld, at: { x: number; y: number }) => use(w, 'slash', at);
const shoot = (w: CombatWorld, at: { x: number; y: number }) => use(w, 'shoot', at);

describe('振りかぶりと硬直', () => {
  it('振りかぶりの間は当たらず、済むと当たる', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    w.useSkill('p', 'slash', d);
    w.update(SWORD.windup - 10);
    expect(w.log.length).toBe(0);
    w.update(20);
    expect(w.log.filter((r) => r.depth === 0)).toHaveLength(WEAPON_HITS.split);
  });

  it('硬直中は次のスキルを使えないが、回避で抜けられる', () => {
    const w = new CombatWorld();
    const p = w.addUnit(player());
    w.addUnit(dummy('d', 50));
    w.useSkill('p', 'slash', { x: 50, y: 0 });
    w.update(SWORD.windup - 10);
    expect(w.canDodge('p')).toBe(false); // 振りかぶり中
    w.update(20);
    expect(w.canUseSkill('p', 'shoot')).toBe(false); // 硬直中
    expect(w.dodge('p')).toBe(true);
    expect(w.isBusy(p)).toBe(false);
  });

  it('ターゲット固定なら、効果が出る瞬間に相手へ向き直す', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    w.addUnit(dummy('d', 0, 60));
    use(w, 'slash', { x: -100, y: 0 }, 'd'); // 逆を向いて振っても当たる
    expect(w.log.some((r) => r.targetId === 'd')).toBe(true);
  });
});

describe('状態の蓄積', () => {
  it('満タンで発動し、持続が切れると終わる', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    // 大剣の1ヒットでは満ちず、手数で分けた2ヒット目で満ちる
    expect(SWORD.action.type === 'melee' && SWORD.action.buildup < STATUSES.bleed.max).toBe(true);
    slash(w, d);
    expect(w.isActive(d, 'bleed')).toBe(true);
    w.update(STATUSES.bleed.duration + 1);
    expect(w.isActive(d, 'bleed')).toBe(false);
  });

  it('出血は動くとダメージを受ける', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    w.addUnit(dummy('d', 50));
    w.forceStatus('d', 'bleed', true);
    w.moveUnit('d', 50 + STATUSES.bleed.moveDamage.per * 5, 0);
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
  /** 燠火の塗油をかけた大剣で、炎上するまで斬る */
  function ignite(w: CombatWorld, target: { x: number; y: number }, unitId: string) {
    w.units.get('p')!.imbue = { skill: 'emberOil', until: 1e9 };
    const u = w.units.get(unitId)!;
    for (let i = 0; i < 6 && !w.isActive(u, 'burn'); i++) slash(w, target);
  }

  it('濡れていると炎上しない', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    w.forceStatus('d', 'wet', true);
    ignite(w, d, 'd');
    expect(w.isActive(d, 'burn')).toBe(false);
    expect(d.statuses.burn.buildup).toBe(0);
  });

  it('炎上中に濡れると火が消える', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 50));
    ignite(w, d, 'd');
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
      shoot(w, d);
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
      ignite(w, d, 'd');
      return { w, d, nearHit: w.log.some((r) => r.targetId === 'near') };
    };
    const plain = run(false);
    const oiled = run(true);
    expect(plain.nearHit).toBe(false);
    expect(oiled.nearHit).toBe(true);
    expect(oiled.w.log.find((r) => r.targetId === 'near')!.source).toBe('炎上(油で倍)');
    const remain = (r: typeof plain) => r.d.statuses.burn.activeUntil - r.w.time;
    expect(remain(plain)).toBeCloseTo(STATUSES.burn.duration);
    expect(remain(oiled)).toBeCloseTo(STATUSES.burn.duration * 2);
  });

  it('感電は近くの敵に連鎖する', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    const d = w.addUnit(dummy('d', 100));
    w.addUnit(dummy('a', 150));
    w.addUnit(dummy('b', 100, 80));
    w.addUnit(dummy('far', 1000));
    d.statuses.shock.buildup = 99;
    shoot(w, d);
    const chained = new Set(w.log.filter((r) => r.source === '感電' && r.targetId !== 'd').map((r) => r.targetId));
    expect(chained).toEqual(new Set(['a', 'b']));
  });

  it('昏倒した相手への攻撃は増える', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    w.addUnit(dummy('d', 50));
    w.forceStatus('d', 'stun', true);
    slash(w, { x: 50, y: 0 });
    expect(w.log[0]!.amount).toBeCloseTo(power('slash') * 1.5);
    expect(w.log[0]!.source).toBe('大剣の斬りつけ(昏倒に追撃)');
  });
});

describe('トリガー連鎖の上限', () => {
  /** 一列に並んだ案山子。どれも感電寸前 */
  function cascade(maxTriggerDepth?: number) {
    const w = new CombatWorld({ maxTriggerDepth });
    w.addUnit(player());
    for (let i = 0; i < 12; i++) {
      const u = w.addUnit(dummy(`d${i}`, 100 + i * 150));
      u.statuses.shock.buildup = 99;
    }
    shoot(w, { x: 100, y: 0 });
    return w;
  }

  it(`既定では ${MAX_TRIGGER_DEPTH} 段で止まる`, () => {
    const w = cascade();
    expect(Math.max(...w.log.map((r) => r.depth))).toBe(MAX_TRIGGER_DEPTH);
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
    const swords = w.log.filter((r) => r.source === '大剣の斬りつけ');
    // 手数で分けたヒットのそれぞれに、二撃目が付く
    expect(swords.length).toBe(2 * WEAPON_HITS.split);
    const twins = swords.filter((r) => r.via.includes('炎への二撃'));
    expect(twins).toHaveLength(WEAPON_HITS.split);
    expect(twins[0]!.emphasized).toBe(true);
  });

  it('11: 直前と違う属性で攻撃すると、与ダメージ+80%', () => {
    const w = new CombatWorld();
    w.addUnit(player({ conditions: ['shiftingElement'] }));
    const d = w.addUnit(dummy('d', 100));
    slash(w, d); // 初撃は比べる相手がない
    shoot(w, d); // 斬 → 雷
    shoot(w, d); // 雷 → 雷
    // 手数で分けたヒットのうち、それぞれの手の最初のヒットを見る
    const direct = w.log.filter((r) => r.depth === 0);
    const [first, second, third] = [direct[0], direct[WEAPON_HITS.split], direct[WEAPON_HITS.split * 2]];
    expect(first!.amount).toBeCloseTo(power('slash'));
    expect(second!.amount).toBeCloseTo(power('shoot') * 1.8);
    expect(second!.via).toContain('移ろう属性');
    // 3発目は同じ相手への2発目の射撃なので、1発目のヒットの数だけ狙いの締まりが乗る
    expect(third!.amount).toBeCloseTo(power('shoot') * (1 + 0.03 * WEAPON_HITS.split));
    expect(third!.via).not.toContain('移ろう属性');
  });

  it('51: 雨の間、全ての攻撃が濡れを付与する', () => {
    const w = new CombatWorld();
    w.addUnit(player({ conditions: ['rainSoaked'] }));
    const d = w.addUnit(dummy('d', 50));
    slash(w, d);
    expect(d.statuses.wet.buildup).toBe(0);
    w.weather = 'rain';
    const before = d.statuses.wet.buildup;
    slash(w, d);
    // 雨そのものでも溜まるので、攻撃の分だけ多く溜まっていればよい
    // 手数で分けたヒットごとに溜まり、満ちて濡れたなら溜まりは0に戻る
    expect(d.statuses.wet.buildup - before > 50 || w.isActive(d, 'wet')).toBe(true);
  });
});

describe('パッシブ', () => {
  it('煤けた祈り: 雷のダメージ+30%', () => {
    const w = new CombatWorld();
    w.addUnit(player({ passives: ['sootPrayer'] }));
    const d = w.addUnit(dummy('d', 100));
    shoot(w, d);
    expect(w.log[0]!.amount).toBeCloseTo(power('shoot') * 1.3);
  });

  it('血を呼ぶ雷: 自分が付けた出血が発動すると雷が落ちる', () => {
    const w = new CombatWorld();
    w.addUnit(player({ passives: ['bloodCallsThunder'] }));
    const d = w.addUnit(dummy('d', 50));
    for (let i = 0; i < 3; i++) slash(w, d);
    const bolt = w.log.find((r) => r.source === '血を呼ぶ雷');
    expect(bolt).toBeDefined();
    expect(bolt!.element).toBe('lightning');
    expect(bolt!.skill).toBe('大剣の斬りつけ');
  });
});

describe('回避とガード', () => {
  const swipe = ACTIVE_SKILLS.strawSwipe;

  /** 案山子が自分に向けて振りかぶり、当たる直前に beforeHit を呼ぶ */
  function enemyAttack(beforeHit: (w: CombatWorld) => void, lead: number) {
    const w = new CombatWorld();
    w.addUnit(player());
    w.addUnit(dummy('e', 60));
    w.setFacing('p', 0); // 案山子の方を向く
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    w.update(swipe.windup - lead);
    beforeHit(w);
    w.update(lead + 10);
    const events = w.drainEvents();
    return { w, p: w.units.get('p')!, e: w.units.get('e')!, events, taken: w.log.filter((r) => r.targetId === 'p') };
  }

  it('ジャスト回避すると当たらず、次の攻撃が強くなる(見切り)', () => {
    const { w, p, events, taken } = enemyAttack((w) => w.dodge('p'), DEFENSE.justDodgeWindow - 50);
    expect(taken.length).toBe(0);
    expect(events.some((e) => e.type === 'justDodge')).toBe(true);
    expect(p.buffs.map((b) => b.label)).toContain('見切り');
    slash(w, { x: 60, y: 0 });
    const hit = w.log.find((r) => r.targetId === 'e')!;
    expect(hit.amount).toBeCloseTo(power('slash') * 2);
    expect(hit.via).toContain('見切り');
    // 見切りは1回で消える
    slash(w, { x: 60, y: 0 });
    // 1回の斬りを手数で分けたヒットには全て乗り、次の斬りには乗らない
    const direct = w.log.filter((r) => r.targetId === 'e' && r.depth === 0);
    expect(direct[WEAPON_HITS.split - 1]!.via).toContain('見切り');
    expect(direct[WEAPON_HITS.split]!.amount).toBeCloseTo(power('slash'));
  });

  it('回避で範囲の外へ抜けても、避け始めた位置に当たる攻撃ならジャスト回避', () => {
    const { events } = enemyAttack((w) => {
      w.dodge('p');
      w.moveUnit('p', -300, 0);
    }, DEFENSE.justDodgeWindow - 50);
    expect(events.some((e) => e.type === 'justDodge')).toBe(true);
  });

  it('早すぎる回避は無敵で避けるだけ', () => {
    const { events, taken } = enemyAttack((w) => w.dodge('p'), DEFENSE.justDodgeWindow + 60);
    expect(taken.length).toBe(0);
    expect(events.some((e) => e.type === 'justDodge')).toBe(false);
  });

  it('正面からの攻撃をガードすると軽減する', () => {
    const { taken } = enemyAttack(() => {}, 0);
    const guarded = enemyAttack((w) => w.setGuard('p', true), DEFENSE.justGuardWindow + 100);
    expect(guarded.taken[0]!.amount).toBeCloseTo(taken[0]!.amount * (1 - DEFENSE.guardReduction));
  });

  it('背中は守れない', () => {
    const { taken } = enemyAttack((w) => {
      w.setFacing('p', Math.PI);
      w.setGuard('p', true);
    }, DEFENSE.justGuardWindow + 100);
    expect(taken[0]!.amount).toBeCloseTo(power('strawSwipe'));
  });

  it('ジャストガードすると当たらず、相手が昏倒する(弾き)', () => {
    const { w, e, events, taken } = enemyAttack((w) => w.setGuard('p', true), DEFENSE.justGuardWindow - 60);
    expect(taken.length).toBe(0);
    expect(events.some((ev) => ev.type === 'justGuard')).toBe(true);
    expect(w.isActive(e, 'stun')).toBe(true);
    expect(w.canUseSkill('e', 'strawSwipe')).toBe(false);
  });

  it('ガードの連打はジャストにならない', () => {
    const { events, taken } = enemyAttack((w) => {
      w.setGuard('p', true);
      w.update(30);
      w.setGuard('p', false);
      w.setGuard('p', true);
    }, DEFENSE.justGuardWindow);
    expect(events.some((ev) => ev.type === 'justGuard')).toBe(false);
    expect(taken.length).toBe(1);
  });

  it('昏倒すると振りかぶり中の攻撃が潰れる', () => {
    const { taken, events } = enemyAttack((w) => w.forceStatus('e', 'stun', true), 100);
    expect(taken.length).toBe(0);
    expect(events.some((ev) => ev.type === 'interrupted')).toBe(true);
  });

  it('案山子は近づいた相手に自分から振るう', () => {
    const w = new CombatWorld();
    w.addUnit(player());
    w.addUnit(dummy('e', 80, 0, { ai: 'strawSwipe' }));
    for (let i = 0; i < 150; i++) w.update(10);
    expect(w.log.some((r) => r.targetId === 'p' && r.skill === '藁の薙ぎ')).toBe(true);
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
    for (let i = 0; i < 4; i++) shoot(w, { x: 200, y: 0 });
    const summary = summarize(dealtBy(w.log, 'p'), w.time);
    const row = summary.bySource.find((r) => r.key === '感電(濡れで倍)');
    expect(row).toBeDefined();
    expect(row!.share).toBeGreaterThan(0);
    expect(w.log.some((r) => r.targetId !== 'd' && r.source === '感電(濡れで倍)')).toBe(true);
  });
});
