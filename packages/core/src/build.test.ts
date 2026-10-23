import { describe, expect, it } from 'vitest';
import { CombatWorld, type Unit } from './world';
import { ACTIVE_SKILLS } from './data/skills';
import { AFFIXES, EQUIP_RULES, generateItem, itemTotal, type AffixDef, type Item } from './data/equipment';
import { applyBuild, buildProblems, canEquip, decodeBuild, encodeBuild, type Build } from './build';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 10) w.update(10);
};

function seeded(seed: number) {
  const w = new CombatWorld({ seed });
  return () => w.random();
}

const emptyBuild = (extra: Partial<Build> = {}): Build => ({ actives: [], passives: [], equipment: {}, tactics: [], ...extra });

const item = (extra: Partial<Item>): Item => ({ id: 'x', name: '試し', kind: 'accessory', affixes: [], ...extra });

function setup() {
  const w = new CombatWorld();
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 300 });
  const e = w.addUnit({ id: 'e', name: '案山子', team: 'enemy', x: 60, y: 0, maxHp: 1e9 });
  return { w, p, e };
}

const equip = (w: CombatWorld, p: Unit, items: Item[], extra: Partial<Build> = {}) => {
  const slots = ['accessory1', 'accessory2', 'accessory3'] as const;
  applyBuild(w, p, emptyBuild({ equipment: Object.fromEntries(items.map((it, i) => [slots[i], it])), ...extra }));
};

describe('装備の生成', () => {
  it('項目は1〜4、共通項目が必ず1つ、各項目と合計は決まりの範囲に収まる', () => {
    const random = seeded(3);
    for (let i = 0; i < 500; i++) {
      const it = generateItem(random);
      const count = it.affixes.length + (it.condition ? 1 : 0);
      expect(count).toBeGreaterThanOrEqual(EQUIP_RULES.countMin);
      expect(count).toBeLessThanOrEqual(EQUIP_RULES.countMax);
      expect(it.affixes.some((a) => (AFFIXES[a.affix] as AffixDef).common)).toBe(true);
      for (const a of it.affixes) {
        expect(Math.abs(a.value)).toBeLessThanOrEqual(EQUIP_RULES.affixMax);
      }
      expect(itemTotal(it)).toBeGreaterThanOrEqual(EQUIP_RULES.totalMin);
      expect(itemTotal(it)).toBeLessThanOrEqual(EQUIP_RULES.totalMax);
      expect(new Set(it.affixes.map((a) => a.affix)).size).toBe(it.affixes.length);
    }
  });

  it('条件文を指定して作れ、コストも合計に入る', () => {
    const it = generateItem(seeded(1), { condition: 'unscathed' });
    expect(it.condition).toBe('unscathed');
    expect(itemTotal(it)).toBe(it.affixes.reduce((s, a) => s + (AFFIXES[a.affix].stat === 'damageTaken' || AFFIXES[a.affix].stat === 'cooldown' ? -a.value : a.value), 0) + 30);
  });

  it('防具は決まった部位、アーティファクトは装飾品の枠にだけ着けられる', () => {
    expect(canEquip(item({ kind: 'armor', slot: 'head' }), 'head')).toBe(true);
    expect(canEquip(item({ kind: 'armor', slot: 'head' }), 'feet')).toBe(false);
    expect(canEquip(item({ kind: 'weapon' }), 'weapon2')).toBe(true);
    expect(canEquip(item({ artifact: 'thornArmor' }), 'accessory2')).toBe(true);
    expect(canEquip(item({ artifact: 'thornArmor' }), 'body')).toBe(false);
  });
});

describe('補正値の効き先', () => {
  it('最大HP・移動速度・被ダメージ・クールダウン・状態の蓄積に効く', () => {
    const { w, p, e } = setup();
    equip(w, p, [
      item({
        affixes: [
          { affix: 'maxHp', value: 50 },
          { affix: 'moveSpeed', value: 20 },
          { affix: 'damageTaken', value: -40 },
          { affix: 'cooldown', value: -50 },
        ],
      }),
      item({ affixes: [{ affix: 'bleedBuildup', value: 100 }] }),
    ]);
    expect(p.maxHp).toBe(450);
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(1.2);
    w.useSkill('p', 'rustGreatsword', e);
    expect(p.cooldowns.rustGreatsword).toBeCloseTo(ACTIVE_SKILLS.rustGreatsword.cooldown * 0.5);
    run(w, 400);
    // 蓄積が2倍なので、1回で満タンになり出血が発動する
    expect(w.isActive(e, 'bleed')).toBe(true);
    w.useSkill('e', 'strawSwipe', p);
    run(w, 1000);
    expect(w.log.find((r) => r.targetId === 'p')!.amount).toBeCloseTo(ACTIVE_SKILLS.strawSwipe.action.power * 0.6);
  });

  it('同じ項目は足してから掛け、違う項目どうしは掛ける', () => {
    const { w, p } = setup();
    equip(w, p, [item({ affixes: [{ affix: 'moveSpeed', value: 30 }] }), item({ affixes: [{ affix: 'moveSpeed', value: 20 }] })], { passives: ['fleetFoot'] });
    // 装備 +50% と、逃げ足 +30% は stat と tags が同じなので足す
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(1.8);
  });

  it('作戦はビルドに入れたアクティブしか使わない', () => {
    const { w, p } = setup();
    applyBuild(w, p, emptyBuild({ actives: ['thunderGun'], tactics: [{ skill: 'rustGreatsword', condition: 'always', enabled: true }] }));
    p.autoBattle = true;
    run(w, 600);
    expect(w.log.length).toBe(0);
  });
});

describe('追加した条件文', () => {
  const withCondition = (condition: Item['condition']) => {
    const s = setup();
    equip(s.w, s.p, [item({ condition })]);
    return s;
  };

  it('2: 自分が出血中なら、移動速度+50%', () => {
    const { w, p } = withCondition('bleedingSprint');
    expect(w.statOf(p, 'moveSpeed')).toBe(1);
    w.forceStatus('p', 'bleed', true);
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(1.5);
  });

  it('9: 敵が3種類以上の状態にかかっているとき、与ダメージ2倍', () => {
    const { w, e } = withCondition('manyAilments');
    for (const s of ['wet', 'oiled', 'stun'] as const) w.forceStatus('e', s, true);
    w.useSkill('p', 'rustGreatsword', e);
    run(w, 400);
    // 昏倒に追撃 ×1.5 と掛け合わさる
    expect(w.log[0]!.amount).toBeCloseTo(ACTIVE_SKILLS.rustGreatsword.action.power * 2 * 1.5);
  });

  it('10: 自分がどの状態にもかかっていないとき、被ダメージ-40%', () => {
    const { w, p } = withCondition('cleanBody');
    expect(w.statOf(p, 'damageTaken')).toBeCloseTo(0.6);
    w.forceStatus('p', 'wet', true);
    expect(w.statOf(p, 'damageTaken')).toBe(1);
  });

  it('41: HPが満タンのとき、与ダメージ+50%', () => {
    const { w, p, e } = withCondition('unscathed');
    w.useSkill('p', 'rustGreatsword', e);
    run(w, 400);
    expect(w.log[0]!.amount).toBeCloseTo(ACTIVE_SKILLS.rustGreatsword.action.power * 1.5);
    p.hp -= 1;
    p.cooldowns = {};
    p.busyUntil = 0;
    w.useSkill('p', 'rustGreatsword', e);
    run(w, 400);
    expect(w.log.filter((r) => r.depth === 0)[1]!.amount).toBeCloseTo(ACTIVE_SKILLS.rustGreatsword.action.power);
  });

  it('48: 被弾するたびに、攻撃してきた相手に出血を付与', () => {
    const { w, e } = withCondition('bleedBack');
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    run(w, 1000);
    expect(w.isActive(e, 'bleed')).toBe(true);
  });

  it('52: 油溜まりの上にいるとき、自分は炎上しない', () => {
    const { w, p } = withCondition('oilWalker');
    w.addFloor('oilPool', 0, 0, 80);
    w.units.get('e')!.imbue = { skill: 'emberOil', until: 1e9 };
    for (let i = 0; i < 5; i++) {
      w.units.get('e')!.cooldowns = {};
      w.units.get('e')!.busyUntil = 0;
      w.useSkill('e', 'strawSwipe', p);
      run(w, 1000);
    }
    expect(w.isActive(p, 'burn')).toBe(false);
  });

  it('64: 移動していない間、被ダメージ-50%', () => {
    const { w, p } = withCondition('standFirm');
    run(w, 500);
    expect(w.statOf(p, 'damageTaken')).toBeCloseTo(0.5);
    w.moveUnit('p', 10, 0);
    expect(w.statOf(p, 'damageTaken')).toBe(1);
  });

  it('116: 被ダメージを受けた直後の3秒間、与ダメージ+80%', () => {
    const { w, p } = withCondition('woundedFury');
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    run(w, 1000);
    expect(p.buffs.map((b) => b.label)).toContain('手負いの猛り');
    run(w, 3100);
    expect(p.buffs.length).toBe(0);
  });
});

describe('アーティファクト', () => {
  const withArtifact = (artifact: Item['artifact']) => {
    const s = setup();
    equip(s.w, s.p, [item({ artifact })]);
    return s;
  };

  it('双子の銃: 遠攻撃が2発、1発ごとの威力は60%', () => {
    const { w, e } = withArtifact('twinGuns');
    w.moveUnit('e', 400, 0);
    w.useSkill('p', 'thunderGun', e);
    run(w, ACTIVE_SKILLS.thunderGun.windup + 10);
    expect(w.projectiles.length).toBe(2);
    run(w, 500);
    expect(w.log[0]!.amount).toBeCloseTo(ACTIVE_SKILLS.thunderGun.action.power * 0.6);
  });

  it('半分の命: 最大HPが半分、与ダメージ+50%', () => {
    const { w, p, e } = withArtifact('halfLife');
    expect(p.maxHp).toBe(150);
    w.useSkill('p', 'rustGreatsword', e);
    run(w, 400);
    expect(w.log[0]!.amount).toBeCloseTo(ACTIVE_SKILLS.rustGreatsword.action.power * 1.5);
  });

  it('煤けた聖火: 濡れている敵にも炎上を付与する', () => {
    const { w, p, e } = withArtifact('sootyTorch');
    w.forceStatus('e', 'wet', true);
    p.imbue = { skill: 'emberOil', until: 1e9 };
    for (let i = 0; i < 5 && !w.isActive(e, 'burn'); i++) {
      p.cooldowns = {};
      p.busyUntil = 0;
      w.useSkill('p', 'rustGreatsword', e);
      run(w, 400);
    }
    expect(w.isActive(e, 'burn')).toBe(true);
    run(w, 100);
    expect(w.isActive(e, 'burn')).toBe(true);
  });

  it('油商人の樽: 歩いた跡に油溜まりが残り、時間で消える', () => {
    const { w } = withArtifact('oilMerchantBarrel');
    for (let x = 0; x <= 300; x += 10) w.moveUnit('p', x, 0);
    expect(w.floors.length).toBe(4);
    run(w, 7000);
    expect(w.floors.length).toBe(0);
  });

  it('苔むした大盾: 正面からの攻撃を全て防ぐが、移動速度-50%', () => {
    const { w, p } = withArtifact('mossyShield');
    expect(w.statOf(p, 'moveSpeed')).toBeCloseTo(0.5);
    w.setFacing('p', 0);
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    run(w, 1000);
    expect(w.log.some((r) => r.targetId === 'p')).toBe(false);
    w.setFacing('p', Math.PI);
    const e = w.units.get('e')!;
    e.cooldowns = {};
    e.busyUntil = 0;
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    run(w, 1000);
    expect(w.log.some((r) => r.targetId === 'p')).toBe(true);
  });

  it('棘の鎧: 被弾するたびに、受けたダメージの半分を相手に返す', () => {
    const { w } = withArtifact('thornArmor');
    w.useSkill('e', 'strawSwipe', { x: 0, y: 0 });
    run(w, 1000);
    const taken = w.log.find((r) => r.targetId === 'p')!.amount;
    const back = w.log.find((r) => r.targetId === 'e' && r.source === '棘の鎧')!;
    expect(back.amount).toBeCloseTo(taken * 0.5);
  });

  it('錆鉄の長柄: 近攻撃の射程が2倍になるが、密着した敵には当たらない', () => {
    const { w, p, e } = withArtifact('rustyPole');
    w.useSkill('p', 'rustGreatsword', e);
    run(w, 400);
    expect(w.log.length).toBe(0); // 60 は近すぎる
    w.moveUnit('e', 200, 0);
    p.cooldowns = {};
    p.busyUntil = 0;
    w.useSkill('p', 'rustGreatsword', e);
    run(w, 400);
    expect(w.log.length).toBe(1);
  });
});

describe('ビルドコード', () => {
  const build: Build = {
    actives: ['rustGreatsword', 'thunderGun'],
    passives: ['heavyHand'],
    equipment: {
      head: { id: 'a', name: '錆びた兜', kind: 'armor', slot: 'head', affixes: [{ affix: 'maxHp', value: 40 }], condition: 'standFirm' },
      accessory1: { id: 'b', name: '棘の鎧', kind: 'accessory', affixes: [], artifact: 'thornArmor' },
    },
    trump: 'oilFlask',
    tactics: [{ skill: 'rustGreatsword', condition: 'always', enabled: true }],
  };

  it('書き出して読み込むと元に戻る', () => {
    const code = encodeBuild(build);
    expect(code.startsWith('HKB1.')).toBe(true);
    expect(decodeBuild(code)).toEqual({ build });
  });

  it('壊れたコードや知らない部品は理由を添えて断る', () => {
    expect(decodeBuild('こんにちは')).toEqual({ error: 'ビルドコードではない' });
    expect(decodeBuild('HKB1.!!!')).toEqual({ error: 'ビルドコードが壊れている' });
    const bad = encodeBuild({ ...build, passives: ['nope' as 'heavyHand'] });
    expect(decodeBuild(bad)).toEqual({ error: '知らないパッシブがある' });
  });

  it('枠の決まりを超えると知らせる', () => {
    expect(buildProblems(build)).toEqual([]);
    const many = { ...build, actives: Array(7).fill('rustGreatsword') };
    expect(buildProblems(many)).toContain('アクティブは6個まで');
  });
});
