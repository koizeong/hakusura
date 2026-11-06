import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { SIGILS, SIGIL_IDS, sigilProblem, sigilRules, sigilText, type SigilInstance } from './data/sigils';
import { MARK_IDS } from './data/marks';
import { generateItem } from './data/equipment';
import { applyBuild, decodeBuild, encodeBuild, type Build } from './build';

const run = (w: CombatWorld, ms: number) => {
  for (let t = 0; t < ms; t += 25) w.update(25);
};

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 印紋だけを刻んだ装飾品を着けて、案山子と向き合う */
function armed(sigils: SigilInstance[], markCurve = false) {
  const w = new CombatWorld({ seed: 1, markCurve });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000 });
  const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 50, y: 0, maxHp: 1e9 });
  applyBuild(w, p, {
    actives: [],
    passives: [],
    equipment: {
      weapon1: { id: 'w', name: '剣', kind: 'weapon', weaponType: 'ironSword', affixes: [] },
      accessory1: { id: 'a', name: '護符', kind: 'accessory', affixes: [], sigils },
    },
    tactics: [],
  });
  const swing = () => {
    p.busyUntil = 0;
    p.cooldowns = {};
    p.streak = { count: 0 };
    w.useSkill('p', 'slash', t, 't');
    run(w, 700);
  };
  return { w, p, t, swing };
}

describe('印紋', () => {
  it('どの印紋も、どの印でも説明とルールが作れる', () => {
    for (const id of SIGIL_IDS) {
      for (const mark of MARK_IDS) {
        const s: SigilInstance = { sigil: id, mark, ...(SIGILS[id] as { other?: boolean }).other ? { other: MARK_IDS.find((m) => m !== mark)! } : {} };
        expect(sigilProblem(s), `${id}/${mark}`).toBeNull();
        expect(sigilText(s)).toMatch(/〈/);
        expect(sigilRules(s).length).toBeGreaterThan(0);
      }
    }
  });

  it('拾い物は全て1〜3個の印紋を持つ', () => {
    const rand = seeded(5);
    for (let i = 0; i < 200; i++) {
      const it = generateItem(rand);
      expect(it.sigils?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(it.sigils!.length).toBeLessThanOrEqual(3);
    }
  });

  it('防具の5部位は印が決まっている。装飾品と武器はどの印も出る', async () => {
    const { EQUIP_SLOT_IDS, EQUIP_SLOTS, AFFIXES, slotMark } = await import('./data/equipment');
    const rand = seeded(13);
    for (const slot of EQUIP_SLOT_IDS.filter((s) => EQUIP_SLOTS[s].kind === 'armor')) {
      const mark = slotMark(slot)!;
      expect(mark).toBeDefined();
      for (let i = 0; i < 30; i++) {
        const it = generateItem(rand, { slot, kind: 'armor' });
        expect(it.slot).toBe(slot);
        for (const sg of it.sigils!) expect(sg.mark).toBe(mark);
        if (it.awaken) expect(it.awaken.mark).toBe(mark);
        for (const a of it.affixes) {
          const def = AFFIXES[a.affix] as { stat: string; tags: readonly string[] };
          if (def.stat === 'markBlessing' || def.stat === 'markGain') expect(def.tags).toContain(mark);
        }
      }
    }
    const marks = new Set<string>();
    for (let i = 0; i < 60; i++) for (const sg of generateItem(rand, { slot: 'accessory1', kind: 'accessory' }).sigils!) marks.add(sg.mark);
    expect(marks.size).toBeGreaterThan(3);
  });

  it('変換:元の印を消して、別の印に変える', () => {
    // 流転:2秒ごとに血潮の2割を研ぎに(2倍)
    const flow = armed([{ sigil: 'flow', mark: 'edge', other: 'blood' }]);
    flow.w.gainMark(flow.p, 'blood', 100);
    run(flow.w, 2100);
    expect(flow.w.marksOf(flow.p, 'blood')).toBe(80);
    expect(flow.w.marksOf(flow.p, 'edge')).toBe(40);
    // 鋳直し:血潮を得るたび、得た分を研ぎに(1.5倍)。血潮は溜まらない
    const recast = armed([{ sigil: 'recast', mark: 'edge', other: 'blood' }]);
    recast.w.gainMark(recast.p, 'blood', 10);
    expect(recast.w.marksOf(recast.p, 'blood')).toBe(0);
    expect(recast.w.marksOf(recast.p, 'edge')).toBe(15);
    // 集め:ほかの全ての印の1割を集める
    const gather = armed([{ sigil: 'gather', mark: 'prayer' }]);
    gather.w.gainMark(gather.p, 'ember', 100);
    gather.w.gainMark(gather.p, 'blood', 100);
    run(gather.w, 2100);
    expect(gather.w.marksOf(gather.p, 'prayer')).toBe(30);
  });

  it('ビルドが関わる印は、2秒に1ずつ自然に溜まる。関わらない印は溜まらない', async () => {
    const { MARK_NATURAL } = await import('./data/marks');
    const w = new CombatWorld({ seed: 1 });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000 });
    applyBuild(w, p, { actives: [], passives: [], equipment: { accessory1: { id: 'a', name: '護符', kind: 'accessory', affixes: [], sigils: [{ sigil: 'convert', mark: 'edge', other: 'blood' }] } }, tactics: [] });
    expect(p.naturalMarks).toEqual(['edge', 'blood']);
    run(w, MARK_NATURAL.every * 3 + 50);
    // 血潮が自然に溜まると、移ろいで研ぎも得る
    expect(w.marksOf(p, 'blood')).toBe(MARK_NATURAL.amount * 3);
    expect(w.marksOf(p, 'edge')).toBeGreaterThanOrEqual(MARK_NATURAL.amount * 3);
    expect(w.marksOf(p, 'ember')).toBe(0);
  });

  it('縁:縁のある技を当てると1度だけ印を得る', () => {
    const { w, p, swing } = armed([{ sigil: 'kindle', mark: 'edge' }]);
    swing();
    expect(w.marksOf(p, 'edge')).toBe(4);
  });

  it('増殖:印を使うたび、持っている印を全て増やす', () => {
    const { w, p, t } = armed([{ sigil: 'proliferate', mark: 'edge' }]);
    w.gainMark(p, 'edge', 100);
    w.gainMark(p, 'blood', 200);
    w.consumeMarks(p, 'edge', 50, '試し', t, { attacker: p, skill: '試し', via: [], depth: 0 });
    // 8%ずつ増える
    expect(w.marksOf(p, 'edge')).toBe(54);
    expect(w.marksOf(p, 'blood')).toBe(216);
  });

  it('過負荷:札から得る印が2倍、使ってから4秒は得られない', () => {
    // 過負荷は生成力に乗るので、生成力を通す
    const { w, p, t, swing } = armed(
      [
        { sigil: 'kindle', mark: 'edge' },
        { sigil: 'overload', mark: 'edge' },
      ],
      true,
    );
    swing();
    expect(w.marksOf(p, 'edge')).toBe(8);
    w.consumeMarks(p, 'edge', 8, '試し', t, { attacker: p, skill: '試し', via: [], depth: 0 });
    swing();
    expect(w.marksOf(p, 'edge')).toBe(0);
  });

  it('一閃:印を使って属性の追撃を落とす。焼き印:使うたび状態を溜める', () => {
    const { w, p, t, swing } = armed([
      { sigil: 'smite', mark: 'ember' },
      { sigil: 'brand', mark: 'ember' },
    ]);
    w.gainMark(p, 'ember', 60);
    swing();
    expect(w.marksOf(p, 'ember')).toBe(40);
    expect(w.log.some((r) => r.via.includes('熾りの一閃') && r.element === 'fire')).toBe(true);
    expect(t.statuses.burn.buildup > 0 || w.isActive(t, 'burn')).toBe(true);
  });

  it('飢え:印がないときだけ与ダメージが増える', () => {
    const hit = (marks: number) => {
      const { w, p, swing } = armed([{ sigil: 'hunger', mark: 'blood' }]);
      if (marks > 0) w.gainMark(p, 'blood', marks);
      swing();
      return w.log.find((r) => r.depth === 0)!.amount;
    };
    expect(hit(0) / hit(5)).toBeCloseTo(1.6, 2);
  });

  it('恩恵:抱えの恩恵が強まる', () => {
    const { w, p } = armed([{ sigil: 'bless', mark: 'prayer' }]);
    w.gainMark(p, 'prayer', 100);
    expect(w.statOf(p, 'markBlessing', ['prayer'])).toBeCloseTo(2.2);
  });

  it('ビルドコードに入り、知らない印紋は弾く', () => {
    const build: Build = {
      actives: [],
      passives: [],
      equipment: { accessory1: { id: 'a', name: '護符', kind: 'accessory', affixes: [], sigils: [{ sigil: 'convert', mark: 'edge', other: 'blood' }] } },
      tactics: [],
    };
    expect('build' in decodeBuild(encodeBuild(build))).toBe(true);
    const bad = { ...build, equipment: { accessory1: { ...build.equipment.accessory1!, sigils: [{ sigil: 'nope', mark: 'edge' }] } } } as unknown as Build;
    expect('error' in decodeBuild(encodeBuild(bad))).toBe(true);
  });
});
