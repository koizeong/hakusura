/**
 * 印。自分に溜まる少数の語彙。条件文は印を「生む」「変える」「使う」の役割に分かれ、
 * 生む札と使う札を揃えて初めて働く(カードゲームのデッキ構築のように)。
 * 最大 max まで溜まり、最後に得てから duration の間に得なければ全て消える。1件足すだけで増やせる
 */
export interface MarkDef {
  name: string;
  description: string;
  max: number;
  duration: number;
  color: number;
}

export const MARKS = {
  ember: { name: '熾り', description: '火で燃え立つ', max: 100, duration: 8000, color: 0xff7a2e },
  edge: { name: '研ぎ', description: '刃を重ねて研ぎ澄ます', max: 100, duration: 8000, color: 0xd8d0c0 },
  blood: { name: '血潮', description: '流した血と浴びた血', max: 100, duration: 8000, color: 0xc8323c },
  stillness: { name: '静寂', description: '足を止め、息を殺す', max: 100, duration: 8000, color: 0x8aa0c8 },
  prayer: { name: '祈り', description: '儀式の残り香', max: 100, duration: 8000, color: 0xe8d8a8 },
} as const satisfies Record<string, MarkDef>;

/**
 * 印の決まり。印は100まで溜まり(印を重く使う大技のため)、8秒得なければ全て消える。
 * 「印1つにつき」の札が数えるのは perMarkCap まで(100溜めても暴れないように)
 * 溜まるほど溜まりやすい:得る数は (1 + 今の数 / swell) 倍(swell 30 なら、30溜めて2倍、90で4倍)。大技を貯める間が延びすぎないように
 */
export const MARK_RULES = { perMarkCap: 10, swell: 30 } as const;

/**
 * 印の技の威力。消費する印の数 cost に対して、威力(武器の威力に掛ける倍率の合計)は base × cost^exponent。
 * 消費が多いほど急に伸び、印1つあたりの効き目も上がる(5で約18倍、15で約74倍、40で約266倍、100で約876倍)
 */
export const MARK_ART = { base: 2.2, exponent: 1.3 } as const;

/** 印の技の威力の合計 */
export function markArtPower(cost: number): number {
  return MARK_ART.base * cost ** MARK_ART.exponent;
}

export type MarkId = keyof typeof MARKS;
export const MARK_IDS = Object.keys(MARKS) as MarkId[];

export function markDef(id: MarkId): MarkDef {
  return MARKS[id];
}
