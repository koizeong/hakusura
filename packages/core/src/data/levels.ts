import type { Modifier } from '../rules';

/**
 * 敵のレベル。一戦を討ち果たすたびに、その一戦のレベルが1つ上がり、敵が凶悪になる。
 * 補正値は大きいままキャラがインフレするので、敵もレベルで同じようにインフレさせる
 */
export const LEVEL_RULES = {
  /** レベル1つごとの体力の倍率 */
  hp: 1.35,
  /** レベル1つごとの与ダメージの倍率 */
  damage: 1.2,
  /** レベル1つごとに技の間隔が縮む割合 */
  cooldown: 0.03,
  /** 技の間隔はこれより縮まない */
  cooldownFloor: 0.6,
  /** レベル1つごとの持ち帰り(経験値・装備の数)の倍率 */
  reward: 1.25,
  /** レベル1つごとに条件文の付く確率が増える分 */
  conditionChance: 0.05,
} as const;

/** レベルの体力の倍率 */
export function levelHp(level: number): number {
  return LEVEL_RULES.hp ** Math.max(0, level - 1);
}

/** レベルの与ダメージの倍率 */
export function levelDamage(level: number): number {
  return LEVEL_RULES.damage ** Math.max(0, level - 1);
}

/** レベルの技の間隔の倍率 */
export function levelCooldown(level: number): number {
  return Math.max(LEVEL_RULES.cooldownFloor, 1 - LEVEL_RULES.cooldown * Math.max(0, level - 1));
}

/** レベルの持ち帰りの倍率 */
export function levelReward(level: number): number {
  return LEVEL_RULES.reward ** Math.max(0, level - 1);
}

/** レベルが敵に掛ける補正値。与ダメージと技の間隔の、それぞれ別の種類 */
export function levelModifiers(level: number): Modifier[] {
  if (level <= 1) return [];
  return [
    { tags: [], value: levelDamage(level) - 1, group: 'level' },
    { stat: 'cooldown', tags: [], value: levelCooldown(level) - 1, group: 'level:cooldown' },
  ];
}
