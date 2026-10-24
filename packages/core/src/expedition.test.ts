import { describe, expect, it } from 'vitest';
import { newCharacter, type Build } from './build';
import { DEFAULT_TACTICS } from './data/tactics';
import { EXPEDITIONS, EXPEDITION_YIELD } from './data/expeditions';
import {
  STARTING_SKILLS,
  expeditionDone,
  expeditionYield,
  finishExpedition,
  measureBuildPower,
  startExpedition,
  unlearnedSkills,
  type Learned,
} from './expedition';

const weapon = (t: 'ironSword' | 'capGun') => ({ id: t, name: t, kind: 'weapon' as const, affixes: [], weaponType: t });
const strong: Omit<Build, 'attributes'> = {
  actives: ['slash', 'shoot', 'emberOil'],
  passives: ['sootPrayer', 'bloodCallsThunder'],
  equipment: { weapon1: weapon('ironSword'), weapon2: weapon('capGun') },
  tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
  trump: 'rainBell',
};
const weak: Omit<Build, 'attributes'> = { actives: ['slash'], passives: [], equipment: {}, tactics: [{ skill: 'slash', condition: 'always', enabled: true }] };
const learnedCopy = (): Learned => ({ actives: [...STARTING_SKILLS.actives], passives: [...STARTING_SKILLS.passives] });

describe('遠征', () => {
  it('送り出すと、かかる時間が経つまで帰らない', () => {
    const c = newCharacter('c', '骨拾い', 0, strong);
    startExpedition(c, 'ashRoad', 1000, 7);
    expect(expeditionDone(c, 1000 + EXPEDITIONS.ashRoad.duration - 1)).toBe(false);
    expect(expeditionDone(c, 1000 + EXPEDITIONS.ashRoad.duration)).toBe(true);
  });

  it('帰ると経験値と装備を持ち帰り、遠征が終わる', () => {
    const c = newCharacter('c', '骨拾い', 0, strong);
    startExpedition(c, 'ashRoad', 0, 7);
    const report = finishExpedition(c, learnedCopy())!;
    expect(report.exp).toBeGreaterThan(0);
    expect(report.levelsGained).toBeGreaterThan(0);
    expect(c.level).toBeGreaterThan(1);
    expect(report.items.length).toBeGreaterThan(0);
    expect(c.expedition).toBeUndefined();
  });

  it('ビルドが強いほど多く持ち帰る', () => {
    expect(measureBuildPower({ ...strong, attributes: undefined })).toBeGreaterThan(measureBuildPower({ ...weak, attributes: undefined }));
    const run = (build: Omit<Build, 'attributes'>) => {
      const c = newCharacter('c', '骨拾い', 0, build);
      startExpedition(c, 'rustMine', 0, 3);
      return finishExpedition(c, learnedCopy())!;
    };
    const s = run(strong);
    const w = run(weak);
    expect(s.yield).toBeGreaterThan(w.yield);
    expect(s.exp).toBeGreaterThan(w.exp);
  });

  it('持ち帰る量の倍率には上と下がある', () => {
    expect(expeditionYield(0, 'ashRoad')).toBe(EXPEDITION_YIELD.min);
    expect(expeditionYield(1e9, 'ashRoad')).toBe(EXPEDITION_YIELD.max);
  });

  it('まだ覚えていないスキルを見つけて覚える', () => {
    const learned = learnedCopy();
    const before = unlearnedSkills(learned).length;
    let found = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const c = newCharacter('c', '骨拾い', 0, strong);
      startExpedition(c, 'drownedChapel', 0, seed);
      found += finishExpedition(c, learned)!.skills.length;
    }
    expect(found).toBeGreaterThan(0);
    expect(unlearnedSkills(learned).length).toBe(before - found);
  });

  it('同じ遠征なら同じ物を持ち帰る', () => {
    const run = () => {
      const c = newCharacter('c', '骨拾い', 0, strong);
      startExpedition(c, 'ashRoad', 0, 11);
      return finishExpedition(c, learnedCopy())!.items.map((i) => i.affixes.map((a) => `${a.affix}${a.value}`).join()).join('|');
    };
    expect(run()).toBe(run());
  });
});
