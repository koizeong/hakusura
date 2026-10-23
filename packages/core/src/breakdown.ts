import type { ElementId } from './data/elements';
import { COMBOS, type ComboId } from './data/combos';
import type { DamageRecord } from './world';

export interface BreakdownRow {
  key: string;
  damage: number;
  hits: number;
  /** 合計に対する割合(0〜1) */
  share: number;
  dps: number;
}

export interface Breakdown {
  total: number;
  hits: number;
  /** 秒 */
  duration: number;
  dps: number;
  bySkill: BreakdownRow[];
  bySource: BreakdownRow[];
  byElement: (BreakdownRow & { element: ElementId })[];
  /** 条件文・パッシブが関わったヒットの合計。1ヒットが複数に数えられることがある */
  byVia: BreakdownRow[];
  /** コンボが成立したヒットの合計 */
  byCombo: (BreakdownRow & { combo: ComboId })[];
}

/** 与ダメージの内訳。records は集計したいものだけに絞って渡す */
export function summarize(records: readonly DamageRecord[], now: number): Breakdown {
  const first = records[0]?.time ?? now;
  const duration = Math.max(1, (now - first) / 1000);
  const total = records.reduce((s, r) => s + r.amount, 0);

  const group = (keyOf: (r: DamageRecord) => string[]): BreakdownRow[] => {
    const map = new Map<string, { damage: number; hits: number }>();
    for (const r of records) {
      for (const key of keyOf(r)) {
        const row = map.get(key) ?? { damage: 0, hits: 0 };
        row.damage += r.amount;
        row.hits += 1;
        map.set(key, row);
      }
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v, share: total > 0 ? v.damage / total : 0, dps: v.damage / duration }))
      .sort((a, b) => b.damage - a.damage);
  };

  return {
    total,
    hits: records.length,
    duration,
    dps: total / duration,
    bySkill: group((r) => [r.skill]),
    bySource: group((r) => [r.source]),
    byElement: group((r) => [r.element]).map((row) => ({ ...row, element: row.key as ElementId })),
    byVia: group((r) => r.via),
    byCombo: group((r) => r.combos).map((row) => ({ ...row, combo: row.key as ComboId, key: COMBOS[row.key as ComboId].name })),
  };
}

/** 味方から敵への与ダメージだけを取り出す */
export function dealtBy(records: readonly DamageRecord[], attackerId: string): DamageRecord[] {
  return records.filter((r) => r.attackerId === attackerId && r.targetTeam !== r.attackerTeam);
}
