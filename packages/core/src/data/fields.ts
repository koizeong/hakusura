import type { StatusId } from './statuses';

export interface FieldDef {
  name: string;
  /** weather は全員に、floor は範囲内にいる者にかかる */
  kind: 'weather' | 'floor';
  applies: { status: StatusId; perSec: number };
  color: number;
}

/** フィールドの環境と床の状態 */
export const FIELDS = {
  rain: { name: '雨', kind: 'weather', applies: { status: 'wet', perSec: 80 }, color: 0x4a7fb5 },
  oilPool: { name: '油溜まり', kind: 'floor', applies: { status: 'oiled', perSec: 200 }, color: 0x3a3218 },
} as const satisfies Record<string, FieldDef>;

export type FieldId = keyof typeof FIELDS;
export const FIELD_IDS = Object.keys(FIELDS) as FieldId[];

export function fieldDef(id: FieldId): FieldDef {
  return FIELDS[id];
}
