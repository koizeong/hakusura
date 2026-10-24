export interface ElementDef {
  name: string;
  /** ダメージ表示の色 */
  color: number;
  tags: readonly string[];
  /** 武器の名前の前に付ける(「雷の」)。斬は付けない */
  weaponPrefix: string;
  /** この属性の武器が求める能力値 */
  weaponNeeds?: Partial<Record<'str' | 'dex' | 'int' | 'fai' | 'vit', number>>;
}

/** 属性。1件足せば型と画面の切り替えに反映される */
export const ELEMENTS = {
  slash: { name: '斬', color: 0xe6dccb, tags: ['physical'], weaponPrefix: '' },
  fire: { name: '火', color: 0xff7a2e, tags: ['magic'], weaponPrefix: '熾火の', weaponNeeds: { fai: 10 } },
  lightning: { name: '雷', color: 0x7fd4ff, tags: ['magic'], weaponPrefix: '雷の', weaponNeeds: { int: 10 } },
} as const satisfies Record<string, ElementDef>;

export type ElementId = keyof typeof ELEMENTS;
export const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];
