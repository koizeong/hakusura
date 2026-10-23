/**
 * 補正値が効く先。mult は (1+補正) を掛け、add は補正をそのまま足す。
 * lowerIsBetter の項目はマイナスが得になる。装備の補正値の合計では、得になる向きをプラスとして数える
 */
export interface StatDef {
  name: string;
  kind: 'mult' | 'add';
  lowerIsBetter?: boolean;
}

export const STATS = {
  damage: { name: '与ダメージ', kind: 'mult' },
  buildup: { name: '状態の蓄積', kind: 'mult' },
  maxHp: { name: '最大HP', kind: 'mult' },
  moveSpeed: { name: '移動速度', kind: 'mult' },
  damageTaken: { name: '被ダメージ', kind: 'mult', lowerIsBetter: true },
  cooldown: { name: 'クールダウン', kind: 'mult', lowerIsBetter: true },
  meleeRange: { name: '近攻撃の射程', kind: 'mult' },
  projectiles: { name: '弾の数', kind: 'add' },
} as const satisfies Record<string, StatDef>;

export type StatId = keyof typeof STATS;
export const STAT_IDS = Object.keys(STATS) as StatId[];

export function statDef(id: StatId): StatDef {
  return STATS[id];
}
