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
  ember: { name: '熾り', description: '火で燃え立つ', max: 5, duration: 8000, color: 0xff7a2e },
  edge: { name: '研ぎ', description: '刃を重ねて研ぎ澄ます', max: 5, duration: 8000, color: 0xd8d0c0 },
  blood: { name: '血潮', description: '流した血と浴びた血', max: 5, duration: 8000, color: 0xc8323c },
  stillness: { name: '静寂', description: '足を止め、息を殺す', max: 5, duration: 8000, color: 0x8aa0c8 },
  prayer: { name: '祈り', description: '儀式の残り香', max: 5, duration: 8000, color: 0xe8d8a8 },
} as const satisfies Record<string, MarkDef>;

export type MarkId = keyof typeof MARKS;
export const MARK_IDS = Object.keys(MARKS) as MarkId[];

export function markDef(id: MarkId): MarkDef {
  return MARKS[id];
}
