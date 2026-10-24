import type { Predicate } from '../rules';
import { ACTIVE_SKILLS, type ActiveSkillId } from './skills';
import { STATUSES, STATUS_IDS, type StatusDef } from './statuses';
import { FIELDS, FLOOR_IDS, WEATHER_IDS } from './fields';

/** 作戦の条件。group は編集画面でのまとまり */
export interface TacticConditionDef {
  label: string;
  group: string;
  when: readonly Predicate[];
}

/** 手で書いた条件。古い作戦もこの名前で読めるよう残す */
const BASIC = {
  always: { label: 'いつでも', group: '基本', when: [] },
  imbueOff: { label: '付与が切れている', group: '基本', when: [{ type: 'not', p: { type: 'selfImbued' } }] },
  targetWet: { label: '相手が濡れている', group: '相手の状態', when: [{ type: 'targetHas', status: 'wet' }] },
  targetDry: { label: '相手が濡れていない', group: '相手の状態', when: [{ type: 'not', p: { type: 'targetHas', status: 'wet' } }] },
  targetBurning: { label: '相手が燃えている', group: '相手の状態', when: [{ type: 'targetHas', status: 'burn' }] },
  targetBleeding: { label: '相手が血を流している', group: '相手の状態', when: [{ type: 'targetHas', status: 'bleed' }] },
  targetOiled: { label: '相手が油まみれ', group: '相手の状態', when: [{ type: 'targetHas', status: 'oiled' }] },
  targetStunned: { label: '相手が昏倒している', group: '相手の状態', when: [{ type: 'targetHas', status: 'stun' }] },
  raining: { label: '雨が降っている', group: '天候', when: [{ type: 'weather', weather: 'rain' }] },
  notRaining: { label: '雨が降っていない', group: '天候', when: [{ type: 'not', p: { type: 'weather', weather: 'rain' } }] },
  readBlow: { label: '見切りを得ている', group: '自分の状態', when: [{ type: 'selfHasBuff', label: '見切り' }] },
  fervorReady: { label: '昂りを得ている', group: '自分の状態', when: [{ type: 'selfHasBuff', label: '昂り' }] },
} satisfies Record<string, TacticConditionDef>;

/** 溜まり具合の条件の目安。この割合以上溜まっていて、まだ発動していない */
const NEAR_FULL = 0.7;

/**
 * 状態・天候・床・スキルから作る条件。状態や床を1件足せば、作戦の条件にも出る。
 * 「相手の感電が7割以上」で仕上げ、「相手が油まみれでない」で下ごしらえ、のように組む
 */
function generated(): Record<string, TacticConditionDef> {
  const out: Record<string, TacticConditionDef> = {};
  for (const id of STATUS_IDS) {
    const def: StatusDef = STATUSES[id];
    const name = def.name;
    out[`target:${id}`] = { label: `相手が${name}`, group: '相手の状態', when: [{ type: 'targetHas', status: id }] };
    out[`self:${id}`] = { label: `自分が${name}`, group: '自分の状態', when: [{ type: 'attackerHas', status: id }] };
    if (def.derived) continue;
    out[`targetNot:${id}`] = { label: `相手が${name}でない`, group: '相手の状態', when: [{ type: 'not', p: { type: 'targetHas', status: id } }] };
    out[`targetNear:${id}`] = {
      label: `相手の${name}が${NEAR_FULL * 10}割以上(まだ発動前)`,
      group: '相手の溜まり具合',
      when: [{ type: 'targetBuildupAtLeast', status: id, ratio: NEAR_FULL }, { type: 'not', p: { type: 'targetHas', status: id } }],
    };
  }
  for (const id of WEATHER_IDS) {
    out[`weather:${id}`] = { label: `${FIELDS[id].name}のとき`, group: '天候', when: [{ type: 'weather', weather: id }] };
  }
  for (const id of FLOOR_IDS) {
    out[`targetFloor:${id}`] = { label: `相手が${FIELDS[id].name}の上`, group: '床', when: [{ type: 'targetOnFloor', field: id }] };
    out[`selfFloor:${id}`] = { label: `自分が${FIELDS[id].name}の上`, group: '床', when: [{ type: 'selfOnFloor', field: id }] };
  }
  for (const id of Object.keys(ACTIVE_SKILLS) as ActiveSkillId[]) {
    if ((ACTIVE_SKILLS[id].tags as readonly string[]).includes('enemy')) continue;
    out[`last:${id}`] = { label: `直前に${ACTIVE_SKILLS[id].name}を使った`, group: '直前の手', when: [{ type: 'lastSkillWas', skill: id }] };
  }
  return out;
}

/** 作戦の条件。1件足せば作戦の編集画面の選択肢に出る */
export const TACTIC_CONDITIONS: Record<string, TacticConditionDef> = { ...BASIC, ...generated() };

export type TacticConditionId = string;
export const TACTIC_CONDITION_IDS = Object.keys(TACTIC_CONDITIONS);

/** 編集画面で並べるまとまりの順 */
export const TACTIC_CONDITION_GROUPS = ['基本', '相手の状態', '相手の溜まり具合', '自分の状態', '天候', '床', '直前の手'] as const;

/** 作戦の1行。上の行から順に見て、最初に使えるものを使う */
export interface Tactic {
  skill: ActiveSkillId;
  condition: TacticConditionId;
  enabled: boolean;
  /** 連携。この行のスキルを出したら、続けてこれらを順に出す(2つまで) */
  then?: ActiveSkillId[];
}

/** 連携の決まり。次の一手を待つ時間と、続けられる数 */
export const FOLLOW_UP = { window: 2500, max: 2 } as const;

export const DEFAULT_TACTICS: readonly Tactic[] = [
  { skill: 'emberOil', condition: 'imbueOff', enabled: true },
  // 濡れた相手は撃ってから斬り込む(撃ち込みの型)
  { skill: 'shoot', condition: 'targetWet', enabled: true, then: ['slash'] },
  { skill: 'slash', condition: 'always', enabled: true },
  { skill: 'shoot', condition: 'always', enabled: true },
];
