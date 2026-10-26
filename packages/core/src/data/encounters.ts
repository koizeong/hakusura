import type { ElementId } from './elements';
import type { EnemyId } from './enemies';
import type { AffixId, EquipKind } from './equipment';
import type { FieldId } from './fields';

/**
 * 一戦を終えたときの持ち帰り。大物を討てば全て、時間切れ(大物が去った)なら partial の割合だけ。
 * 装備の数・経験値はその割合で減り、スキル・型・変化つきの技は確率に割合が掛かる
 */
export interface EncounterReward {
  exp: number;
  items: number;
  /** 装備に条件文が付く確率 */
  conditionChance: number;
  itemKinds?: readonly EquipKind[];
  preferElements?: readonly ElementId[];
  preferAffixes?: readonly AffixId[];
  /** まだ覚えていないスキルを見つける確率 */
  skillChance: number;
  /** まだ知らない型の書を見つける確率 */
  formChance: number;
  /** 変化つきの技の数 */
  variants: number;
  /** 時間切れで終えたときに持ち帰る割合 */
  partial: number;
}

/** 1回の戦闘。duration の間、決まった時刻に敵の群れが現れる。一戦はおよそ3分半 */
export interface EncounterDef {
  name: string;
  description: string;
  /** 戦う時間(ミリ秒)。過ぎれば生き延びたことになる */
  duration: number;
  /** 戦う間の天候 */
  weather?: FieldId;
  waves: readonly { at: number; spawn: readonly { enemy: EnemyId; count: number }[] }[];
  /** 大物の一戦。この敵を討てば終わり、時間まで討てなければ去っていく */
  boss?: EnemyId;
  reward?: EncounterReward;
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
  ashWyvern: {
    name: '灰翼の巣',
    description:
      '灰の峰の巣で、灰翼の飛竜と一対一。三分半のうちに討てば多くを持ち帰る。飛べば近攻撃は届かず、炎は雨で鈍る。討てなければ飛竜は去り、得る物は僅か',
    duration: 210 * SEC,
    waves: [{ at: 0, spawn: [{ enemy: 'wyvern', count: 1 }] }],
    boss: 'wyvern',
    reward: {
      exp: 1500,
      items: 6,
      conditionChance: 0.6,
      itemKinds: ['weapon', 'armor', 'armor', 'accessory'],
      preferElements: ['fire', 'ash', 'slash'],
      preferAffixes: ['fireDamage', 'ashDamage', 'damageTaken', 'maxHp', 'rangedDamage'],
      skillChance: 0.6,
      formChance: 0.5,
      variants: 1,
      partial: 0.25,
    },
  },
} as const satisfies Record<string, EncounterDef>;

export type EncounterId = keyof typeof ENCOUNTERS;
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS) as EncounterId[];

export function encounterDef(id: EncounterId): EncounterDef {
  return ENCOUNTERS[id];
}
