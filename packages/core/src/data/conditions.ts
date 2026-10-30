import type { Rule } from '../rules';
import { LINK_CONDITIONS, type LinkConditionDef } from './links';

export interface ConditionDef {
  /** docs/conditions.md の番号 */
  no: number;
  text: string;
  /** 補正値換算のコスト(%) */
  cost: number;
  rule: Rule;
  /** 1つの条件文で、いくつかの効き目を持つとき */
  extraRules?: readonly Rule[];
  /** 当てる数が多いほど得をする(速射の遠距離に向く)。遠距離のビルドの拾い物に出やすい */
  rapid?: boolean;
  /** 繋ぎの条件文なら、前の手と今の手 */
  link?: LinkConditionDef['link'];
}

/** 手で書いた条件文 */
const HANDMADE = {
  twinStrikeOnBurning: {
    rapid: true,
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
    rapid: true,
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
    rapid: true,
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
    // どのビルドでも選ばれるので控えめにする(手数で状態が満ちやすい)
    text: '敵が3種類以上の状態にかかっているとき、与ダメージ+50%',
    cost: 60,
    rule: { label: '病み重ね', on: 'damage', when: [{ type: 'targetStatusCount', min: 3 }], add: 0.5 },
  },
  cleanBody: {
    no: 10,
    text: '自分がどの状態にもかかっていないとき、被ダメージ-40%',
    cost: 30,
    rule: { label: '清い身', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfStatusCount', max: 0 }], add: -0.4 },
  },
  unscathed: {
    no: 41,
    // どのビルドでも選ばれるので控えめにする
    text: 'HPが満タンのとき、与ダメージ+25%',
    cost: 30,
    rule: { label: '無傷の驕り', on: 'damage', when: [{ type: 'selfHpRatio', min: 1 }], add: 0.25 },
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
  twoHandedReach: {
    no: 32,
    text: '両手持ちのとき、攻撃範囲が2倍',
    cost: 30,
    rule: { label: '長い間合い', on: 'stat', stat: 'meleeRange', when: [{ type: 'selfHasTag', tag: 'twoHanded' }], add: 1 },
  },
  // 盾を足したときに考えた条件文。docs/conditions.md の200個の外なので 201 から振る
  behindShield: {
    no: 201,
    text: '盾が張られている間、与ダメージ+30%',
    cost: 25,
    rule: { label: '盾の陰', on: 'damage', when: [{ type: 'selfShieldReady' }], add: 0.3 },
  },
  untouched: {
    no: 47,
    text: '無傷の間、移動速度と攻撃速度+30%',
    cost: 30,
    rule: { label: '無傷の足取り', on: 'stat', stat: 'moveSpeed', when: [{ type: 'selfUnhurt' }], add: 0.3 },
    // 攻撃速度は、クールダウンを 1/1.3 にすることで表す
    extraRules: [{ label: '無傷の足取り', on: 'stat', stat: 'cooldown', when: [{ type: 'selfUnhurt' }], add: -0.23 }],
  },
  runningBlade: {
    no: 106,
    text: '移動した距離に応じて、次のアクティブの威力が上がる',
    cost: 40,
    rule: {
      label: '駆ける刃',
      on: 'damage',
      when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }],
      // 100 歩くごとに +20%、最大 +100%
      add: 0.2,
      perCharge: { every: 100, max: 5 },
    },
  },
  crowdCleaver: {
    no: 123,
    text: '1回の攻撃で5体以上に当てると、全てのクールダウンが1秒短くなる',
    cost: 40,
    rule: { label: '群れ断ち', on: 'multiHit', min: 5, when: [], do: [{ type: 'cooldown', ms: 1000 }] },
  },
  twoHandedDual: {
    no: 176,
    text: '両手持ちのとき、二刀流向けのスキルの威力が2倍',
    cost: 40,
    rule: {
      label: '持ち替えの妙',
      on: 'damage',
      when: [
        { type: 'selfHasTag', tag: 'twoHanded' },
        { type: 'hitHasTag', tag: 'dual' },
      ],
      add: 1,
    },
  },
  mirroredBlades: {
    rapid: true,
    no: 177,
    text: '二刀流で左右の武器の補正値の合計が同じなら、攻撃が左右同時に出る',
    cost: 60,
    rule: {
      label: '鏡合わせ',
      on: 'hit',
      when: [
        { type: 'selfHasTag', tag: 'dualTotalsEqual' },
        { type: 'hitHasTag', tag: 'melee' },
        { type: 'hitHasTag', tag: 'attack' },
        { type: 'hitLacksTag', tag: 'repeat' },
      ],
      do: [{ type: 'repeatHit' }],
    },
  },
  // 儀式を足したときに考えた条件文
  ritualMaster: {
    no: 202,
    text: '儀式を3つ以上宿した技は、与ダメージ2倍',
    cost: 50,
    rule: { label: '満ちた祭壇', on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'ritesReleased', min: 3 }], add: 1 },
  },
  ritualHaste: {
    no: 203,
    text: '儀式のクールダウンが15%短くなる',
    cost: 30,
    rule: { label: '急ぎの祈り', on: 'stat', stat: 'cooldown', tags: ['rite'], when: [], add: -0.15 },
  },
  riteWard: {
    no: 204,
    text: '儀式を2つ以上宿している間、被ダメージ-30%',
    cost: 25,
    rule: { label: '祈りの帳', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfRites', min: 2 }], add: -0.3 },
  },
  riteStride: {
    no: 205,
    text: '儀式を宿している間、移動速度+30%',
    cost: 15,
    rule: { label: '祈りの足取り', on: 'stat', stat: 'moveSpeed', when: [{ type: 'selfRites', min: 1 }], add: 0.3 },
  },
  riteBurst: {
    no: 206,
    text: '儀式を4つ以上宿した技は、3回多く当たる(威力は半分)',
    cost: 40,
    rule: {
      label: '溢れる祭壇',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'ritesReleased', min: 4 }],
      do: [{ type: 'repeatHit', power: 0.5, times: 3 }],
    },
  },
  // 遠攻撃の条件文。弾を避けながら撃つ遠距離らしく、当て続ける・離れる・足を止めることに見返りがある
  focusedVolley: {
    rapid: true,
    no: 207,
    text: '狙いの締まりが10以上のとき、遠攻撃の与ダメージ3倍',
    cost: 50,
    rule: { label: '締め撃ち', on: 'damage', when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'selfFocus', min: 10 }], add: 2 },
  },
  farHunter: {
    rapid: true,
    no: 208,
    text: '離れた相手(250以上)への遠攻撃は、与ダメージ2.5倍',
    cost: 45,
    rule: { label: '遠間の狩人', on: 'damage', when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'targetFar', min: 250 }], add: 1.5 },
  },
  plantedAim: {
    rapid: true,
    no: 209,
    text: '1秒以上足を止めて撃つ遠攻撃は、与ダメージ2倍で、2回多く当たる(威力は半分)',
    cost: 55,
    rule: {
      label: '据え撃ち',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfStill', ms: 1000 }],
      do: [{ type: 'repeatHit', power: 0.5, times: 2 }],
    },
    extraRules: [{ label: '据え撃ち', on: 'damage', when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'selfStill', ms: 1000 }], add: 1 }],
  },
  // 持ち味に効く条件文。どこでも効くものより狭いが、合うビルドでは繋ぎに並ぶ見返りがある
  stormConduit: {
    rapid: true,
    no: 210,
    text: '感電している敵への雷の攻撃は、与ダメージ3倍',
    cost: 50,
    rule: { label: '雷の通い路', on: 'damage', when: [{ type: 'hitElementIs', element: 'lightning' }, { type: 'targetHas', status: 'shock' }], add: 2 },
  },
  pyreHymn: {
    rapid: true,
    no: 211,
    text: '炎上している敵への杖の術は、与ダメージ3倍',
    cost: 50,
    rule: { label: '火葬の讃歌', on: 'damage', when: [{ type: 'hitHasTag', tag: 'staff' }, { type: 'targetHas', status: 'burn' }], add: 2 },
  },
  spearEdge: {
    no: 212,
    text: '間合いの端(100以上離れた相手)に当てる近攻撃は、与ダメージ3倍',
    cost: 50,
    rule: { label: '穂先の間合い', on: 'damage', when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'targetFar', min: 100 }], add: 2 },
  },
  shieldBulwark: {
    no: 213,
    text: '盾が張られている間、近攻撃は2回多く当たる(威力は半分)',
    cost: 45,
    rule: {
      label: '盾越しの連打',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfShieldReady' }],
      do: [{ type: 'repeatHit', power: 0.5, times: 2 }],
    },
  },
  shatterSurge: {
    no: 214,
    text: '盾が砕けると、続く3撃の与ダメージ4倍',
    cost: 40,
    rule: { label: '砕け散る盾', on: 'shieldBreak', when: [], do: [{ type: 'grantBuff', label: '砕け散る盾', add: 3, tags: ['weapon'], duration: 8000, charges: 3 }] },
  },
} as const satisfies Record<string, ConditionDef>;

export type HandmadeConditionId = keyof typeof HANDMADE;
/** 繋ぎの条件文は `link:前>今:見返り` の名前 */
export type ConditionId = HandmadeConditionId | `link:${string}`;

/** 条件文。装備の補正値の1枠を使って入る。手で書いたものと、繋ぎ(data/links.ts)から作ったもの */
export const CONDITIONS: Record<ConditionId, ConditionDef> = { ...HANDMADE, ...LINK_CONDITIONS };
export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];
export const HANDMADE_CONDITION_IDS = Object.keys(HANDMADE) as HandmadeConditionId[];
export const LINK_CONDITION_IDS = Object.keys(LINK_CONDITIONS) as ConditionId[];

export function conditionDef(id: ConditionId): ConditionDef {
  return CONDITIONS[id]!;
}
