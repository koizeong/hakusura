import { FORMS, FORM_IDS } from './forms';
import { LINK_LABELS } from './links';

/**
 * コンボ。ヒットに関わったルールのラベルやタグが揃うと成立し、戦闘中に名前を出す。
 * labels は相互作用・条件文・パッシブ・見返りのラベル、tags はヒットのタグ。どちらも全て揃って成立する
 */
export interface ComboDef {
  name: string;
  labels?: readonly string[];
  tags?: readonly string[];
  color: number;
}

const BASIC = {
  thunderRain: { name: '雷雨', labels: ['濡れで倍'], color: 0x7fd4ff },
  chainShock: { name: '連鎖', tags: ['shock', 'chain'], color: 0xb8e8ff },
  oilFire: { name: '油火', labels: ['油で倍'], color: 0xff9a3e },
  twinFlame: { name: '炎の二撃', labels: ['炎への二撃'], color: 0xff7a2e },
  bloodThunder: { name: '血雷', labels: ['血を呼ぶ雷'], color: 0xd04a5a },
  breakStrike: { name: '崩し打ち', labels: ['昏倒に追撃'], color: 0xd8c25a },
  readStrike: { name: '見切り斬り', labels: ['見切り'], color: 0x9fc4e8 },
  rainBlade: { name: '雨垂れ', labels: ['雨垂れの刃'], color: 0x4a7fb5 },
  selfImmolation: { name: '身を焼く', labels: ['油染み'], color: 0xff6a2e },
  stake: { name: '火刑', labels: ['火に魅入られた者'], color: 0xe85a2e },
  runningCut: { name: '駆け斬り', labels: ['駆ける刃'], color: 0xe6dccb },
  mirror: { name: '鏡合わせ', labels: ['鏡合わせ'], color: 0xc9c2b4 },
  oddGrip: { name: '持ち替え', labels: ['持ち替えの妙'], color: 0xd8c25a },
  shatter: { name: '砕氷', labels: ['砕氷'], color: 0xa8e0f0 },
  backstab: { name: '背撃', labels: ['背後の一撃'], color: 0x8a7aaa },
  fearCut: { name: '怯え斬り', labels: ['怯えた背'], color: 0x7a8a9a },
  bindRelease: { name: '呪いの清算', tags: ['bindRelease'], color: 0x9a5ab8 },
  rotHeal: { name: '腐れ癒し', tags: ['rotHeal'], color: 0x8a9a3a },
  doomSpread: { name: '宣告の伝染', labels: ['死の宣告'], color: 0x6a3a7a },
} as const satisfies Record<string, ComboDef>;

/** 型と繋ぎも、決まればコンボとして名前を出す */
export const COMBOS: Record<string, ComboDef> = {
  ...BASIC,
  ...Object.fromEntries(FORM_IDS.map((id) => [`form:${id}`, { name: FORMS[id].name, labels: [FORMS[id].name], color: FORMS[id].color }])),
  ...Object.fromEntries(LINK_LABELS.map((label) => [`link:${label}`, { name: label.replace('繋ぎ・', '') + 'の繋ぎ', labels: [label], color: 0xe8c070 }])),
};

export type ComboId = string;
export const COMBO_IDS = Object.keys(COMBOS) as ComboId[];

export function comboDef(id: ComboId): ComboDef {
  return COMBOS[id] ?? { name: id, color: 0xffffff };
}

/** ヒットに関わったラベルとタグから、成立したコンボを返す */
export function matchCombos(labels: readonly string[], tags: ReadonlySet<string>): ComboId[] {
  return COMBO_IDS.filter((id) => {
    const def = comboDef(id);
    return (def.labels ?? []).every((l) => labels.includes(l)) && (def.tags ?? []).every((t) => tags.has(t));
  });
}
