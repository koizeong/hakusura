import type { Modifier } from '../rules';

/**
 * 能力値。キャラの基礎の強さで、レベルが上がるたびに得る点数を振って上げる。振り直しはできない。
 * あくまで基礎値なので、効き目はビルドより小さく抑える。
 * 武器と技は必要な能力値を持ち、足りなくても使えるが威力などが落ちる
 */
export const ATTRIBUTES = {
  str: { name: '筋力', description: '近攻撃が強くなる。重い武器や叩き割りに要る' },
  dex: { name: '技量', description: '攻撃の間隔が縮む。細い武器や突き・連射に要る' },
  int: { name: '理力', description: '雷が強くなる。雷の技や祈りに要る' },
  fai: { name: '信仰', description: '火が強くなる。火の技や塗油に要る' },
  vit: { name: '体力', description: '最大HPが増える' },
} as const;

export type AttributeId = keyof typeof ATTRIBUTES;
export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES) as AttributeId[];
export type Attributes = Record<AttributeId, number>;
export type AttributeNeeds = Partial<Attributes>;

export const ATTRIBUTE_RULES = {
  /** どの能力値もここから始まる */
  base: 8,
  /** レベルの上限 */
  maxLevel: 50,
  /** Lv1で振れる点数と、1レベル上がるごとに増える点数。Lv50で 3 + 49 = 52点 */
  startPoints: 3,
  pointsPerLevel: 1,
  /** 次のレベルまでの経験値は expBase × レベル^expPower。Lv50まで合わせて約14万 */
  expBase: 40,
  expPower: 1.3,
  /** 基礎から1点上げるごとの効き目。全てを1つに振ってもビルドより小さく効く程度 */
  meleePerStr: 0.012,
  /** 技量1点ごとに攻撃の間隔をこの倍率にする(重ねるほど縮み方が鈍る) */
  intervalPerDex: 0.994,
  lightningPerInt: 0.015,
  firePerFai: 0.015,
  hpPerVit: 0.02,
  /** 足りない1点ごとに、威力が下がる割合と、攻撃の間隔が延びる割合 */
  powerPerMissing: 0.08,
  intervalPerMissing: 0.04,
} as const;

export function baseAttributes(): Attributes {
  return Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, ATTRIBUTE_RULES.base])) as Attributes;
}

/** 能力値が基礎値として効く補正。能力値ごとに別の種類として掛け合わさる */
export function attributeModifiers(attrs: Attributes): Modifier[] {
  const R = ATTRIBUTE_RULES;
  const up = (id: AttributeId) => attrs[id] - R.base;
  return [
    { stat: 'damage', tags: ['melee'], value: R.meleePerStr * up('str'), group: 'attribute:str' },
    { stat: 'cooldown', tags: [], value: Math.pow(R.intervalPerDex, up('dex')) - 1, group: 'attribute:dex' },
    { stat: 'damage', tags: ['lightning'], value: R.lightningPerInt * up('int'), group: 'attribute:int' },
    { stat: 'damage', tags: ['fire'], value: R.firePerFai * up('fai'), group: 'attribute:fai' },
    { stat: 'maxHp', tags: [], value: R.hpPerVit * up('vit'), group: 'attribute:vit' },
  ];
}

/** そのレベルから次のレベルまでに要る経験値 */
export function expToNext(level: number): number {
  return Math.round(ATTRIBUTE_RULES.expBase * Math.pow(level, ATTRIBUTE_RULES.expPower));
}

/** そのレベルで振れる点数の合計 */
export function pointsAtLevel(level: number): number {
  return ATTRIBUTE_RULES.startPoints + (level - 1) * ATTRIBUTE_RULES.pointsPerLevel;
}

/** 振った点数の合計 */
export function spentPoints(attrs: Attributes): number {
  return ATTRIBUTE_IDS.reduce((s, id) => s + (attrs[id] - ATTRIBUTE_RULES.base), 0);
}

/** 必要な能力値に足りない点数の合計 */
export function missingPoints(needs: AttributeNeeds | undefined, attrs: Attributes): number {
  if (!needs) return 0;
  return ATTRIBUTE_IDS.reduce((s, id) => s + Math.max(0, (needs[id] ?? 0) - attrs[id]), 0);
}

/** 足りない点数から、威力と間隔に掛ける倍率を出す。威力は 0 を下回らない */
export function shortfallPenalty(missing: number): { power: number; interval: number } {
  return {
    power: Math.max(0, 1 - ATTRIBUTE_RULES.powerPerMissing * missing),
    interval: 1 + ATTRIBUTE_RULES.intervalPerMissing * missing,
  };
}

/** 必要な能力値を言葉にする(画面に出す) */
export function needsText(needs: AttributeNeeds | undefined): string {
  if (!needs) return '';
  return ATTRIBUTE_IDS.filter((id) => needs[id]).map((id) => `${ATTRIBUTES[id].name}${needs[id]}`).join('・');
}
