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
  bleedingSprint: {
    no: 2,
    text: '自分が出血中なら、移動速度+50%',
    cost: 20,
    rule: { label: '血走る足', on: 'stat', stat: 'moveSpeed', when: [{ type: 'attackerHas', status: 'bleed' }], add: 0.5 },
  },
  manyAilments: {
    no: 9,
    text: '敵が3種類以上の状態にかかっているとき、与ダメージ2倍',
    cost: 60,
    rule: { label: '病み重ね', on: 'damage', when: [{ type: 'targetStatusCount', min: 3 }], add: 1 },
  },
  cleanBody: {
    no: 10,
    text: '自分がどの状態にもかかっていないとき、被ダメージ-40%',
    cost: 30,
    rule: { label: '清い身', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfStatusCount', max: 0 }], add: -0.4 },
  },
  unscathed: {
    no: 41,
    text: 'HPが満タンのとき、与ダメージ+50%',
    cost: 30,
    rule: { label: '無傷の驕り', on: 'damage', when: [{ type: 'selfHpRatio', min: 1 }], add: 0.5 },
  },
  bleedBack: {
    no: 48,
    text: '被弾するたびに、攻撃してきた相手に出血を付与',
    cost: 20,
    rule: { label: '血の返礼', on: 'hurt', when: [], do: [{ type: 'applyBuildup', status: 'bleed', amount: 100 }] },
  },
  oilWalker: {
    no: 52,
    text: '油溜まりの上にいるとき、自分は炎上しない',
    cost: 10,
    rule: {
      label: '油を踏む者',
      on: 'buildup',
      when: [
        { type: 'statusIs', status: 'burn' },
        { type: 'targetOnFloor', field: 'oilPool' },
      ],
      block: true,
    },
  },
  standFirm: {
    no: 64,
    text: '移動していない間、被ダメージ-50%',
    cost: 30,
    rule: { label: '根を張る', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfStill', ms: 400 }], add: -0.5 },
  },
  woundedFury: {
    no: 116,
    text: '被ダメージを受けた直後の3秒間、与ダメージ+80%',
    cost: 30,
    rule: {
      label: '手負いの猛り',
      on: 'hurt',
      when: [],
      do: [{ type: 'grantBuff', label: '手負いの猛り', add: 0.8, tags: [], duration: 3000 }],
    },
  },
} as const satisfies Record<string, ConditionDef>;

export type ConditionId = keyof typeof CONDITIONS;
export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

export function conditionDef(id: ConditionId): ConditionDef {
  return CONDITIONS[id];
}
