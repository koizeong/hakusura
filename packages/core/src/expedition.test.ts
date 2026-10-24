import { describe, expect, it } from 'vitest';
import { newCharacter, type Build } from './build';
import { DEFAULT_TACTICS } from './data/tactics';
import { EXPEDITIONS, EXPEDITION_INJURY, EXPEDITION_YIELD } from './data/expeditions';
import { ATTRIBUTE_RULES, expToNext } from './data/attributes';
import {
  STARTING_SKILLS,
  canFight,
  canSend,
  expeditionDone,
  injuryChance,
  isInjured,
  measureAt,
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

describe('行き先ごとの特徴', () => {
  it('強さはその地の環境で測る(聖堂は雨なので、感電を使うビルドが伸びる)', () => {
    const gun: Omit<Build, 'attributes'> = {
      actives: ['shoot'],
      passives: [],
      equipment: { weapon1: weapon('capGun') },
      tactics: [{ skill: 'shoot', condition: 'always', enabled: true }],
    };
    expect(measureAt({ ...gun, attributes: undefined }, 'drownedChapel')).toBeGreaterThan(measureAt({ ...gun, attributes: undefined }, 'outskirts'));
  });

  it('廃坑の敵は火に強い', () => {
    const axe: Omit<Build, 'attributes'> = {
      actives: ['slash'],
      passives: [],
      equipment: { weapon1: { id: 'a', name: '斧', kind: 'weapon', affixes: [], weaponType: 'cinderAxe' } },
      tactics: [{ skill: 'slash', condition: 'always', enabled: true }],
    };
    expect(measureAt({ ...axe, attributes: undefined }, 'rustMine')).toBeLessThan(measureAt({ ...axe, attributes: undefined }, 'outskirts'));
  });

  it('持ち帰る物に、その地らしさが出る(廃坑は武器が多く、決まった種類が出る)', () => {
    let weapons = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const c = newCharacter('c', '骨拾い', 0, strong);
      startExpedition(c, 'rustMine', 0, seed);
      for (const item of finishExpedition(c, learnedCopy())!.items) {
        total++;
        if (item.kind === 'weapon') {
          weapons++;
          expect(EXPEDITIONS.rustMine.weaponTypes).toContain(item.weaponType);
        }
      }
    }
    expect(weapons / total).toBeGreaterThan(0.4);
  });
});

describe('負傷', () => {
  it('手強さに比べて十分強ければ負傷しない', () => {
    expect(injuryChance(1e9, 'drownedChapel')).toBe(0);
    expect(injuryChance(EXPEDITIONS.drownedChapel.threat * EXPEDITION_INJURY.below, 'drownedChapel')).toBe(0);
  });

  it('弱いほど負傷しやすい', () => {
    expect(injuryChance(0, 'drownedChapel')).toBeCloseTo(EXPEDITION_INJURY.maxChance);
    expect(injuryChance(100, 'drownedChapel')).toBeGreaterThan(injuryChance(200, 'drownedChapel'));
  });

  it('負傷して戻ると、治るまで戦えず遠征にも出せない', () => {
    let injured = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const c = newCharacter('c', '骨拾い', 0, weak);
      startExpedition(c, 'drownedChapel', 0, seed);
      const report = finishExpedition(c, learnedCopy(), EXPEDITIONS.drownedChapel.duration)!;
      if (report.injuredFor > 0) {
        injured++;
        const back = EXPEDITIONS.drownedChapel.duration;
        expect(isInjured(c, back + 1)).toBe(true);
        expect(canFight(c, back + 1)).toBe(false);
        expect(canSend(c, back + 1)).toBe(false);
        expect(canFight(c, back + report.injuredFor + 1)).toBe(true);
      }
    }
    expect(injured).toBeGreaterThan(5);
  });
});

describe('経験値の釣り合い', () => {
  it('Lv50までに、聖堂へ手強さどおりの強さで通って50〜90時間ほど', () => {
    let total = 0;
    for (let lv = 1; lv < ATTRIBUTE_RULES.maxLevel; lv++) total += expToNext(lv);
    const hours = (total / EXPEDITIONS.drownedChapel.exp) * (EXPEDITIONS.drownedChapel.duration / 3600000);
    expect(hours).toBeGreaterThan(50);
    expect(hours).toBeLessThan(90);
  });

  it('長い遠征ほど、時間あたりの経験値が多い', () => {
    const perHour = (id: keyof typeof EXPEDITIONS) => EXPEDITIONS[id].exp / (EXPEDITIONS[id].duration / 3600000);
    expect(perHour('ashRoad')).toBeGreaterThan(perHour('outskirts'));
    expect(perHour('rustMine')).toBeGreaterThan(perHour('ashRoad'));
    expect(perHour('drownedChapel')).toBeGreaterThan(perHour('rustMine'));
  });
});
