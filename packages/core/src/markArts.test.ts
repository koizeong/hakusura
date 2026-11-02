import { describe, expect, it } from 'vitest';
import { CombatWorld } from './world';
import { ART_QUIRKS, artProblem, artTechnique, rollMarkArt, starterArts, type MarkArt } from './data/markArts';
import { markArtPower, MARK_IDS } from './data/marks';
import { applyBuild, decodeBuild, encodeBuild, unusableActives, type Build } from './build';
import { rollArts } from './expedition';

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

const sword: Build['equipment'] = { weapon1: { id: 'w', name: '剣', kind: 'weapon', weaponType: 'ironSword', affixes: [] } };

function armed(art: MarkArt, equipment: Build['equipment'] = sword) {
  const w = new CombatWorld({ seed: 1, markCurve: false });
  const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000 });
  const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 50, y: 0, maxHp: 1e9 });
  applyBuild(w, p, { actives: ['art1'], passives: [], equipment, tactics: [], arts: { art1: art } });
  p.attributes = { str: 40, dex: 40, int: 40, fai: 40, vit: 40 };
  return { w, p, t };
}

describe('印の技(生成)', () => {
  it('作るたびに消費・形・癖が変わり、威力の合計は消費で決まる', () => {
    const rand = seeded(7);
    const arts = Array.from({ length: 400 }, () => rollMarkArt(rand));
    const costs = arts.map((a) => a.cost);
    expect(Math.min(...costs)).toBe(5);
    expect(Math.max(...costs)).toBeGreaterThanOrEqual(90);
    // 小さい技が多く、大技は稀
    expect(costs.filter((c) => c <= 10).length).toBeGreaterThan(costs.filter((c) => c >= 70).length * 2);
    expect(costs.filter((c) => c >= 150).length).toBeGreaterThan(0);
    expect(Math.max(...costs)).toBeLessThanOrEqual(1000);
    expect(new Set(arts.map((a) => a.shape)).size).toBe(3);
    expect(new Set(arts.map((a) => a.quirk)).size).toBe(Object.keys(ART_QUIRKS).length + 1);
    for (const a of arts) {
      expect(artProblem(a)).toBeNull();
      const total = a.power * a.hits * a.count;
      const scale = a.quirk ? ART_QUIRKS[a.quirk].scale : 1;
      expect(total).toBeCloseTo(markArtPower(a.cost) * scale, -1);
    }
    // 印を渡せば、その印の技になる
    for (const m of MARK_IDS) expect(rollMarkArt(rand, m).mark).toBe(m);
  });

  it('枠に入れた技は、印を消費して出る。名前は技の名前のまま', () => {
    const art = starterArts()[0]!;
    const { w, p, t } = armed(art);
    expect(w.canUseSkill('p', 'art1')).toBe(false);
    w.gainMark(p, 'edge', art.cost);
    expect(w.canUseSkill('p', 'art1')).toBe(true);
    expect(w.markCostOf(p, 'art1')).toEqual({ mark: 'edge', amount: art.cost });
    w.useSkill('p', 'art1', t, 't');
    expect(w.marksOf(p, 'edge')).toBe(0);
    run(w, 2000);
    const hits = w.log.filter((r) => r.skill === art.name);
    expect(hits.length).toBeGreaterThan(0);
    // 空の枠は出ない
    expect(w.canUseSkill('p', 'art2')).toBe(false);
  });

  it('重い技ほど1発が重い', () => {
    const light: MarkArt = { ...starterArts()[0]!, id: 'l' };
    const heavy: MarkArt = { ...light, id: 'h', name: '万刃の断ち', cost: 100, power: Math.round(markArtPower(100)) };
    const dealt = (art: MarkArt) => {
      const { w, p, t } = armed(art);
      w.gainMark(p, 'edge', 100);
      w.useSkill('p', 'art1', t, 't');
      run(w, 3000);
      return w.log.filter((r) => r.skill === art.name).reduce((s, r) => s + r.amount, 0);
    };
    const ratio = dealt(heavy) / dealt(light);
    expect(ratio).toBeGreaterThan(30);
  });

  it('撃つ技は遠距離の武器がなければ出ず、周りに放つ技はどの武器でも出る', () => {
    const shot: MarkArt = { ...starterArts()[1]! };
    const nova: MarkArt = { ...starterArts()[2]! };
    const build: Build = { actives: ['art1', 'art2', 'art3'], passives: [], equipment: sword, tactics: [], arts: { art1: shot, art2: nova } };
    expect(unusableActives(build)).toEqual(['art1', 'art3']);
  });

  it('返しの癖は、当てると印を取り戻す', () => {
    const art: MarkArt = { ...starterArts()[0]!, cost: 20, power: 20, quirk: 'refund' };
    expect(artTechnique(art).technique.rules?.length).toBe(1);
    const { w, p, t } = armed(art);
    w.gainMark(p, 'edge', 20);
    w.useSkill('p', 'art1', t, 't');
    run(w, 2000);
    expect(w.marksOf(p, 'edge')).toBe(6);
  });

  it('ビルドコードに入り、書き換えた技は弾く', () => {
    const art = rollMarkArt(seeded(3));
    const build: Build = { actives: ['art1'], passives: [], equipment: {}, tactics: [], arts: { art1: art } };
    const back = decodeBuild(encodeBuild(build));
    expect('build' in back && back.build.arts?.art1?.name).toBe(art.name);
    const cheat = decodeBuild(encodeBuild({ ...build, arts: { art1: { ...art, power: art.power * 10 } } }));
    expect('error' in cheat).toBe(true);
  });

  it('遠征や大物の持ち帰りは、見込みの数だけ拾う', () => {
    const rand = seeded(11);
    expect(rollArts(rand, 2).length).toBe(2);
    const n = Array.from({ length: 200 }, () => rollArts(rand, 0.5).length).reduce((a, b) => a + b, 0);
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(140);
  });
});

describe('手で撃つ印の技', () => {
  it('手で撃つ者には、作戦が壱・弐を出さない。手で撃たない者は足りしだい撃つ', () => {
    const fired = (mode: 'manual' | 'auto') => {
      const art = starterArts()[0]!;
      const w = new CombatWorld({ seed: 1, markCurve: false });
      const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, autoBattle: true });
      w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 50, y: 0, maxHp: 1e9 });
      applyBuild(w, p, { actives: ['art1', 'slash'], passives: [], equipment: sword, tactics: [{ skill: 'art1', condition: 'always', enabled: true }, { skill: 'slash', condition: 'always', enabled: true }], arts: { art1: art } });
      p.handArts = mode;
      w.gainMark(p, 'edge', 5);
      run(w, 2000);
      return w.log.some((r) => r.skill === art.name);
    };
    expect(fired('manual')).toBe(false);
    expect(fired('auto')).toBe(true);
  });

  it('見切りの一閃:ジャスト回避の直後に撃つと、印を取り戻す', () => {
    const art: MarkArt = { ...starterArts()[0]!, cost: 20, power: 20 };
    const { w, p, t } = armed(art);
    p.conditions = ['dodgeArt'];
    w.gainMark(p, 'edge', 20);
    p.lastJustDodgeAt = w.time;
    w.useSkill('p', 'art1', t, 't');
    expect(w.marksOf(p, 'edge')).toBe(20);
    run(w, 3000);
    p.busyUntil = 0;
    p.cooldowns = {};
    w.useSkill('p', 'art1', t, 't');
    expect(w.marksOf(p, 'edge')).toBe(0);
  });

  it('溜め込みの欲:50以上なら得るたびにもう1つ。自分の分では重ならない', () => {
    const w = new CombatWorld({ seed: 1, markCurve: false });
    const p = w.addUnit({ id: 'p', name: '巡礼者', team: 'player', x: 0, y: 0, maxHp: 1000, conditions: ['hoarder', 'honeEdge'] });
    const t = w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 50, y: 0, maxHp: 1e9 });
    applyBuild(w, p, { actives: [], passives: [], equipment: sword, tactics: [] });
    p.conditions = ['hoarder', 'honeEdge'];
    // 50に届いた分でも1つ多く得る
    w.gainMark(p, 'edge', 50);
    expect(w.marksOf(p, 'edge')).toBe(51);
    // 研ぎ重ねの1つに、もう1つ(溜め込みの欲が生んだ1つでは、もう働かない)
    w.useSkill('p', 'slash', t, 't');
    run(w, 800);
    expect(w.marksOf(p, 'edge')).toBe(53);
  });
});
