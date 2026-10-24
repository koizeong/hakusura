import type { EnemyId } from './enemies';
import type { FieldId } from './fields';

/** 1回の戦闘。duration の間、決まった時刻に敵の群れが現れる。一戦はおよそ5分 */
export interface EncounterDef {
  name: string;
  description: string;
  /** 戦う時間(ミリ秒)。過ぎれば生き延びたことになる */
  duration: number;
  /** 戦う間の天候 */
  weather?: FieldId;
  waves: readonly { at: number; spawn: readonly { enemy: EnemyId; count: number }[] }[];
}

const SEC = 1000;

export const ENCOUNTERS = {
  ashNight: {
    name: '灰の街道の夜',
    description: '五分、夜明けまで持ちこたえる。屍喰いの群れに、煤吹き・錆鎧・油袋・鐘守が混じって来る。夜は闇と呪いが強まる',
    duration: 300 * SEC,
    weather: 'night',
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
  fogVigil: {
    name: '霧の墓守り',
    description: '霧の墓地で五分。屍術師が死体を起こし、影潜みが背後を狙い、巣袋が屍喰いを産む。死体は灰で崩せば起こされない',
    duration: 300 * SEC,
    weather: 'fog',
    waves: [
      { at: 0, spawn: [{ enemy: 'ghoul', count: 5 }] },
      { at: 20 * SEC, spawn: [{ enemy: 'corpseCaller', count: 1 }, { enemy: 'ghoul', count: 3 }] },
      { at: 45 * SEC, spawn: [{ enemy: 'shadowStalker', count: 2 }] },
      { at: 75 * SEC, spawn: [{ enemy: 'broodSac', count: 1 }, { enemy: 'thornHusk', count: 1 }] },
      { at: 105 * SEC, spawn: [{ enemy: 'corpseCaller', count: 1 }, { enemy: 'ghoul', count: 6 }] },
      { at: 135 * SEC, spawn: [{ enemy: 'thornHusk', count: 2 }, { enemy: 'shadowStalker', count: 1 }] },
      { at: 165 * SEC, spawn: [{ enemy: 'broodSac', count: 1 }, { enemy: 'corpseCaller', count: 1 }] },
      { at: 195 * SEC, spawn: [{ enemy: 'shadowStalker', count: 2 }, { enemy: 'ghoul', count: 6 }] },
      { at: 230 * SEC, spawn: [{ enemy: 'thornHusk', count: 2 }, { enemy: 'corpseCaller', count: 2 }] },
      { at: 260 * SEC, spawn: [{ enemy: 'broodSac', count: 2 }, { enemy: 'shadowStalker', count: 2 }] },
    ],
  },
  plagueMarch: {
    name: '疫病の行軍',
    description: '風の止んだ街道で五分。疫病の運び手が仲間を癒し、宣告者が死を告げ、黙りの修道士が作戦を封じる。癒しは腐らせて傷に変える',
    duration: 300 * SEC,
    weather: 'calm',
    waves: [
      { at: 0, spawn: [{ enemy: 'bloodZealot', count: 2 }, { enemy: 'ghoul', count: 3 }] },
      { at: 25 * SEC, spawn: [{ enemy: 'plagueCarrier', count: 1 }, { enemy: 'rustKnight', count: 1 }] },
      { at: 55 * SEC, spawn: [{ enemy: 'doomHerald', count: 1 }, { enemy: 'bloodZealot', count: 1 }] },
      { at: 85 * SEC, spawn: [{ enemy: 'hushMonk', count: 1 }, { enemy: 'ghoul', count: 5 }] },
      { at: 115 * SEC, spawn: [{ enemy: 'frostWitch', count: 2 }, { enemy: 'plagueCarrier', count: 1 }] },
      { at: 145 * SEC, spawn: [{ enemy: 'rustKnight', count: 1 }, { enemy: 'doomHerald', count: 1 }, { enemy: 'bloodZealot', count: 1 }] },
      { at: 175 * SEC, spawn: [{ enemy: 'hushMonk', count: 1 }, { enemy: 'frostWitch', count: 1 }, { enemy: 'ghoul', count: 4 }] },
      { at: 205 * SEC, spawn: [{ enemy: 'plagueCarrier', count: 2 }, { enemy: 'bloodZealot', count: 2 }] },
      { at: 235 * SEC, spawn: [{ enemy: 'doomHerald', count: 2 }, { enemy: 'rustKnight', count: 1 }] },
      { at: 265 * SEC, spawn: [{ enemy: 'hushMonk', count: 1 }, { enemy: 'plagueCarrier', count: 1 }, { enemy: 'frostWitch', count: 1 }, { enemy: 'bloodZealot', count: 2 }] },
    ],
  },
} as const satisfies Record<string, EncounterDef>;

export type EncounterId = keyof typeof ENCOUNTERS;
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS) as EncounterId[];

export function encounterDef(id: EncounterId): EncounterDef {
  return ENCOUNTERS[id];
}
