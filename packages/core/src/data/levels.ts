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

/**
 * レベルの持ち味。そのレベルから、一戦の敵の全てが持つ。
 * プレイヤーを縛る掟ではなく敵の強さとして、組み上げたエンジンの得意を少しずつ削り、次のエンジンへの更新を迫る。
 * 1件足すだけで増やせる
 */
export interface LevelTrait {
  from: number;
  name: string;
  text: string;
  modifiers: readonly Modifier[];
}

export const LEVEL_TRAITS = {
  rend: {
    from: 2,
    name: '印剥ぎ',
    text: '直撃で剥がす印が2倍(貯め込むほど、避けて守る腕が問われる)',
    modifiers: [{ stat: 'markRend', tags: [], value: 1, group: 'level:rend' }],
  },
  sturdy: {
    from: 3,
    name: '頑健',
    text: '状態が溜まりにくい(3割減)',
    modifiers: [{ stat: 'buildupTaken', tags: [], value: -0.3, group: 'level:sturdy' }],
  },
  swift: {
    from: 4,
    name: '俊足',
    text: '足が速い(+25%)。回り出す前に詰めてくる',
    modifiers: [{ stat: 'moveSpeed', tags: [], value: 0.25, group: 'level:swift' }],
  },
  chainBreaker: {
    from: 5,
    name: '連鎖断ち',
    text: '追撃・連鎖・増えるヒットの傷が4割減(1発の重さで押し切れる)',
    modifiers: [
      { stat: 'damageTaken', tags: ['strike'], value: -0.4, group: 'level:chain' },
      { stat: 'damageTaken', tags: ['chain'], value: -0.4, group: 'level:chain' },
      { stat: 'damageTaken', tags: ['repeat'], value: -0.4, group: 'level:chain' },
    ],
  },
  deepRend: {
    from: 6,
    name: '深い印剥ぎ',
    text: '直撃で剥がす印がさらに増え、3倍',
    modifiers: [{ stat: 'markRend', tags: [], value: 1, group: 'level:rend' }],
  },
  steadfast: {
    from: 7,
    name: '不屈',
    text: '昏倒・凍結のような動きを止める状態が、さらに溜まりにくい(5割減)',
    modifiers: [{ stat: 'buildupTaken', tags: ['incapacitates'], value: -0.5, group: 'level:steadfast' }],
  },
} as const satisfies Record<string, LevelTrait>;

export type LevelTraitId = keyof typeof LEVEL_TRAITS;
export const LEVEL_TRAIT_IDS = Object.keys(LEVEL_TRAITS) as LevelTraitId[];

/** そのレベルの敵が持つ持ち味 */
export function levelTraits(level: number): LevelTraitId[] {
  return LEVEL_TRAIT_IDS.filter((id) => level >= LEVEL_TRAITS[id].from);
}

/** レベルが敵に掛ける補正値。与ダメージと技の間隔の、それぞれ別の種類と、持ち味 */
export function levelModifiers(level: number): Modifier[] {
  if (level <= 1) return [];
  return [
    { tags: [], value: levelDamage(level) - 1, group: 'level' },
    { stat: 'cooldown', tags: [], value: levelCooldown(level) - 1, group: 'level:cooldown' },
    ...levelTraits(level).flatMap((id): Modifier[] => [...(LEVEL_TRAITS[id] as LevelTrait).modifiers]),
  ];
}
