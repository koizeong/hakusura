/**
 * 能力値。武器と技は必要な能力値を持ち、足りなくても使えるが威力などが落ちる。
 * 振り直しは無料で、ビルドごとに持つ
 */
export const ATTRIBUTES = {
  str: { name: '筋力', description: '重い武器や叩き割りに要る' },
  dex: { name: '技量', description: '細い武器や突き・連射に要る' },
  int: { name: '理力', description: '雷の技や祈りに要る' },
  fai: { name: '信仰', description: '火の技や塗油に要る' },
  vit: { name: '体力', description: '1上げるごとに最大HP+3%' },
} as const;

export type AttributeId = keyof typeof ATTRIBUTES;
export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES) as AttributeId[];
export type Attributes = Record<AttributeId, number>;
export type AttributeNeeds = Partial<Attributes>;

export const ATTRIBUTE_RULES = {
  /** どの能力値もここから始まる */
  base: 8,
  /** 自由に振れる点数 */
  points: 40,
  /** 体力1につき最大HP */
  hpPerVit: 0.03,
  /** 足りない1点ごとに、威力が下がる割合と、攻撃の間隔が延びる割合 */
  powerPerMissing: 0.08,
  intervalPerMissing: 0.04,
} as const;

export function baseAttributes(): Attributes {
  return Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, ATTRIBUTE_RULES.base])) as Attributes;
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
