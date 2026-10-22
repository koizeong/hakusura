import type { Rule } from '../rules';

export interface ConditionDef {
  /** docs/conditions.md の番号 */
  no: number;
  text: string;
  /** 補正値換算のコスト(%) */
  cost: number;
  rule: Rule;
}

/** 条件文。装備の補正値の1枠を使って入る */
export const CONDITIONS = {
  twinStrikeOnBurning: {
    no: 1,
    text: '炎上状態の敵に攻撃すると、2回攻撃になる',
    cost: 70,
    rule: {
      label: '炎への二撃',
      on: 'hit',
      when: [
        { type: 'hitHasTag', tag: 'attack' },
        { type: 'hitLacksTag', tag: 'repeat' },
        { type: 'targetHas', status: 'burn' },
      ],
      do: [{ type: 'repeatHit' }],
    },
  },
  shiftingElement: {
    no: 11,
    text: '直前と違う属性で攻撃すると、与ダメージ+80%',
    cost: 40,
    rule: {
      label: '移ろう属性',
      on: 'damage',
      when: [{ type: 'hitHasTag', tag: 'weapon' }, { type: 'elementChanged' }],
      add: 0.8,
    },
  },
  rainSoaked: {
    no: 51,
    text: '雨の間、全ての攻撃が濡れを付与する',
    cost: 30,
    rule: {
      label: '雨垂れの刃',
      on: 'hit',
      when: [
        { type: 'hitHasTag', tag: 'weapon' },
        { type: 'weather', weather: 'rain' },
      ],
      do: [{ type: 'applyBuildup', status: 'wet', amount: 50 }],
    },
  },
} as const satisfies Record<string, ConditionDef>;

export type ConditionId = keyof typeof CONDITIONS;
export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

export function conditionDef(id: ConditionId): ConditionDef {
  return CONDITIONS[id];
}
