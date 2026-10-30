import { describe, expect, it } from 'vitest';
import { CombatWorld, type UnitSpec } from './world';
import { CONDITIONS, LINK_CONDITION_IDS, conditionDef, type ConditionId } from './data/conditions';
import { AFFIX_IDS, EQUIP_RULES, affixFits, generateItem, itemTotal, type Item } from './data/equipment';
import { LINK_RULES } from './data/links';
import { lootFit, type Build } from './build';
import { DEFAULT_TACTICS } from './data/tactics';
import { baseAttributes } from './data/attributes';
import { compareItem, loadoutScore, measureLoadout, recommendNow } from './loadout';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

/** 剣(斬の近攻撃)と雷の短銃(雷の遠攻撃)を持ち、条件文を1つ着けた者と、硬い案山子 */
function duel(condition?: ConditionId) {
  const w = new CombatWorld({ seed: 2 });
  const p = w.addUnit({
    id: 'p',
    name: '巡礼者',
    team: 'player',
    x: 0,
    y: 0,
    weapons: [{ type: 'ironSword' }, { type: 'capGun', element: 'lightning' }],
    conditions: condition ? [condition] : [],
  });
  w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  return { w, p };
}

/** 撃ってから斬ったときの、斬りの与ダメージの合計とヒット数 */
function shootThenSlash(condition: ConditionId | undefined, wait = 0) {
  const { w } = duel(condition);
  const t = w.units.get('t')!;
  w.useSkill('p', 'shoot', t, 't');
  run(w, 1500 + wait);
  const before = w.log.length;
  w.units.get('p')!.busyUntil = 0;
  w.useSkill('p', 'slash', t, 't');
  run(w, 800);
  const slash = w.log.slice(before).filter((r) => r.tags.includes('melee'));
  return { total: slash.reduce((s, r) => s + r.amount, 0), count: slash.length, labels: slash.flatMap((r) => r.via) };
}

describe('繋ぎの条件文', () => {
  it('属性と種類の組み合わせから作られ、データに1件足せば増える', () => {
    expect(LINK_CONDITION_IDS.length).toBeGreaterThan(200);
    expect(conditionDef('link:lightning>melee:mult').text).toBe('近攻撃でない雷の攻撃の次に、雷でない近攻撃を当てると、与ダメージ4倍');
    expect(conditionDef('link:melee>ranged:mult').text).toBe('近攻撃を出した次に遠攻撃を当てると、与ダメージ2倍');
    expect(conditionDef('link:fire>ice:hits').text).toContain('3回多く当たる');
    // 厳しい繋ぎほど見返りが大きい
    expect(conditionDef('link:melee>ranged:mult').cost).toBeLessThan(conditionDef('link:fire>ice:mult').cost);
    expect(conditionDef('link:fire>ice:mult').cost).toBeLessThan(conditionDef('link:melee>slash:mult').cost);
  });

  it('雷の遠攻撃の次に斬の近攻撃を当てると、与ダメージが4倍になる', () => {
    const plain = shootThenSlash(undefined);
    const linked = shootThenSlash('link:lightning>melee:mult');
    expect(plain.total).toBeGreaterThan(0);
    expect(linked.total).toBeCloseTo(plain.total * 4, 0);
    expect(linked.labels).toContain('繋ぎ・雷→近攻撃');
  });

  it('種類と属性をまたぐ繋ぎは、一辺倒では決まらない(斬の近攻撃を続けても「近攻撃→斬」は決まらない)', () => {
    const { w, p } = duel('link:melee>slash:mult');
    const t = w.units.get('t')!;
    w.useSkill('p', 'slash', t, 't');
    run(w, 1200);
    const before = w.log.length;
    p.busyUntil = 0;
    p.cooldowns = {};
    w.useSkill('p', 'slash', t, 't');
    run(w, 800);
    expect(w.log.slice(before).some((r) => r.via.includes('繋ぎ・近攻撃→斬'))).toBe(false);
  });

  it('違う繋ぎが同時に決まっても足し算(4倍と2倍で5倍。8倍にはしない)', () => {
    const plain = shootThenSlash(undefined);
    const { w, p } = duel('link:lightning>melee:mult');
    p.conditions.push('link:ranged>melee:mult');
    const t = w.units.get('t')!;
    w.useSkill('p', 'shoot', t, 't');
    run(w, 1500);
    const before = w.log.length;
    p.busyUntil = 0;
    w.useSkill('p', 'slash', t, 't');
    run(w, 800);
    const slash = w.log.slice(before).filter((r) => r.tags.includes('melee'));
    expect(slash[0]!.via).toEqual(expect.arrayContaining(['繋ぎ・雷→近攻撃', '繋ぎ・遠攻撃→近攻撃']));
    expect(slash.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(plain.total * (1 + 3 + 1), 0);
  });

  it('前の手から間が空くと繋がらない', () => {
    const plain = shootThenSlash(undefined, LINK_RULES.window);
    const late = shootThenSlash('link:lightning>melee:mult', LINK_RULES.window);
    expect(late.total).toBeCloseTo(plain.total, 0);
  });

  it('ヒットが増える繋ぎは、威力半分のヒットを足す', () => {
    const plain = shootThenSlash(undefined);
    const linked = shootThenSlash('link:lightning>melee:hits');
    expect(plain.count).toBeGreaterThan(0);
    expect(linked.count).toBe(plain.count * (1 + 4));
    expect(linked.total).toBeCloseTo(plain.total * (1 + 4 * LINK_RULES.extraHitPower), 0);
    expect(conditionDef('link:lightning>melee:hits').link?.strictness).toBe(2);
  });

  it('前の手は使った瞬間に決まる。飛んでいる弾は、後から別の手を使っても繋ぎを保つ', () => {
    const { w } = duel('link:melee>lightning:mult');
    const t = w.units.get('t')!;
    t.x = 600;
    w.useSkill('p', 'slash', t, 't');
    run(w, 900);
    w.useSkill('p', 'shoot', t, 't');
    // 弾が飛んでいる間に、もう一度斬る(当たらない所で振る)
    run(w, 700);
    w.units.get('p')!.busyUntil = 0;
    w.useSkill('p', 'slash', t, 't');
    run(w, 2000);
    expect(w.log.some((r) => r.tags.includes('ranged') && r.via.includes('繋ぎ・近攻撃→雷'))).toBe(true);
  });
});

const starter: Build = {
  attributes: { ...baseAttributes(), str: 14, dex: 14, int: 16, fai: 12 },
  actives: ['slash', 'shoot', 'emberOil'],
  passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
  equipment: {
    weapon1: { id: 's', name: '鉄の剣', kind: 'weapon', weaponType: 'ironSword', affixes: [] },
    weapon2: { id: 'g', name: '雷の短銃', kind: 'weapon', weaponType: 'capGun', affixes: [] },
  },
  trump: 'rainBell',
  tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
};

describe('拾い物の出方', () => {
  const items = (n: number, fit?: ReturnType<typeof lootFit>) => {
    const w = new CombatWorld({ seed: 9 });
    return Array.from({ length: n }, () => generateItem(() => w.random(), fit ? { fit } : {}));
  };

  it('たいていは得の向きに出る。合計がマイナスのものは忌まわしき品で、重い条件文が付く', () => {
    const list = items(400);
    const negative = list.filter((i) => itemTotal(i) < 0);
    expect(negative.length / list.length).toBeLessThan(EQUIP_RULES.cursedChance * 1.6);
    for (const i of negative) {
      expect(i.cursed).toBe(true);
      expect(i.name.startsWith('忌まわしき')).toBe(true);
      expect(conditionDef(i.condition!).cost).toBeGreaterThanOrEqual(EQUIP_RULES.cursedConditionCost);
    }
    for (const i of list) {
      expect(itemTotal(i)).toBeGreaterThanOrEqual(EQUIP_RULES.totalMin);
      expect(itemTotal(i)).toBeLessThanOrEqual(EQUIP_RULES.totalMax);
      for (const a of i.affixes) expect(Math.abs(a.value)).toBeLessThanOrEqual(EQUIP_RULES.affixMax);
    }
  });

  it('ビルドを渡すと、補正値と繋ぎがビルドに寄る', () => {
    const fit = lootFit(starter);
    expect(fit.elements).toEqual(expect.arrayContaining(['slash', 'lightning', 'fire']));
    expect(fit.categories).toEqual(expect.arrayContaining(['melee', 'ranged', 'imbue']));
    const share = (list: Item[]) => {
      const affixes = list.flatMap((i) => i.affixes.slice(1).map((a) => a.affix));
      return affixes.filter((a) => affixFits(a, fit)).length / affixes.length;
    };
    const baseline = AFFIX_IDS.filter((a) => affixFits(a, fit)).length / AFFIX_IDS.length;
    expect(share(items(300, fit))).toBeGreaterThan(baseline + 0.25);
    const links = items(400, fit).flatMap((i) => (i.condition && CONDITIONS[i.condition]?.link ? [CONDITIONS[i.condition]!.link!] : []));
    const has = (s: { element: string } | { category: string }) =>
      'element' in s ? (fit.elements as readonly string[]).includes(s.element) : fit.categories.includes(s.category);
    expect(links.filter((l) => has(l.prev) && has(l.now)).length / links.length).toBeGreaterThan(0.5);
  });
});

describe('装備の見比べ', () => {
  const ring = (affixes: Item['affixes']): Item => ({ id: `r${JSON.stringify(affixes)}`, name: '指輪', kind: 'accessory', affixes });

  it('火力の上がる物は良く、下がるだけの物は悪いと分かる', () => {
    const good = compareItem(starter, ring([{ affix: 'damage', value: 80 }]))!;
    expect(good.verdict).toBe('better');
    expect(good.power).toBeGreaterThan(1.5);
    const bad = compareItem(starter, ring([{ affix: 'damage', value: -80 }]))!;
    expect(bad.verdict).toBe('worse');
    const tough = compareItem(starter, ring([{ affix: 'maxHp', value: 100 }]))!;
    expect(tough.toughness).toBeCloseTo(2, 1);
    expect(tough.verdict).toBe('better');
  });

  it('おすすめは、拾い物の山から点の高い組み合わせを選ぶ', () => {
    const stash = [ring([{ affix: 'damage', value: -50 }]), ring([{ affix: 'damage', value: 60 }]), ring([{ affix: 'cooldown', value: -40 }])];
    const best = recommendNow(starter, stash);
    expect(loadoutScore(measureLoadout(best))).toBeGreaterThan(loadoutScore(measureLoadout(starter)));
    const worn = Object.values(best.equipment).map((i) => i!.id);
    expect(worn).toContain(stash[1]!.id);
    expect(worn).not.toContain(stash[0]!.id);
  }, 30000);
});

describe('共通の項目の損', () => {
  it('共通の項目を損の向きに振った分は、合計に半分しか数えない', () => {
    const item: Item = { id: 'x', name: '帷子', kind: 'armor', slot: 'body', affixes: [{ affix: 'moveSpeed', value: -200 }, { affix: 'damage', value: 200 }] };
    expect(itemTotal(item)).toBe(200 - 200 * EQUIP_RULES.commonPenaltyWeight);
  });
});

describe('遠攻撃の条件文', () => {
  const shots = (condition: ConditionId | undefined, x: number, stand = true) => {
    const w = new CombatWorld({ seed: 3 });
    const p = w.addUnit({ id: 'p', name: '射手', team: 'player', x: 0, y: 0, weapons: [{ type: 'boneBow' }], conditions: condition ? [condition] : [] });
    w.addUnit({ id: 't', name: '案山子', team: 'enemy', x, y: 0, maxHp: 1e9 });
    for (let i = 0; i < 14; i++) {
      p.cooldowns = {};
      p.busyUntil = 0;
      if (!stand) w.moveUnit('p', p.x, p.y + (i % 2 ? 1 : -1));
      w.useSkill('p', 'shoot', w.units.get('t')!, 't');
      run(w, 300);
    }
    run(w, 2000);
    return w.log.filter((r) => r.tags.includes('ranged')).reduce((s, r) => s + r.amount, 0);
  };

  it('締め撃ち:同じ相手に当て続けて狙いの締まりが10を超えると、遠攻撃が3倍', () => {
    expect(shots('focusedVolley', 200) / shots(undefined, 200)).toBeGreaterThan(1.5);
  });

  it('遠間の狩人:離れた相手にだけ効く', () => {
    expect(shots('farHunter', 400) / shots(undefined, 400)).toBeCloseTo(2.5, 1);
    expect(shots('farHunter', 120) / shots(undefined, 120)).toBeCloseTo(1, 1);
  });

  it('据え撃ち:足を止めて撃つと強く、歩きながらでは効かない', () => {
    expect(shots('plantedAim', 200) / shots(undefined, 200)).toBeGreaterThan(2);
    expect(shots('plantedAim', 200, false) / shots(undefined, 200, false)).toBeCloseTo(1, 1);
  });
});

describe('持ち味の条件文', () => {
  /** その武器と技を1回使ったときの、直撃の与ダメージの合計 */
  const once = (weapons: UnitSpec['weapons'], skill: 'slash' | 'shoot' | 'thrust', condition: ConditionId | undefined, x: number, setup?: (w: CombatWorld) => void) => {
    const w = new CombatWorld({ seed: 5 });
    w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons, conditions: condition ? [condition] : [] });
    w.addUnit({ id: 't', name: '案山子', team: 'enemy', x, y: 0, maxHp: 1e9 });
    setup?.(w);
    w.useSkill('p', skill, w.units.get('t')!, 't');
    run(w, 2000);
    return w.log.filter((r) => r.depth === 0 && r.targetId === 't' && r.tags.includes('attack')).reduce((s, r) => s + r.amount, 0);
  };

  it('雷の通い路:感電している敵への雷の攻撃は3倍', () => {
    const shocked = (w: CombatWorld) => w.forceStatus('t', 'shock', true);
    const gun = [{ type: 'capGun' as const, element: 'lightning' as const }];
    expect(once(gun, 'shoot', 'stormConduit', 200, shocked) / once(gun, 'shoot', undefined, 200, shocked)).toBeCloseTo(3, 1);
    expect(once(gun, 'shoot', 'stormConduit', 200) / once(gun, 'shoot', undefined, 200)).toBeCloseTo(1, 1);
  });

  it('火葬の讃歌:炎上している敵への杖の術は3倍', () => {
    const burning = (w: CombatWorld) => w.forceStatus('t', 'burn', true);
    const staff = [{ type: 'staff' as const, element: 'fire' as const }];
    expect(once(staff, 'shoot', 'pyreHymn', 200, burning) / once(staff, 'shoot', undefined, 200, burning)).toBeGreaterThan(2.5);
  });

  it('穂先の間合い:間合いの端で当てる近攻撃だけ3倍', () => {
    const spear = [{ type: 'stormSpear' as const }];
    expect(once(spear, 'slash', 'spearEdge', 170) / once(spear, 'slash', undefined, 170)).toBeCloseTo(3, 1);
    expect(once(spear, 'slash', 'spearEdge', 60) / once(spear, 'slash', undefined, 60)).toBeCloseTo(1, 1);
  });

  it('盾越しの連打:盾が張られている間、近攻撃のヒットが増える', () => {
    const count = (condition?: ConditionId) => {
      const w = new CombatWorld({ seed: 5 });
      const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, weapons: [{ type: 'ironSword' }], conditions: condition ? [condition] : [] });
      p.shields = [{ type: 'towerShield', ready: true, readyAt: 0 }];
      w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
      w.useSkill('p', 'slash', w.units.get('t')!, 't');
      run(w, 1500);
      return w.log.filter((r) => r.targetId === 't' && r.tags.includes('melee')).length;
    };
    expect(count('shieldBulwark')).toBe(count() * 3);
  });
});
