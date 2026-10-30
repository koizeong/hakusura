import type { ElementId } from './data/elements';
import type { FieldId } from './data/fields';
import type { StatusId } from './data/statuses';
import type { StatId } from './data/stats';

/**
 * 効果の発動条件。条件文・パッシブ・状態の相互作用は全てこの部品の組み合わせで書く。
 * 新しい種類を足すときは、ここと evaluatePredicate に1件ずつ足す
 */
export type Predicate =
  | { type: 'targetHas'; status: StatusId }
  | { type: 'attackerHas'; status: StatusId }
  | { type: 'weather'; weather: FieldId }
  | { type: 'hitHasTag'; tag: string }
  | { type: 'hitLacksTag'; tag: string }
  /** 攻撃者が直前に当てた属性と違う */
  | { type: 'elementChanged' }
  /** 発動・蓄積しようとしている状態 */
  | { type: 'statusIs'; status: StatusId }
  /** 攻撃者(作戦なら自分)に付与がかかっている */
  | { type: 'selfImbued' }
  /** 攻撃者(作戦なら自分)が一時的な強化を持っている */
  | { type: 'selfHasBuff'; label: string }
  | { type: 'not'; p: Predicate }
  /** 相手が min 種類以上の状態にかかっている */
  | { type: 'targetStatusCount'; min: number }
  /** 自分がかかっている状態が max 種類以下 */
  | { type: 'selfStatusCount'; max: number }
  /** 自分のHPが最大HPの min 以上(1 で満タン) */
  | { type: 'selfHpRatio'; min: number }
  /** 自分が ms ミリ秒以上動いていない */
  | { type: 'selfStill'; ms: number }
  /** 自分の狙いの締まり(同じ相手に当て続けた数)が min 以上 */
  | { type: 'selfFocus'; min: number }
  /** 相手との間(縁から縁)が min 以上 */
  | { type: 'targetFar'; min: number }
  /** 相手がその床の上にいる */
  | { type: 'targetOnFloor'; field: FieldId }
  /** 自分がそのタグを持つ(両手持ち・二刀流など) */
  | { type: 'selfHasTag'; tag: string }
  /** 自分が一度も被弾していない(倒れるか、勘定をやり直すと戻る) */
  | { type: 'selfUnhurt' }
  /** そのスキルを使った回数が n の倍数のとき(3回目ごと、など) */
  | { type: 'useEvery'; n: number }
  /** 自分の盾が張られている(砕けていない盾が1枚でもある) */
  | { type: 'selfShieldReady' }
  /** 相手の背後から攻めている */
  | { type: 'fromBehind' }
  /** 相手のその状態の蓄積が ratio 以上(発動中なら満タンとみなす) */
  | { type: 'targetBuildupAtLeast'; status: StatusId; ratio: number }
  /** 自分がその床の上にいる */
  | { type: 'selfOnFloor'; field: FieldId }
  /** 直前に使ったスキル */
  | { type: 'lastSkillWas'; skill: string }
  /** ヒットの属性 */
  | { type: 'hitElementIs'; element: ElementId }
  /**
   * 繋ぎ。このスキルの1つ前の手が、その属性・種類で、within ミリ秒以内に使ったもの。
   * 前の手はスキルを使った瞬間に決まるので、飛んでいる弾が当たるときも変わらない
   */
  | { type: 'afterStep'; element?: ElementId; category?: string; within: number; differ?: readonly ('category' | 'element')[] }
  /** 自分が宿している儀式が min 個以上(max があれば max 個以下) */
  | { type: 'selfRites'; min: number; max?: number }
  /** このヒットを出した技に、儀式を min 個以上宿していた */
  | { type: 'ritesReleased'; min: number };

export type Action =
  /** 対象の状態を消す(凍結を砕くなど) */
  | { type: 'clearStatus'; status: StatusId }
  /** 持ち主が最大HPの ratio だけ回復する。腐敗していればダメージになる */
  | { type: 'heal'; ratio: number }
  /** 同じ攻撃をもう一度当てる。power があれば、その割合の威力で。times があれば、その回数 */
  | { type: 'repeatHit'; power?: number; times?: number }
  | { type: 'applyBuildup'; status: StatusId; amount: number; to?: 'target' | 'attacker' }
  /** 対象に新しいヒットを落とす */
  | { type: 'strike'; element: ElementId; power: number; buildup: number; tags?: readonly string[] }
  /** 持ち主に一時的な強化を与える。charges 回使うか duration で消える */
  | { type: 'grantBuff'; label: string; add: number; tags: readonly string[]; duration: number; charges?: number }
  /** 受けたダメージの ratio を、攻撃してきた相手に返す(on: 'hurt' でだけ意味を持つ) */
  | { type: 'reflect'; ratio: number }
  /** 持ち主のクールダウンを ms 縮める。tags があれば、そのタグを全て持つスキルだけ */
  | { type: 'cooldown'; ms: number; tags?: readonly string[] };

interface RuleBase {
  /** 内訳や戦闘中の表示に出る名前 */
  label: string;
  when: readonly Predicate[];
}

export type Rule = RuleBase &
  (
    | /**
       * 与ダメージに加算する補正。ルールごとに別の種類として乗算される。
       * perCharge があれば、攻撃の前に歩いた距離 every ごとに add を足し、max 回まで重ねる
       */ {
        on: 'damage';
        add: number;
        perCharge?: { every: number; max: number };
      }
    | /** ヒットが当たった後 */ { on: 'hit'; do: readonly Action[] }
    | /** 状態が発動した瞬間。scale で持続と範囲を変える */ {
        on: 'statusActivate';
        do?: readonly Action[];
        scale?: { duration?: number; radius?: number };
      }
    | /** 状態の蓄積を止める。発動中なら消す */ { on: 'buildup'; block: true }
    | /** ジャスト回避・ジャストガードしたとき。盾が砕けたときも。対象は攻撃してきた者 */ {
        on: 'justDodge' | 'justGuard' | 'shieldBreak';
        do: readonly Action[];
      }
    | /** 条件つきの補正値。tags があれば、そのタグを全て持つときだけ効く */ {
        on: 'stat';
        stat: StatId;
        add: number;
        tags?: readonly string[];
      }
    | /** 攻撃を受けた後。対象は攻撃してきた者 */ { on: 'hurt'; do: readonly Action[] }
    | /** 1回の攻撃で min 体以上に当てたとき。対象は自分 */ { on: 'multiHit'; min: number; do: readonly Action[] }
    | /** 近攻撃・周りに放つ技が、誰にも当たらなかったとき。対象は自分(技に付くルールだけ) */ { on: 'miss'; do: readonly Action[] }
    | /** スキルの直撃を受ける直前。chance の確率でジャスト回避・ジャストガードしたことにする */ {
        on: 'incoming';
        chance: number;
        as: 'justDodge' | 'justGuard';
      }
  );

/**
 * 補正値。stat(既定は与ダメージ)に効き、tags を全て持つものにだけ効く。
 * 同じ group 同士は加算、違う group は乗算。group を省くと、stat と tags が同じものを同じ種類とみなす
 */
export interface Modifier {
  stat?: StatId;
  tags: readonly string[];
  value: number;
  group?: string;
}

export function modifierGroup(mod: Modifier): string {
  return mod.group ?? `${mod.stat ?? 'damage'}:${[...mod.tags].sort().join('+')}`;
}

export interface PredicateContext {
  targetHas(status: StatusId): boolean;
  attackerHas(status: StatusId): boolean;
  weather: FieldId | null;
  hitTags?: ReadonlySet<string>;
  hitElement?: ElementId;
  attackerLastElement?: ElementId;
  status?: StatusId;
  attackerImbued?: boolean;
  attackerHasBuff?(label: string): boolean;
  targetStatusCount?(): number;
  attackerStatusCount?(): number;
  attackerHpRatio?: number;
  attackerStillFor?: number;
  attackerFocus?: number;
  targetGap?: number;
  targetOnFloor?(field: FieldId): boolean;
  attackerTags?: readonly string[];
  attackerUnhurt?: boolean;
  attackerShieldReady?: boolean;
  fromBehind?: boolean;
  targetBuildup?(status: StatusId): number;
  attackerOnFloor?(field: FieldId): boolean;
  attackerLastSkill?: string;
  useIndex?: number;
  /** このヒットを出したスキルの、1つ前の手と、その間(ミリ秒) */
  prevStep?: { element?: ElementId; category: string; gap: number };
  attackerRites?: number;
  ritesReleased?: number;
}

export function evaluatePredicate(p: Predicate, ctx: PredicateContext): boolean {
  switch (p.type) {
    case 'targetHas':
      return ctx.targetHas(p.status);
    case 'attackerHas':
      return ctx.attackerHas(p.status);
    case 'weather':
      return ctx.weather === p.weather;
    case 'hitHasTag':
      return ctx.hitTags?.has(p.tag) ?? false;
    case 'hitLacksTag':
      return !(ctx.hitTags?.has(p.tag) ?? false);
    case 'elementChanged':
      return ctx.attackerLastElement !== undefined && ctx.hitElement !== undefined && ctx.attackerLastElement !== ctx.hitElement;
    case 'statusIs':
      return ctx.status === p.status;
    case 'selfImbued':
      return ctx.attackerImbued ?? false;
    case 'selfHasBuff':
      return ctx.attackerHasBuff?.(p.label) ?? false;
    case 'not':
      return !evaluatePredicate(p.p, ctx);
    case 'targetStatusCount':
      return (ctx.targetStatusCount?.() ?? 0) >= p.min;
    case 'selfStatusCount':
      return (ctx.attackerStatusCount?.() ?? 0) <= p.max;
    case 'selfHpRatio':
      return (ctx.attackerHpRatio ?? 0) >= p.min;
    case 'selfStill':
      return (ctx.attackerStillFor ?? 0) >= p.ms;
    case 'selfFocus':
      return (ctx.attackerFocus ?? 0) >= p.min;
    case 'targetFar':
      return (ctx.targetGap ?? 0) >= p.min;
    case 'targetOnFloor':
      return ctx.targetOnFloor?.(p.field) ?? false;
    case 'selfHasTag':
      return ctx.attackerTags?.includes(p.tag) ?? false;
    case 'selfUnhurt':
      return ctx.attackerUnhurt ?? false;
    case 'useEvery':
      return ctx.useIndex !== undefined && ctx.useIndex % p.n === 0;
    case 'selfShieldReady':
      return ctx.attackerShieldReady ?? false;
    case 'fromBehind':
      return ctx.fromBehind ?? false;
    case 'targetBuildupAtLeast':
      return (ctx.targetBuildup?.(p.status) ?? 0) >= p.ratio;
    case 'selfOnFloor':
      return ctx.attackerOnFloor?.(p.field) ?? false;
    case 'lastSkillWas':
      return ctx.attackerLastSkill === p.skill;
    case 'hitElementIs':
      return ctx.hitElement === p.element;
    case 'selfRites': {
      const n = ctx.attackerRites ?? 0;
      return n >= p.min && (p.max === undefined || n <= p.max);
    }
    case 'ritesReleased':
      return (ctx.ritesReleased ?? 0) >= p.min;
    case 'afterStep': {
      const prev = ctx.prevStep;
      if (!prev || prev.gap > p.within) return false;
      if ((p.element !== undefined && prev.element !== p.element) || (p.category !== undefined && prev.category !== p.category)) return false;
      // 前の手と今のヒットで、違っていなければならないもの
      if (p.differ?.includes('category') && ctx.hitTags?.has(prev.category)) return false;
      if (p.differ?.includes('element') && prev.element !== undefined && prev.element === ctx.hitElement) return false;
      return true;
    }
  }
}

export function ruleMatches(rule: Rule, ctx: PredicateContext): boolean {
  return rule.when.every((p) => evaluatePredicate(p, ctx));
}
