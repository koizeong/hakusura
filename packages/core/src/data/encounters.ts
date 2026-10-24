import type { EnemyId } from './enemies';

/** 1回の戦闘。duration の間、決まった時刻に敵の群れが現れる。一戦はおよそ5分 */
export interface EncounterDef {
  name: string;
  description: string;
  /** 戦う時間(ミリ秒)。過ぎれば生き延びたことになる */
  duration: number;
  waves: readonly { at: number; spawn: readonly { enemy: EnemyId; count: number }[] }[];
}

const SEC = 1000;

export const ENCOUNTERS = {
  ashNight: {
    name: '灰の街道の夜',
    description: '五分、夜明けまで持ちこたえる。屍喰いの群れに、煤吹き・錆鎧・油袋・鐘守が混じって来る',
    duration: 300 * SEC,
    waves: [
      { at: 0, spawn: [{ enemy: 'ghoul', count: 4 }] },
      { at: 25 * SEC, spawn: [{ enemy: 'ghoul', count: 3 }, { enemy: 'sootSpitter', count: 1 }] },
      { at: 50 * SEC, spawn: [{ enemy: 'rustKnight', count: 1 }, { enemy: 'ghoul', count: 2 }] },
      { at: 80 * SEC, spawn: [{ enemy: 'oilBloat', count: 2 }, { enemy: 'sootSpitter', count: 1 }] },
      { at: 110 * SEC, spawn: [{ enemy: 'bellKeeper', count: 1 }, { enemy: 'ghoul', count: 4 }] },
      { at: 140 * SEC, spawn: [{ enemy: 'rustKnight', count: 1 }, { enemy: 'sootSpitter', count: 2 }] },
      { at: 170 * SEC, spawn: [{ enemy: 'oilBloat', count: 1 }, { enemy: 'ghoul', count: 6 }] },
      { at: 200 * SEC, spawn: [{ enemy: 'bellKeeper', count: 1 }, { enemy: 'rustKnight', count: 1 }, { enemy: 'sootSpitter', count: 1 }] },
      { at: 230 * SEC, spawn: [{ enemy: 'ghoul', count: 5 }, { enemy: 'oilBloat', count: 2 }] },
      { at: 260 * SEC, spawn: [{ enemy: 'rustKnight', count: 2 }, { enemy: 'bellKeeper', count: 1 }, { enemy: 'sootSpitter', count: 2 }] },
    ],
  },
} as const satisfies Record<string, EncounterDef>;

export type EncounterId = keyof typeof ENCOUNTERS;
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS) as EncounterId[];

export function encounterDef(id: EncounterId): EncounterDef {
  return ENCOUNTERS[id];
}
