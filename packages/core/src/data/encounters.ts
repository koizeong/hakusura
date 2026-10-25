import type { EnemyId } from './enemies';
import type { FieldId } from './fields';

/** 1回の戦闘。duration の間、決まった時刻に敵の群れが現れる。一戦はおよそ3分半 */
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
    description: '三分半、夜明けまで持ちこたえる。屍喰いの群れに、煤吹き・錆鎧・油袋・鐘守が混じって来る。夜は闇と呪いが強まる',
    duration: 210 * SEC,
    weather: 'night',
    waves: [
      { at: 0, spawn: [{ enemy: 'ghoul', count: 4 }] },
      { at: 18 * SEC, spawn: [{ enemy: 'ghoul', count: 3 }, { enemy: 'sootSpitter', count: 1 }] },
      { at: 35 * SEC, spawn: [{ enemy: 'rustKnight', count: 1 }, { enemy: 'ghoul', count: 2 }] },
      { at: 56 * SEC, spawn: [{ enemy: 'oilBloat', count: 2 }, { enemy: 'sootSpitter', count: 1 }] },
      { at: 77 * SEC, spawn: [{ enemy: 'bellKeeper', count: 1 }, { enemy: 'ghoul', count: 4 }] },
      { at: 98 * SEC, spawn: [{ enemy: 'rustKnight', count: 1 }, { enemy: 'sootSpitter', count: 2 }] },
      { at: 119 * SEC, spawn: [{ enemy: 'oilBloat', count: 1 }, { enemy: 'ghoul', count: 6 }] },
      { at: 140 * SEC, spawn: [{ enemy: 'bellKeeper', count: 1 }, { enemy: 'rustKnight', count: 1 }, { enemy: 'sootSpitter', count: 1 }] },
      { at: 161 * SEC, spawn: [{ enemy: 'ghoul', count: 5 }, { enemy: 'oilBloat', count: 2 }] },
      { at: 182 * SEC, spawn: [{ enemy: 'rustKnight', count: 2 }, { enemy: 'bellKeeper', count: 1 }, { enemy: 'sootSpitter', count: 2 }] },
    ],
  },
  fogVigil: {
    name: '霧の墓守り',
    description: '霧の墓地で三分半。屍術師が死体を起こし、影潜みが背後を狙い、巣袋が屍喰いを産む。死体は灰で崩せば起こされない',
    duration: 210 * SEC,
    weather: 'fog',
    waves: [
      { at: 0, spawn: [{ enemy: 'ghoul', count: 5 }] },
      { at: 14 * SEC, spawn: [{ enemy: 'corpseCaller', count: 1 }, { enemy: 'ghoul', count: 3 }] },
      { at: 31 * SEC, spawn: [{ enemy: 'shadowStalker', count: 2 }] },
      { at: 52 * SEC, spawn: [{ enemy: 'broodSac', count: 1 }, { enemy: 'thornHusk', count: 1 }] },
      { at: 74 * SEC, spawn: [{ enemy: 'corpseCaller', count: 1 }, { enemy: 'ghoul', count: 6 }] },
      { at: 94 * SEC, spawn: [{ enemy: 'thornHusk', count: 2 }, { enemy: 'shadowStalker', count: 1 }] },
      { at: 115 * SEC, spawn: [{ enemy: 'broodSac', count: 1 }, { enemy: 'corpseCaller', count: 1 }] },
      { at: 136 * SEC, spawn: [{ enemy: 'shadowStalker', count: 2 }, { enemy: 'ghoul', count: 6 }] },
      { at: 161 * SEC, spawn: [{ enemy: 'thornHusk', count: 2 }, { enemy: 'corpseCaller', count: 2 }] },
      { at: 182 * SEC, spawn: [{ enemy: 'broodSac', count: 2 }, { enemy: 'shadowStalker', count: 2 }] },
    ],
  },
  plagueMarch: {
    name: '疫病の行軍',
    description: '風の止んだ街道で三分半。疫病の運び手が仲間を癒し、宣告者が死を告げ、黙りの修道士が作戦を封じる。癒しは腐らせて傷に変える',
    duration: 210 * SEC,
    weather: 'calm',
    waves: [
      { at: 0, spawn: [{ enemy: 'bloodZealot', count: 2 }, { enemy: 'ghoul', count: 3 }] },
      { at: 18 * SEC, spawn: [{ enemy: 'plagueCarrier', count: 1 }, { enemy: 'rustKnight', count: 1 }] },
      { at: 38 * SEC, spawn: [{ enemy: 'doomHerald', count: 1 }, { enemy: 'bloodZealot', count: 1 }] },
      { at: 59 * SEC, spawn: [{ enemy: 'hushMonk', count: 1 }, { enemy: 'ghoul', count: 5 }] },
      { at: 80 * SEC, spawn: [{ enemy: 'frostWitch', count: 2 }, { enemy: 'plagueCarrier', count: 1 }] },
      { at: 102 * SEC, spawn: [{ enemy: 'rustKnight', count: 1 }, { enemy: 'doomHerald', count: 1 }, { enemy: 'bloodZealot', count: 1 }] },
      { at: 122 * SEC, spawn: [{ enemy: 'hushMonk', count: 1 }, { enemy: 'frostWitch', count: 1 }, { enemy: 'ghoul', count: 4 }] },
      { at: 144 * SEC, spawn: [{ enemy: 'plagueCarrier', count: 2 }, { enemy: 'bloodZealot', count: 2 }] },
      { at: 164 * SEC, spawn: [{ enemy: 'doomHerald', count: 2 }, { enemy: 'rustKnight', count: 1 }] },
      { at: 186 * SEC, spawn: [{ enemy: 'hushMonk', count: 1 }, { enemy: 'plagueCarrier', count: 1 }, { enemy: 'frostWitch', count: 1 }, { enemy: 'bloodZealot', count: 2 }] },
    ],
  },
} as const satisfies Record<string, EncounterDef>;

export type EncounterId = keyof typeof ENCOUNTERS;
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS) as EncounterId[];

export function encounterDef(id: EncounterId): EncounterDef {
  return ENCOUNTERS[id];
}
