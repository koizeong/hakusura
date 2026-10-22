export interface ElementDef {
  name: string;
  /** ダメージ表示の色 */
  color: number;
  tags: readonly string[];
}

/** 属性。1件足せば型と画面の切り替えに反映される */
export const ELEMENTS = {
  slash: { name: '斬', color: 0xe6dccb, tags: ['physical'] },
  fire: { name: '火', color: 0xff7a2e, tags: ['magic'] },
  lightning: { name: '雷', color: 0x7fd4ff, tags: ['magic'] },
} as const satisfies Record<string, ElementDef>;

export type ElementId = keyof typeof ELEMENTS;
export const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];
