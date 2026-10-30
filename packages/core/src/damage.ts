import { modifierGroup, type Modifier } from './rules';

/** ルールから来た補正。ルールごとに別の種類として扱う */
export interface RuleBonus {
  label: string;
  add: number;
  /** 同じ種類として足し合わせる組。なければ label ごとに別の種類 */
  group?: string;
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
  return Math.max(0, input.power * multiplierOf(input.modifiers, input.ruleBonuses, input.hitTags) * (1 - input.resist));
}

/**
 * 補正の倍率。同じ種類は加算してから (1+合計) を作り、種類どうしは掛ける。
 * 負にはならない(-100% を下回る種類があれば 0 倍)
 */
export function multiplierOf(modifiers: readonly Modifier[], ruleBonuses: readonly RuleBonus[], tags: ReadonlySet<string>): number {
  const groups = new Map<string, number>();
  for (const mod of modifiers) {
    if (!mod.tags.every((t) => tags.has(t))) continue;
    const key = modifierGroup(mod);
    groups.set(key, (groups.get(key) ?? 0) + mod.value);
  }
  for (const bonus of ruleBonuses) {
    const key = `rule:${bonus.group ?? bonus.label}`;
    groups.set(key, (groups.get(key) ?? 0) + bonus.add);
  }
  let multiplier = 1;
  for (const sum of groups.values()) multiplier *= Math.max(0, 1 + sum);
  return multiplier;
}
