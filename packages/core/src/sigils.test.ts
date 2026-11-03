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

  it('縁:縁のある技を当てると1度だけ印を得る', () => {
    const { w, p, swing } = armed([{ sigil: 'kindle', mark: 'edge' }]);
    swing();
    expect(w.marksOf(p, 'edge')).toBe(1);
  });

  it('増殖:印を使うたび、持っている印を全て増やす', () => {
    const { w, p, t } = armed([{ sigil: 'proliferate', mark: 'edge' }]);
    w.gainMark(p, 'edge', 100);
    w.gainMark(p, 'blood', 200);
    w.consumeMarks(p, 'edge', 50, '試し', t, { attacker: p, skill: '試し', via: [], depth: 0 });
    expect(w.marksOf(p, 'edge')).toBe(52);
    expect(w.marksOf(p, 'blood')).toBe(206);
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
    expect(w.marksOf(p, 'edge')).toBe(2);
    w.consumeMarks(p, 'edge', 2, '試し', t, { attacker: p, skill: '試し', via: [], depth: 0 });
    swing();
    expect(w.marksOf(p, 'edge')).toBe(0);
  });

  it('恩恵:抱えの恩恵が強まる', () => {
    const { w, p } = armed([{ sigil: 'bless', mark: 'prayer' }]);
    w.gainMark(p, 'prayer', 100);
    expect(w.statOf(p, 'markBlessing', ['prayer'])).toBeCloseTo(1.4);
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
