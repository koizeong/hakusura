import type { Predicate } from '../rules';
import type { ActiveSkillId } from './skills';

/** 作戦の条件。1件足せば作戦の編集画面の選択肢に出る */
export const TACTIC_CONDITIONS = {
  always: { label: 'いつでも', when: [] },
  imbueOff: { label: '付与が切れている', when: [{ type: 'not', p: { type: 'selfImbued' } }] },
  targetWet: { label: '相手が濡れている', when: [{ type: 'targetHas', status: 'wet' }] },
  targetDry: { label: '相手が濡れていない', when: [{ type: 'not', p: { type: 'targetHas', status: 'wet' } }] },
  targetBurning: { label: '相手が燃えている', when: [{ type: 'targetHas', status: 'burn' }] },
  targetBleeding: { label: '相手が血を流している', when: [{ type: 'targetHas', status: 'bleed' }] },
  targetOiled: { label: '相手が油まみれ', when: [{ type: 'targetHas', status: 'oiled' }] },
  targetStunned: { label: '相手が昏倒している', when: [{ type: 'targetHas', status: 'stun' }] },
  raining: { label: '雨が降っている', when: [{ type: 'weather', weather: 'rain' }] },
  notRaining: { label: '雨が降っていない', when: [{ type: 'not', p: { type: 'weather', weather: 'rain' } }] },
  readBlow: { label: '見切りを得ている', when: [{ type: 'selfHasBuff', label: '見切り' }] },
} as const satisfies Record<string, { label: string; when: readonly Predicate[] }>;

export type TacticConditionId = keyof typeof TACTIC_CONDITIONS;
export const TACTIC_CONDITION_IDS = Object.keys(TACTIC_CONDITIONS) as TacticConditionId[];

/** 作戦の1行。上の行から順に見て、最初に使えるものを使う */
export interface Tactic {
  skill: ActiveSkillId;
  condition: TacticConditionId;
  enabled: boolean;
}

export const DEFAULT_TACTICS: readonly Tactic[] = [
  { skill: 'emberOil', condition: 'imbueOff', enabled: true },
  { skill: 'shoot', condition: 'targetWet', enabled: true },
  { skill: 'slash', condition: 'always', enabled: true },
  { skill: 'shoot', condition: 'always', enabled: true },
];
