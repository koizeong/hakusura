import { modifierGroup, type Modifier } from './rules';

/** ルールから来た補正。ルールごとに別の種類として扱う */
export interface RuleBonus {
  label: string;
  add: number;
}

export interface DamageInput {
  power: number;
  hitTags: ReadonlySet<string>;
  modifiers: readonly Modifier[];
  ruleBonuses: readonly RuleBonus[];
  /** 0.5 で半減、-0.5 で1.5倍。上限は設けない */
  resist: number;
}

/**
 * ダメージを計算する。同じ種類の補正は加算し、種類どうしは乗算する。
 * 例:火+30% と 火+20% は 1.5倍、火+30% と 近接+20% は 1.3×1.2倍
 */
export function computeDamage(input: DamageInput): number {
  const groups = new Map<string, number>();
  for (const mod of input.modifiers) {
    if (!mod.tags.every((t) => input.hitTags.has(t))) continue;
    const key = modifierGroup(mod);
    groups.set(key, (groups.get(key) ?? 0) + mod.value);
  }
  for (const bonus of input.ruleBonuses) {
    const key = `rule:${bonus.label}`;
    groups.set(key, (groups.get(key) ?? 0) + bonus.add);
  }
  let multiplier = 1;
  for (const sum of groups.values()) multiplier *= 1 + sum;
  return Math.max(0, input.power * multiplier * (1 - input.resist));
}
