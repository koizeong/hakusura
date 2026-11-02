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
  ember: { name: '熾り', description: '火で燃え立つ', max: 1000, duration: 8000, color: 0xff7a2e },
  edge: { name: '研ぎ', description: '刃を重ねて研ぎ澄ます', max: 1000, duration: 8000, color: 0xd8d0c0 },
  blood: { name: '血潮', description: '流した血と浴びた血', max: 1000, duration: 8000, color: 0xc8323c },
  stillness: { name: '静寂', description: '足を止め、息を殺す', max: 1000, duration: 8000, color: 0x8aa0c8 },
  prayer: { name: '祈り', description: '儀式の残り香', max: 1000, duration: 8000, color: 0xe8d8a8 },
} as const satisfies Record<string, MarkDef>;

/**
 * 印の決まり。印は1000まで溜まり(印を重く使う大技のため)、8秒得なければ全て消える。
 * 「印1つにつき」の札が数えるのは perMarkCap まで(100溜めても暴れないように)
 * 敵の攻撃の直撃を受けると、持っている印をそれぞれ hurtBase + 受けた傷/最大HP の割合(hurtMax まで)失う。避ける・防ぐほど印が残る
 * 溜め始めは遅く、溜まるほど速い:札から得る数は(技が自分で溜める分は、技の数字どおり) (swellBase + 今の数 / swell) 倍(0では半分、50で等倍、150で2倍、1000で10.5倍)。
 * 一戦の初めにエンジンが回り出すまでの間を作り、回り出せば大技まで加速する
 */
export const MARK_RULES = { perMarkCap: 10, swellBase: 0.5, swell: 100, hurtBase: 0.1, hurtMax: 0.5 } as const;

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

/**
 * 技と印の結びつき。基本の技(斬りつけ・薙ぎ払い・射撃・牽制射)のほかは、どれも印を「溜める」「保つ」「使う」:
 * - 溜める(markGain):当てると印を得る(儀式・塗油は使うと得る)。威力はそのまま
 * - 保つ(markHold):印が min 以上ある間だけ出せる。印は減らない。威力は 1 + holdPerMark × min 倍
 * - 使う(markCost):使うときに印を消費する。威力の合計に、印の技(markArtPower)の spendShare 割を足す
 * 条件がきついほど見返りが大きい。印の技(タグ mark)は威力を自分で持つので、この足し算はしない
 */
export const MARK_SKILL = { holdPerMark: 0.06, spendShare: 0.5 } as const;

/** 印を保つ技の威力の倍率 */
export function holdPower(min: number): number {
  return 1 + MARK_SKILL.holdPerMark * min;
}

/** 印を使う技が足す威力(合計) */
export function spendBonus(cost: number): number {
  return MARK_SKILL.spendShare * markArtPower(cost);
}
