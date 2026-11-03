import type { StatId } from './stats';
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
  /**
   * 抱えの恩恵。持っているだけで効くバフ。10・100・1000・10000で1段ずつ上がり、1段ごとに perTier。
   * 撃てば(使えば)落ち、剥がされても落ちる。補正値 markBlessing(タグに印)で強まる
   */
  blessing: { name: string; stat: StatId; tags: readonly string[]; perTier: number };
}

export const MARKS = {
  ember: { name: '熾り', description: '火で燃え立つ', max: 10000, duration: 8000, color: 0xff7a2e, blessing: { name: '与ダメージ', stat: 'damage', tags: [], perTier: 0.25 } },
  edge: { name: '研ぎ', description: '刃を重ねて研ぎ澄ます', max: 10000, duration: 8000, color: 0xd8d0c0, blessing: { name: '近攻撃のダメージ', stat: 'damage', tags: ['melee'], perTier: 0.35 } },
  blood: { name: '血潮', description: '流した血と浴びた血', max: 10000, duration: 8000, color: 0xc8323c, blessing: { name: '状態の蓄積', stat: 'buildup', tags: [], perTier: 0.35 } },
  stillness: { name: '静寂', description: '足を止め、息を殺す', max: 10000, duration: 8000, color: 0x8aa0c8, blessing: { name: '被ダメージ', stat: 'damageTaken', tags: [], perTier: -0.1 } },
  prayer: { name: '祈り', description: '儀式の残り香', max: 10000, duration: 8000, color: 0xe8d8a8, blessing: { name: 'クールダウン', stat: 'cooldown', tags: [], perTier: -0.1 } },
} as const satisfies Record<string, MarkDef>;

/**
 * 印の決まり。印は10000まで溜まり(印を重く使う大技のため)、8秒得なければ全て消える。
 * 「印1つにつき」の札が数えるのは perMarkCap まで(100溜めても暴れないように)
 * 敵の攻撃の直撃を受けると、持っている印をそれぞれ hurtBase + 受けた傷/最大HP の割合(hurtMax まで)失う。避ける・防ぐほど印が残る
 * 生成力と変換効率:札から得る印は、溜まっている量に応じて増える。生む札は得る印そのものの数、変える札・使うたびの札・名残の札は元の印の数で、
 * growthPer ごとに1倍ずつ増える(100で2倍、1000で11倍)。別の印の量で伸ばす札もある(on: 'markGrowth')。技が自分で溜める分と、外から直に足す分は数字どおり。
 * 溜め始めを抑える仕掛けは置かない(どれだけ溜まるかはビルドが決める)。
 * 一戦の初めにエンジンが回り出すまでの間を作り、回り出せば大技まで加速する
 */
export const MARK_RULES = { perMarkCap: 10, growthPer: 100, hurtBase: 0.1, hurtMax: 0.5 } as const;

/**
 * 自然に溜まる印。ビルドが関わる印(装備の印紋・条件文・覚醒・技が生む・保つ・使う印)は、every ミリ秒ごとに amount ずつ増える。
 * エンジンが回り出す前の種火(生成力は通さない)。関わらない印は増えない(飢えの札が働くように)
 */
export const MARK_NATURAL = { every: 2000, amount: 2 } as const;

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
 * - 保つ(markHold):印が min 以上ある間だけ出せる。印は減らない。威力は 1 + holdPerMark × min 倍(10で1.4倍、30で2.2倍)
 * - 使う(markCost):使うときに印を消費する。威力の合計に、印の技(markArtPower)の spendShare 割を足す
 * 条件がきついほど見返りが大きい。印の技(タグ mark)は威力を自分で持つので、この足し算はしない
 */
export const MARK_SKILL = { holdPerMark: 0.04, spendShare: 0.25 } as const;

/** 印を保つ技の威力の倍率 */
export function holdPower(min: number): number {
  return 1 + MARK_SKILL.holdPerMark * min;
}

/** 印を使う技が足す威力(合計) */
export function spendBonus(cost: number): number {
  return MARK_SKILL.spendShare * markArtPower(cost);
}

/** 抱えの恩恵の段。10・100・1000・10000で1段ずつ(0〜4) */
export function blessingTier(held: number): number {
  return held >= 10000 ? 4 : held >= 1000 ? 3 : held >= 100 ? 2 : held >= 10 ? 1 : 0;
}
