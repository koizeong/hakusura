import type { ElementId } from './data/elements';
import type { FieldId } from './data/fields';
import type { StatusId } from './data/statuses';

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
  | { type: 'statusIs'; status: StatusId };

export type Action =
  /** 同じ攻撃をもう一度当てる */
  | { type: 'repeatHit' }
  | { type: 'applyBuildup'; status: StatusId; amount: number; to?: 'target' | 'attacker' }
  /** 対象に新しいヒットを落とす */
  | { type: 'strike'; element: ElementId; power: number; buildup: number; tags?: readonly string[] };

interface RuleBase {
  /** 内訳や戦闘中の表示に出る名前 */
  label: string;
  when: readonly Predicate[];
}

export type Rule = RuleBase &
  (
    | /** 与ダメージに加算する補正。ルールごとに別の種類として乗算される */ { on: 'damage'; add: number }
    | /** ヒットが当たった後 */ { on: 'hit'; do: readonly Action[] }
    | /** 状態が発動した瞬間。scale で持続と範囲を変える */ {
        on: 'statusActivate';
        do?: readonly Action[];
        scale?: { duration?: number; radius?: number };
      }
    | /** 状態の蓄積を止める。発動中なら消す */ { on: 'buildup'; block: true }
  );

/** 補正値。tags を全て持つヒットに効く。同じ group 同士は加算、違う group は乗算 */
export interface Modifier {
  tags: readonly string[];
  value: number;
  group?: string;
}

export function modifierGroup(mod: Modifier): string {
  return mod.group ?? `tags:${[...mod.tags].sort().join('+')}`;
}

export interface PredicateContext {
  targetHas(status: StatusId): boolean;
  attackerHas(status: StatusId): boolean;
  weather: FieldId | null;
  hitTags?: ReadonlySet<string>;
  hitElement?: ElementId;
  attackerLastElement?: ElementId;
  status?: StatusId;
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
  }
}

export function ruleMatches(rule: Rule, ctx: PredicateContext): boolean {
  return rule.when.every((p) => evaluatePredicate(p, ctx));
}
