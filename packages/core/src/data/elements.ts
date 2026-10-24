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
  blunt: { name: '打', color: 0xc8a878, tags: ['physical'], weaponPrefix: '砕きの', weaponNeeds: { str: 10 } },
  pierce: { name: '刺', color: 0xd8d0b8, tags: ['physical'], weaponPrefix: '穿ちの', weaponNeeds: { dex: 10 } },
  fire: { name: '火', color: 0xff7a2e, tags: ['magic'], weaponPrefix: '熾火の', weaponNeeds: { fai: 10 } },
  lightning: { name: '雷', color: 0x7fd4ff, tags: ['magic'], weaponPrefix: '雷の', weaponNeeds: { int: 10 } },
  rot: { name: '腐', color: 0x8a9a3a, tags: ['magic'], weaponPrefix: '腐れの', weaponNeeds: { fai: 10 } },
  curse: { name: '呪', color: 0x9a5ab8, tags: ['magic'], weaponPrefix: '呪いの', weaponNeeds: { int: 10 } },
  ice: { name: '氷', color: 0xa8e0f0, tags: ['magic'], weaponPrefix: '凍てつく', weaponNeeds: { int: 10 } },
  dark: { name: '闇', color: 0x6a5a8a, tags: ['magic'], weaponPrefix: '闇の', weaponNeeds: { int: 10 } },
  ash: { name: '灰', color: 0x9a9088, tags: ['magic'], weaponPrefix: '灰の', weaponNeeds: { fai: 10 } },
  blood: { name: '血', color: 0xc8323c, tags: ['magic'], weaponPrefix: '血の', weaponNeeds: { vit: 10 } },
} as const satisfies Record<string, ElementDef>;

export type ElementId = keyof typeof ELEMENTS;
export const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];
