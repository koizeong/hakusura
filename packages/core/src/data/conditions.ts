import type { Rule } from '../rules';
import type { MarkId } from './marks';
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
  /**
   * 与ダメージの重なり方。'mult' は他と別の種類で掛け算(×)。なければ条件文どうしで足し算(+)の1つの種類にまとめる。
   * ×は持ち味に効く札だけに絞る(Balatro の ×倍率のように希少にして、何が掛け算かを読めるようにする)
   */
  stacking?: 'mult';
  /** 拾い物に出ない(印の札に役目を譲った札)。データは残し、昔の装備に付いたものは働く */
  retired?: boolean;
  /** 印の条件文の役割。生む・変える・使う印(札に出して、揃っているかを見せる) */
  marks?: { gives?: readonly MarkId[]; uses?: readonly MarkId[] };
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
    // どのビルドでも同じように効く+の札は、印の札に役目を譲って拾い物から外す
    retired: true,
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
    // どのビルドでも同じように効く+の札は、印の札に役目を譲って拾い物から外す
    retired: true,
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
    // どのビルドでも同じように効く+の札は、印の札に役目を譲って拾い物から外す
    retired: true,
    no: 116,
    // 攻めを受ける場ではどのビルドでも選ばれたので、どこでも効く条件文と同じく控えめにする
    text: '被ダメージを受けた直後の3秒間、与ダメージ+30%',
    cost: 30,
    rule: {
      label: '手負いの猛り',
      on: 'hurt',
      when: [],
      do: [{ type: 'grantBuff', label: '手負いの猛り', add: 0.3, tags: [], duration: 3000 }],
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
    // どのビルドでも同じように効く+の札は、印の札に役目を譲って拾い物から外す
    retired: true,
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
    stacking: 'mult',
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
    stacking: 'mult',
    rapid: true,
    no: 207,
    text: '狙いの締まりが10以上のとき、遠攻撃の与ダメージ3倍',
    cost: 50,
    rule: { label: '締め撃ち', on: 'damage', when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'selfFocus', min: 10 }], add: 2 },
  },
  farHunter: {
    stacking: 'mult',
    rapid: true,
    no: 208,
    text: '離れた相手(250以上)への遠攻撃は、与ダメージ2.5倍',
    cost: 45,
    rule: { label: '遠間の狩人', on: 'damage', when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'targetFar', min: 250 }], add: 1.5 },
  },
  plantedAim: {
    stacking: 'mult',
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
    stacking: 'mult',
    rapid: true,
    no: 210,
    text: '感電している敵への雷の攻撃は、与ダメージ3倍',
    cost: 50,
    rule: { label: '雷の通い路', on: 'damage', when: [{ type: 'hitElementIs', element: 'lightning' }, { type: 'targetHas', status: 'shock' }], add: 2 },
  },
  pyreHymn: {
    stacking: 'mult',
    rapid: true,
    no: 211,
    // 雷の通い路と揃え、炎上の燃える傷にも効く
    text: '炎上している敵への火の攻撃は、与ダメージ3倍',
    cost: 50,
    rule: { label: '火葬の讃歌', on: 'damage', when: [{ type: 'hitElementIs', element: 'fire' }, { type: 'targetHas', status: 'burn' }], add: 2 },
  },
  spearEdge: {
    stacking: 'mult',
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
  heavyGrip: {
    stacking: 'mult',
    no: 215,
    text: '両手持ちの重い武器(大剣・斧・戦槌)の近攻撃は、与ダメージ2倍。ただしその技の間隔が1.3倍',
    cost: 45,
    rule: {
      label: '両手の重み',
      on: 'damage',
      when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'hitHasTag', tag: 'heavy' }, { type: 'selfHasTag', tag: 'twoHanded' }],
      add: 1,
    },
    extraRules: [{ label: '両手の重み', on: 'stat', stat: 'cooldown', tags: ['heavy'], when: [{ type: 'selfHasTag', tag: 'twoHanded' }], add: 0.3 }],
  },
  bowFlurry: {
    rapid: true,
    no: 216,
    text: '弓の矢は、当たるたびに2回多く当たる(威力は半分)',
    cost: 45,
    rule: {
      label: '矢継ぎ',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'bow' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }],
      do: [{ type: 'repeatHit', power: 0.5, times: 2 }],
    },
  },
  arcaneSurge: {
    stacking: 'mult',
    rapid: true,
    no: 217,
    // 魔力の高まりは杖でしか溜まらないので、術師の火力の大半を占める状態の傷(感電・炎上)にも効かせる
    text: '魔力の高まりが10以上のとき、与ダメージ3倍',
    cost: 50,
    rule: { label: '溢れる魔力', on: 'damage', when: [{ type: 'selfCombo', min: 10 }], add: 2 },
  },
  // ---- 印の条件文。生む札・変える札・使う札を揃えて初めて働く ----
  // 生む
  kindleEmber: {
    no: 301,
    text: '火の技を当てると〈熾り〉を1つ得る',
    cost: 15,
    marks: { gives: ['ember'] },
    // 炎上の燃える傷では溜まらない(技の当たりだけ)
    rule: { label: '熾し', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'fire' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'ember', amount: 1 }] },
  },
  sparkEmber: {
    no: 302,
    text: '雷の技を当てると〈熾り〉を1つ得る',
    cost: 15,
    marks: { gives: ['ember'] },
    rule: { label: '火花', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'lightning' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'ember', amount: 1 }] },
  },
  honeEdge: {
    no: 303,
    text: '近攻撃を当てると〈研ぎ〉を1つ得る',
    cost: 15,
    marks: { gives: ['edge'] },
    rule: { label: '研ぎ重ね', on: 'hit', when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'edge', amount: 1 }] },
  },
  bloodTithe: {
    no: 304,
    // 盾と回避で受け止めるビルドでは被弾がまれなので、盾で受け止めても溜まる
    text: '攻撃を受けるか盾で受け止めると〈血潮〉を2つ得る',
    cost: 10,
    marks: { gives: ['blood'] },
    rule: { label: '血の十分の一', on: 'hurt', when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 2 }] },
    extraRules: [{ label: '血の十分の一', on: 'shieldBreak', when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 2 }] }],
  },
  bloodHarvest: {
    no: 305,
    text: '出血している敵に当てると〈血潮〉を1つ得る',
    cost: 15,
    marks: { gives: ['blood'] },
    rule: { label: '血の刈り入れ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'targetHas', status: 'bleed' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'blood', amount: 1 }] },
  },
  holdBreath: {
    no: 306,
    text: '1秒以上足を止めて当てると〈静寂〉を1つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '息を殺す', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfStill', ms: 1000 }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'stillness', amount: 1 }] },
  },
  distantQuiet: {
    no: 307,
    text: '離れた相手(200以上)に遠攻撃を当てると〈静寂〉を1つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '遠い静けさ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'targetFar', min: 200 }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'stillness', amount: 1 }] },
  },
  shieldOath: {
    no: 309,
    text: '盾が張られている間に近攻撃を当てると〈血潮〉を1つ得る',
    cost: 15,
    marks: { gives: ['blood'] },
    rule: {
      label: '盾の誓い',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'selfShieldReady' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }],
      do: [{ type: 'gainMark', mark: 'blood', amount: 1 }],
    },
  },
  riteEcho: {
    no: 308,
    // 儀式を宿した技は数秒に1度なので、1度で多めに溜める
    text: '儀式を宿した技を当てると〈祈り〉を3つ得る',
    cost: 15,
    marks: { gives: ['prayer'] },
    rule: { label: '祈りの残響', on: 'hit', when: [{ type: 'ritesReleased', min: 1 }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'prayer', amount: 3 }] },
  },
  // 変える
  bloodWhetstone: {
    no: 311,
    text: '〈血潮〉を得るたび、〈研ぎ〉も1つ得る',
    cost: 20,
    marks: { gives: ['edge'], uses: ['blood'] },
    rule: { label: '血砥ぎ', on: 'markGained', mark: 'blood', when: [], do: [{ type: 'gainMark', mark: 'edge', amount: 1 }] },
  },
  quietPrayer: {
    no: 312,
    text: '〈静寂〉を得るたび、〈祈り〉も1つ得る',
    cost: 20,
    marks: { gives: ['prayer'], uses: ['stillness'] },
    rule: { label: '黙した祈り', on: 'markGained', mark: 'stillness', when: [], do: [{ type: 'gainMark', mark: 'prayer', amount: 1 }] },
  },
  prayerKindling: {
    no: 313,
    text: '〈祈り〉を得るたび、〈熾り〉も1つ得る',
    cost: 20,
    marks: { gives: ['ember'], uses: ['prayer'] },
    rule: { label: '祈りの火種', on: 'markGained', mark: 'prayer', when: [], do: [{ type: 'gainMark', mark: 'ember', amount: 1 }] },
  },
  // 使う(溜めて保つ)
  emberBlaze: {
    no: 321,
    text: '〈熾り〉が3つ以上のとき、与ダメージ+60%',
    cost: 40,
    marks: { uses: ['ember'] },
    rule: { label: '熾火の昂り', on: 'damage', when: [{ type: 'selfMarks', mark: 'ember', min: 3 }], add: 0.6 },
  },
  keenEdge: {
    no: 322,
    text: '〈研ぎ〉1つにつき、近攻撃の与ダメージ+15%',
    cost: 40,
    marks: { uses: ['edge'] },
    rule: { label: '研ぎ澄まし', on: 'damage', when: [{ type: 'hitHasTag', tag: 'melee' }], add: 0.15, perMark: 'edge' },
  },
  bloodFrenzy: {
    no: 323,
    text: '〈血潮〉が3つ以上のとき、攻撃が1回多く当たる',
    cost: 40,
    marks: { uses: ['blood'] },
    rule: { label: '血の狂乱', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'blood', min: 3 }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'repeatHit', power: 1, times: 1 }] },
  },
  stillAim: {
    no: 324,
    text: '〈静寂〉1つにつき、遠攻撃の与ダメージ+20%',
    cost: 40,
    marks: { uses: ['stillness'] },
    rule: { label: '静かな狙い', on: 'damage', when: [{ type: 'hitHasTag', tag: 'ranged' }], add: 0.2, perMark: 'stillness' },
  },
  prayerHalo: {
    no: 325,
    text: '〈祈り〉が3つ以上のとき、被ダメージ-30%',
    cost: 30,
    marks: { uses: ['prayer'] },
    rule: { label: '祈りの光輪', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfMarks', mark: 'prayer', min: 3 }], add: -0.3 },
  },
  // 使う(溜めて吐く)
  emberBurst: {
    no: 331,
    text: '〈熾り〉が10以上あれば、次に当てたとき5つ使い、1つにつき火の追撃を落とす',
    cost: 40,
    marks: { uses: ['ember'] },
    rule: {
      label: '熾火の破裂',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'ember', min: 10 }],
      do: [{ type: 'spendMarks', mark: 'ember', min: 10, amount: 5, each: [{ type: 'strike', element: 'fire', power: 40, buildup: 30 }] }],
    },
  },
  edgeRelease: {
    no: 332,
    text: '〈研ぎ〉が10以上あれば、次に当てた技が5つ使い、5回多く当たる',
    cost: 40,
    marks: { uses: ['edge'] },
    rule: {
      label: '研ぎ放ち',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'edge', min: 10 }, { type: 'hitLacksTag', tag: 'repeat' }],
      do: [{ type: 'spendMarks', mark: 'edge', min: 10, amount: 5, each: [{ type: 'repeatHit', power: 0.8, times: 1 }] }],
    },
  },
  bloodOffering: {
    no: 333,
    text: '〈血潮〉が10以上あれば、5つ使い、1つにつき最大HPの4%を回復する',
    cost: 30,
    marks: { uses: ['blood'] },
    rule: { label: '血の捧げ', on: 'hit', when: [{ type: 'selfMarks', mark: 'blood', min: 10 }], do: [{ type: 'spendMarks', mark: 'blood', min: 10, amount: 5, each: [{ type: 'heal', ratio: 0.04 }] }] },
  },
  prayerJudgement: {
    no: 334,
    text: '〈祈り〉が10以上あれば、次に当てた攻撃が3倍になり、5つ使う',
    cost: 40,
    marks: { uses: ['prayer'] },
    rule: { label: '祈りの裁き', on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'prayer', min: 10 }], add: 2 },
    extraRules: [{ label: '祈りの裁き', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'prayer', min: 10 }], do: [{ type: 'spendMarks', mark: 'prayer', min: 10, amount: 5 }] }],
  },
  // 使うたびに(印を吐いたときに働く札。吐く札が別の札の燃料になり、印の流れが輪になる)
  spentPrayer: {
    no: 341,
    text: '印を使うたび、〈祈り〉を2つ得る',
    cost: 20,
    marks: { gives: ['prayer'] },
    rule: { label: '残り火の祈り', on: 'markSpent', when: [], do: [{ type: 'gainMark', mark: 'prayer', amount: 2 }] },
  },
  edgeBleed: {
    no: 342,
    text: '〈研ぎ〉を使うたび、相手に出血を大きく溜める',
    cost: 20,
    marks: { uses: ['edge'] },
    rule: { label: '研ぎ傷', on: 'markSpent', mark: 'edge', when: [], do: [{ type: 'applyBuildup', status: 'bleed', amount: 150 }] },
  },
  bloodRewhet: {
    no: 343,
    text: '〈血潮〉を使うたび、〈研ぎ〉を3つ得る',
    cost: 20,
    marks: { gives: ['edge'], uses: ['blood'] },
    rule: { label: '血の研ぎ直し', on: 'markSpent', mark: 'blood', when: [], do: [{ type: 'gainMark', mark: 'edge', amount: 3 }] },
  },
  emberMend: {
    no: 344,
    text: '〈熾り〉を使うたび、最大HPの8%を回復する',
    cost: 15,
    marks: { uses: ['ember'] },
    rule: { label: '熾火の温もり', on: 'markSpent', mark: 'ember', when: [], do: [{ type: 'heal', ratio: 0.08 }] },
  },
  spentHaste: {
    no: 345,
    // 技の間隔を縮めても、振りかぶりと硬直が詰まっていて速くならなかったので、そちらを縮める
    text: '印を使うたび、次の2つの技の振りかぶりと硬直が半分になる',
    cost: 25,
    marks: {},
    rule: { label: '吐き出す息', on: 'markSpent', when: [], do: [{ type: 'quicken', scale: 0.5, charges: 2, duration: 6000 }] },
  },
  prayerSpendBurst: {
    no: 346,
    text: '〈祈り〉を使うたび、〈熾り〉を5つ得る',
    cost: 20,
    marks: { gives: ['ember'], uses: ['prayer'] },
    rule: { label: '祈りの炎上', on: 'markSpent', mark: 'prayer', when: [], do: [{ type: 'gainMark', mark: 'ember', amount: 5 }] },
  },
  // 全ての属性から印が生まれる(どの属性のビルドも印の札を組める)
  frostQuiet: {
    no: 351,
    text: '氷の技を当てると〈静寂〉を1つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '凍てる静けさ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'ice' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'stillness', amount: 1 }] },
  },
  shadowQuiet: {
    no: 352,
    text: '闇の技を当てると〈静寂〉を1つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '闇の息', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'dark' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'stillness', amount: 1 }] },
  },
  rotBlood: {
    no: 353,
    text: '腐の技を当てると〈血潮〉を1つ得る',
    cost: 15,
    marks: { gives: ['blood'] },
    rule: { label: '腐れ血', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'rot' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'blood', amount: 1 }] },
  },
  veinBlood: {
    no: 354,
    text: '血の技を当てると〈血潮〉を1つ得る',
    cost: 15,
    marks: { gives: ['blood'] },
    rule: { label: '脈打つ血', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'blood' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'blood', amount: 1 }] },
  },
  ashEmber: {
    no: 355,
    text: '灰の技を当てると〈熾り〉を1つ得る',
    cost: 15,
    marks: { gives: ['ember'] },
    rule: { label: '灰の燠', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'ash' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'ember', amount: 1 }] },
  },
  cursePrayer: {
    no: 356,
    text: '呪の技を当てると〈祈り〉を1つ得る',
    cost: 15,
    marks: { gives: ['prayer'] },
    rule: { label: '呪いの祈祷', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'curse' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'prayer', amount: 1 }] },
  },
  pierceEdge: {
    no: 357,
    text: '刺の技を当てると〈研ぎ〉を1つ得る',
    cost: 15,
    marks: { gives: ['edge'] },
    rule: { label: '穿ちの研ぎ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'pierce' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'edge', amount: 1 }] },
  },
  bluntEdge: {
    no: 358,
    text: '打の技を当てると〈研ぎ〉を1つ得る',
    cost: 15,
    marks: { gives: ['edge'] },
    rule: { label: '打ち鍛え', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitElementIs', element: 'blunt' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'edge', amount: 1 }] },
  },
  // 使う(守り・速さ・追撃)
  stillWard: {
    no: 361,
    text: '〈静寂〉が3つ以上のとき、被ダメージ-25%',
    cost: 30,
    marks: { uses: ['stillness'] },
    rule: { label: '静寂の帳', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfMarks', mark: 'stillness', min: 3 }], add: -0.25 },
  },
  bloodTide: {
    no: 362,
    text: '〈血潮〉1つにつき、与ダメージ+12%',
    cost: 40,
    marks: { uses: ['blood'] },
    rule: { label: '血の満ち潮', on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }], add: 0.12, perMark: 'blood' },
  },
  prayerMight: {
    no: 363,
    text: '〈祈り〉1つにつき、与ダメージ+10%',
    cost: 40,
    marks: { uses: ['prayer'] },
    rule: { label: '祈りの力', on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }], add: 0.1, perMark: 'prayer' },
  },
  edgeHaste: {
    no: 364,
    text: '〈研ぎ〉が3つ以上のとき、技の間隔-20%',
    cost: 35,
    marks: { uses: ['edge'] },
    rule: { label: '研ぎの冴え', on: 'stat', stat: 'cooldown', when: [{ type: 'selfMarks', mark: 'edge', min: 3 }], add: -0.2 },
  },
  emberSpread: {
    no: 365,
    text: '〈熾り〉を使うたび、相手に炎上を大きく溜める',
    cost: 20,
    marks: { uses: ['ember'] },
    rule: { label: '飛び火', on: 'markSpent', mark: 'ember', when: [], do: [{ type: 'applyBuildup', status: 'burn', amount: 150 }] },
  },
  stillVolley: {
    no: 366,
    text: '〈静寂〉が10以上あれば、次に当てた遠攻撃が5つ使い、1つにつき刺の追撃を落とす',
    cost: 40,
    marks: { uses: ['stillness'] },
    rule: {
      label: '静寂の矢雨',
      on: 'hit',
      when: [{ type: 'hitHasTag', tag: 'ranged' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'stillness', min: 10 }],
      do: [{ type: 'spendMarks', mark: 'stillness', min: 10, amount: 5, each: [{ type: 'strike', element: 'pierce', power: 35, buildup: 20 }] }],
    },
  },
  // 変える
  edgeKindling: {
    no: 371,
    text: '〈研ぎ〉を得るたび、〈熾り〉も1つ得る',
    cost: 20,
    marks: { gives: ['ember'], uses: ['edge'] },
    rule: { label: '火花散る砥石', on: 'markGained', mark: 'edge', when: [], do: [{ type: 'gainMark', mark: 'ember', amount: 1 }] },
  },
  emberToBlood: {
    no: 372,
    text: '〈熾り〉を得るたび、〈血潮〉も1つ得る',
    cost: 20,
    marks: { gives: ['blood'], uses: ['ember'] },
    rule: { label: '沸き立つ血', on: 'markGained', mark: 'ember', when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 1 }] },
  },
  // 外した+の札の代わりに、同じ場面で印を生む札
  afflictedPrayer: {
    no: 381,
    text: '3種類以上の状態にかかった敵に技を当てると〈祈り〉を1つ得る',
    cost: 15,
    marks: { gives: ['prayer'] },
    rule: { label: '病みへの祈り', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'targetStatusCount', min: 3 }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'prayer', amount: 1 }] },
  },
  pristineQuiet: {
    no: 382,
    text: 'HPが満タンの間に技を当てると〈静寂〉を1つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '無傷の静けさ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfHpRatio', min: 1 }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: 'stillness', amount: 1 }] },
  },
  throngEdge: {
    no: 383,
    text: '1回の攻撃で3体以上に当てると〈研ぎ〉を2つ得る',
    cost: 15,
    marks: { gives: ['edge'] },
    rule: { label: '群れ斬り', on: 'multiHit', min: 3, when: [], do: [{ type: 'gainMark', mark: 'edge', amount: 2 }] },
  },
  throngEmber: {
    no: 384,
    text: '1回の攻撃で3体以上に当てると〈熾り〉を2つ得る',
    cost: 15,
    marks: { gives: ['ember'] },
    rule: { label: '群れ焼き', on: 'multiHit', min: 3, when: [], do: [{ type: 'gainMark', mark: 'ember', amount: 2 }] },
  },
  // ---- 印の札・二の巻(印のパターンを増やす) ----
  // 飢える(印が少ないときに働く。吐く札と組むと、使い切った後の隙を埋める)
  edgeHunger: {
    no: 401,
    text: '〈研ぎ〉がないとき、近攻撃が1回多く当たる',
    cost: 35,
    marks: { uses: ['edge'] },
    rule: { label: '刃こぼれの執念', on: 'hit', when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarksAtMost', mark: 'edge', max: 0 }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'repeatHit', power: 1, times: 1 }] },
  },
  emberHunger: {
    no: 402,
    text: '〈熾り〉が4以下のとき、火の技を当てると〈熾り〉を2つ得る',
    cost: 20,
    marks: { gives: ['ember'] },
    rule: { label: '燠の飢え', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'hitElementIs', element: 'fire' }, { type: 'selfMarksAtMost', mark: 'ember', max: 4 }], do: [{ type: 'gainMark', mark: 'ember', amount: 2 }] },
  },
  bloodHunger: {
    no: 403,
    text: '〈血潮〉がないとき、技を当てると最大HPの1%を回復する',
    cost: 25,
    marks: { uses: ['blood'] },
    rule: { label: '血への渇き', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfMarksAtMost', mark: 'blood', max: 0 }], do: [{ type: 'heal', ratio: 0.01 }] },
  },
  stillHunger: {
    no: 404,
    text: '〈静寂〉がないとき、移動速度+20%',
    cost: 20,
    marks: { uses: ['stillness'] },
    rule: { label: '空の静けさ', on: 'stat', stat: 'moveSpeed', when: [{ type: 'selfMarksAtMost', mark: 'stillness', max: 0 }], add: 0.2 },
  },
  prayerHunger: {
    no: 405,
    text: '〈祈り〉が4以下のとき、儀式のクールダウン-30%',
    cost: 25,
    marks: { uses: ['prayer'] },
    rule: { label: '乾いた祈り', on: 'stat', stat: 'cooldown', tags: ['rite'], when: [{ type: 'selfMarksAtMost', mark: 'prayer', max: 4 }], add: -0.3 },
  },
  // 取り揃える(印の種類で働く。いくつもの印を回すビルドに)
  fiveMarks: {
    no: 411,
    text: '持っている印の種類1つにつき、与ダメージ+12%',
    cost: 40,
    marks: {},
    rule: { label: '五つの印', on: 'damage', when: [], add: 0.12, perMarkKind: true },
  },
  motleyWard: {
    no: 412,
    text: '印を3種類以上持つとき、被ダメージ-20%',
    cost: 30,
    marks: {},
    rule: { label: '雑色の守り', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfMarkKinds', min: 3 }], add: -0.2 },
  },
  prismBlade: {
    no: 413,
    text: '印を5種類全て持つとき、与ダメージ×2',
    cost: 60,
    stacking: 'mult',
    marks: {},
    rule: { label: '五色の刃', on: 'damage', when: [{ type: 'selfMarkKinds', min: 5 }], add: 1 },
  },
  fullPouch: {
    no: 414,
    text: '印の合計が60以上のとき、クールダウン-25%',
    cost: 35,
    marks: {},
    rule: { label: '満ちた印袋', on: 'stat', stat: 'cooldown', when: [{ type: 'selfMarksTotal', min: 60 }], add: -0.25 },
  },
  // 頂(印がその数に届いた瞬間に1度だけ働く。貯めるビルドの節目)
  edgeCrest: {
    no: 421,
    text: '〈研ぎ〉が30に届いた瞬間、狙う相手に斬の追撃(威力120)を落とす',
    cost: 30,
    marks: { uses: ['edge'] },
    rule: { label: '研ぎの頂', on: 'markGained', mark: 'edge', reach: 30, when: [], do: [{ type: 'strike', element: 'slash', power: 120, buildup: 60 }] },
  },
  emberCrest: {
    no: 422,
    text: '〈熾り〉が30に届いた瞬間、狙う相手に炎上を大きく溜める',
    cost: 25,
    marks: { uses: ['ember'] },
    rule: { label: '熾りの頂', on: 'markGained', mark: 'ember', reach: 30, when: [], do: [{ type: 'applyBuildup', status: 'burn', amount: 300 }] },
  },
  bloodCrest: {
    no: 423,
    text: '〈血潮〉が30に届いた瞬間、最大HPの20%を回復する',
    cost: 25,
    marks: { uses: ['blood'] },
    rule: { label: '血潮の頂', on: 'markGained', mark: 'blood', reach: 30, when: [], do: [{ type: 'heal', ratio: 0.2 }] },
  },
  stillCrest: {
    no: 424,
    text: '〈静寂〉が30に届いた瞬間、続く3撃の与ダメージ+150%',
    cost: 30,
    marks: { uses: ['stillness'] },
    rule: { label: '静寂の頂', on: 'markGained', mark: 'stillness', reach: 30, when: [], do: [{ type: 'grantBuff', label: '静寂の頂', add: 1.5, tags: ['weapon'], duration: 8000, charges: 3 }] },
  },
  prayerCrest: {
    no: 425,
    text: '〈祈り〉が30に届いた瞬間、全てのクールダウンが3秒縮む',
    cost: 30,
    marks: { uses: ['prayer'] },
    rule: { label: '祈りの頂', on: 'markGained', mark: 'prayer', reach: 30, when: [], do: [{ type: 'cooldown', ms: 3000 }] },
  },
  edgeBrim: {
    no: 426,
    text: '〈研ぎ〉が100に届いた瞬間、〈血潮〉を20得る',
    cost: 20,
    marks: { gives: ['blood'], uses: ['edge'] },
    rule: { label: '溢れる研ぎ', on: 'markGained', mark: 'edge', reach: 100, when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 20 }] },
  },
  // 名残(印が消えたとき・倒れて失ったときに働く。失った数で決まる)
  emberAsh: {
    no: 431,
    text: '〈熾り〉が消えるとき、失った数の半分の〈祈り〉を得る',
    cost: 20,
    marks: { gives: ['prayer'], uses: ['ember'] },
    rule: { label: '燃え残り', on: 'markLost', mark: 'ember', when: [], do: [{ type: 'gainMark', mark: 'prayer', amount: 0, per: 0.5 }] },
  },
  lostBlood: {
    no: 432,
    text: '印が消えるとき、失った数の半分の〈血潮〉を得る',
    cost: 20,
    marks: { gives: ['blood'] },
    rule: { label: '失せ物の血', on: 'markLost', when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 0, per: 0.5 }] },
  },
  lingeringBlow: {
    no: 433,
    text: '印が消えるとき、続く2撃の与ダメージ+100%',
    cost: 25,
    marks: {},
    rule: { label: '名残の一撃', on: 'markLost', when: [], do: [{ type: 'grantBuff', label: '名残の一撃', add: 1, tags: ['weapon'], duration: 6000, charges: 2 }] },
  },
  stillnessToEdge: {
    no: 434,
    text: '〈静寂〉が消えるとき、失った数だけ〈研ぎ〉を得る',
    cost: 25,
    marks: { gives: ['edge'], uses: ['stillness'] },
    rule: { label: '破れた静寂', on: 'markLost', mark: 'stillness', when: [], do: [{ type: 'gainMark', mark: 'edge', amount: 0, per: 1 }] },
  },
  // 埋み火(印が消えるまでの時間を延ばす。大技まで貯める)
  longEmber: {
    no: 441,
    text: '〈熾り〉が消えるまでの時間が3倍',
    cost: 15,
    marks: { uses: ['ember'] },
    rule: { label: '埋み火', on: 'markKeep', mark: 'ember', when: [], scale: 3 },
  },
  restingEdge: {
    no: 442,
    text: '〈研ぎ〉が消えるまでの時間が3倍',
    cost: 15,
    marks: { uses: ['edge'] },
    rule: { label: '研ぎ置き', on: 'markKeep', mark: 'edge', when: [], scale: 3 },
  },
  clottedBlood: {
    no: 443,
    text: '〈血潮〉が消えるまでの時間が3倍',
    cost: 15,
    marks: { uses: ['blood'] },
    rule: { label: '凝る血', on: 'markKeep', mark: 'blood', when: [], scale: 3 },
  },
  deepQuiet: {
    no: 444,
    text: '〈静寂〉が消えるまでの時間が3倍',
    cost: 15,
    marks: { uses: ['stillness'] },
    rule: { label: '深い静寂', on: 'markKeep', mark: 'stillness', when: [], scale: 3 },
  },
  endlessPrayer: {
    no: 445,
    text: '全ての印が消えるまでの時間が2倍',
    cost: 25,
    marks: {},
    rule: { label: '絶えぬ祈り', on: 'markKeep', when: [], scale: 2 },
  },
  // 技の手(印を溜める・保つ・使う技に効く)
  gathererHand: {
    no: 451,
    text: '印を溜める技の与ダメージ+50%',
    cost: 30,
    marks: {},
    rule: { label: '溜め手', on: 'damage', when: [{ type: 'hitHasTag', tag: 'markGain' }], add: 0.5 },
  },
  keeperHand: {
    no: 452,
    text: '印を保つ技の与ダメージ+70%',
    cost: 35,
    marks: {},
    rule: { label: '保ち手の誇り', on: 'damage', when: [{ type: 'hitHasTag', tag: 'markHold' }], add: 0.7 },
  },
  spenderHand: {
    no: 453,
    text: '印を使う技の与ダメージ×1.5',
    cost: 55,
    stacking: 'mult',
    marks: {},
    rule: { label: '使い手の欲', on: 'damage', when: [{ type: 'hitHasTag', tag: 'markSpend' }], add: 0.5 },
  },
  gathererZeal: {
    no: 454,
    text: '印を溜める技を当てると、〈研ぎ〉も1つ得る',
    cost: 20,
    marks: { gives: ['edge'] },
    rule: { label: '溜め手の熱', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'hitHasTag', tag: 'markGain' }], do: [{ type: 'gainMark', mark: 'edge', amount: 1 }] },
  },
  // 倹約(使った印の一部が戻る・別の印になる)
  edgeThrift: {
    no: 461,
    text: '〈研ぎ〉を使うたび、使った数の3割を取り戻す',
    cost: 30,
    marks: { gives: ['edge'], uses: ['edge'] },
    rule: { label: '研ぎの倹約', on: 'markSpent', mark: 'edge', when: [], do: [{ type: 'gainMark', mark: 'edge', amount: 0, per: 0.3 }] },
  },
  quietThrift: {
    no: 462,
    text: '〈静寂〉を使うたび、使った数の3割を取り戻す',
    cost: 30,
    marks: { gives: ['stillness'], uses: ['stillness'] },
    rule: { label: '静寂の倹約', on: 'markSpent', mark: 'stillness', when: [], do: [{ type: 'gainMark', mark: 'stillness', amount: 0, per: 0.3 }] },
  },
  bloodPrice: {
    no: 463,
    text: '〈血潮〉を使うたび、使った数だけ〈熾り〉を得る',
    cost: 25,
    marks: { gives: ['ember'], uses: ['blood'] },
    rule: { label: '血の代価', on: 'markSpent', mark: 'blood', when: [], do: [{ type: 'gainMark', mark: 'ember', amount: 0, per: 1 }] },
  },
  prayerWhet: {
    no: 464,
    text: '〈祈り〉を使うたび、使った数の半分の〈研ぎ〉を得る',
    cost: 20,
    marks: { gives: ['edge'], uses: ['prayer'] },
    rule: { label: '祈りの研ぎ', on: 'markSpent', mark: 'prayer', when: [], do: [{ type: 'gainMark', mark: 'edge', amount: 0, per: 0.5 }] },
  },
  emberToQuiet: {
    no: 465,
    text: '〈熾り〉を使うたび、使った数の半分の〈静寂〉を得る',
    cost: 20,
    marks: { gives: ['stillness'], uses: ['ember'] },
    rule: { label: '燃え尽きの静けさ', on: 'markSpent', mark: 'ember', when: [], do: [{ type: 'gainMark', mark: 'stillness', amount: 0, per: 0.5 }] },
  },
  // 大放ち(30溜めて一度に使う。小さく吐く札より、印1つあたりが重い)
  emberCataclysm: {
    no: 471,
    text: '〈熾り〉が30以上あれば、次に当てたとき30使い、1つにつき火の追撃(威力15)を落とす',
    cost: 50,
    marks: { uses: ['ember'] },
    rule: { label: '熾りの大破裂', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfMarks', mark: 'ember', min: 30 }], do: [{ type: 'spendMarks', mark: 'ember', min: 30, amount: 30, each: [{ type: 'strike', element: 'fire', power: 15, buildup: 10 }] }] },
  },
  edgeCataclysm: {
    no: 472,
    text: '〈研ぎ〉が30以上あれば、次に当てた技が30使い、1つにつき威力3割で1回多く当たる',
    cost: 50,
    marks: { uses: ['edge'] },
    rule: { label: '千の研ぎ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfMarks', mark: 'edge', min: 30 }], do: [{ type: 'spendMarks', mark: 'edge', min: 30, amount: 30, each: [{ type: 'repeatHit', power: 0.3, times: 1 }] }] },
  },
  bloodCataclysm: {
    no: 473,
    text: '〈血潮〉が30以上あれば、次に当てたとき30使い、1つにつき血の追撃(威力12)を落とす',
    cost: 50,
    marks: { uses: ['blood'] },
    rule: { label: '血の奔流', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfMarks', mark: 'blood', min: 30 }], do: [{ type: 'spendMarks', mark: 'blood', min: 30, amount: 30, each: [{ type: 'strike', element: 'blood', power: 12, buildup: 10 }] }] },
  },
  stillCataclysm: {
    no: 474,
    text: '〈静寂〉が30以上あれば、次に当てた遠攻撃が30使い、1つにつき刺の追撃(威力12)を落とす',
    cost: 50,
    marks: { uses: ['stillness'] },
    rule: { label: '静寂の一閃', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'hitHasTag', tag: 'ranged' }, { type: 'selfMarks', mark: 'stillness', min: 30 }], do: [{ type: 'spendMarks', mark: 'stillness', min: 30, amount: 30, each: [{ type: 'strike', element: 'pierce', power: 12, buildup: 8 }] }] },
  },
  prayerCataclysm: {
    no: 475,
    text: '〈祈り〉が30以上あれば、次に当てた攻撃が7倍になり、30使う',
    cost: 50,
    marks: { uses: ['prayer'] },
    rule: { label: '大いなる祈り', on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'selfMarks', mark: 'prayer', min: 30 }], add: 6 },
    extraRules: [{ label: '大いなる祈り', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'selfMarks', mark: 'prayer', min: 30 }], do: [{ type: 'spendMarks', mark: 'prayer', min: 30, amount: 30 }] }],
  },
  // 見切り・受け・状態の発動から生む
  dodgeQuiet: {
    no: 481,
    text: 'ジャスト回避すると〈静寂〉を3つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '見切りの静寂', on: 'justDodge', when: [], do: [{ type: 'gainMark', mark: 'stillness', amount: 3 }] },
  },
  guardBlood: {
    no: 482,
    text: 'ジャストガードすると〈血潮〉を3つ得る',
    cost: 15,
    marks: { gives: ['blood'] },
    rule: { label: '受けの血潮', on: 'justGuard', when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 3 }] },
  },
  igniteEmber: {
    no: 483,
    text: '敵が炎上すると〈熾り〉を3つ得る',
    cost: 15,
    marks: { gives: ['ember'] },
    rule: { label: '点火', on: 'statusActivate', when: [{ type: 'statusIs', status: 'burn' }], do: [{ type: 'gainMark', mark: 'ember', amount: 3 }] },
  },
  shockEmber: {
    no: 484,
    text: '敵が感電すると〈熾り〉を2つ得る',
    cost: 15,
    marks: { gives: ['ember'] },
    rule: { label: '雷の火種', on: 'statusActivate', when: [{ type: 'statusIs', status: 'shock' }], do: [{ type: 'gainMark', mark: 'ember', amount: 2 }] },
  },
  bleedEdge: {
    no: 485,
    text: '敵が出血すると〈研ぎ〉を3つ得る',
    cost: 15,
    marks: { gives: ['edge'] },
    rule: { label: '血の研ぎ', on: 'statusActivate', when: [{ type: 'statusIs', status: 'bleed' }], do: [{ type: 'gainMark', mark: 'edge', amount: 3 }] },
  },
  freezeQuiet: {
    no: 486,
    text: '敵が凍結すると〈静寂〉を4つ得る',
    cost: 15,
    marks: { gives: ['stillness'] },
    rule: { label: '凍てる静寂', on: 'statusActivate', when: [{ type: 'statusIs', status: 'frozen' }], do: [{ type: 'gainMark', mark: 'stillness', amount: 4 }] },
  },
  doomPrayer: {
    no: 487,
    text: '敵が昏倒すると〈祈り〉を3つ得る',
    cost: 15,
    marks: { gives: ['prayer'] },
    rule: { label: '跪かせる祈り', on: 'statusActivate', when: [{ type: 'statusIs', status: 'stun' }], do: [{ type: 'gainMark', mark: 'prayer', amount: 3 }] },
  },
  // 代償(強いが、印を抱えるほど危うい)
  bloodDebt: {
    no: 491,
    text: '〈血潮〉1つにつき与ダメージ+12%。〈血潮〉が10以上のとき被ダメージ+30%',
    cost: 30,
    marks: { uses: ['blood'] },
    rule: { label: '血の借り', on: 'damage', when: [], add: 0.12, perMark: 'blood' },
    extraRules: [{ label: '血の借り', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfMarks', mark: 'blood', min: 10 }], add: 0.3 }],
  },
  heavyEdge: {
    no: 492,
    text: '〈研ぎ〉が20以上のとき近攻撃の与ダメージ+100%、移動速度-20%',
    cost: 35,
    marks: { uses: ['edge'] },
    rule: { label: '重い研ぎ', on: 'damage', when: [{ type: 'hitHasTag', tag: 'melee' }, { type: 'selfMarks', mark: 'edge', min: 20 }], add: 1 },
    extraRules: [{ label: '重い研ぎ', on: 'stat', stat: 'moveSpeed', when: [{ type: 'selfMarks', mark: 'edge', min: 20 }], add: -0.2 }],
  },
  // 被弾でこぼれる印を守る・活かす
  steadyHeart: {
    no: 493,
    text: '直撃を受けて失う印が半分になる',
    cost: 25,
    marks: {},
    rule: { label: '据わった肝', on: 'stat', stat: 'markLoss', when: [], add: -0.5 },
  },
  shieldKeep: {
    no: 494,
    text: '盾が張られている間、直撃を受けても印を失わない',
    cost: 30,
    marks: {},
    rule: { label: '盾の内の印', on: 'stat', stat: 'markLoss', when: [{ type: 'selfShieldReady' }], add: -1 },
  },
  spilledFury: {
    no: 495,
    text: '直撃で印をこぼすたび、こぼした数の分だけ〈血潮〉を得る',
    cost: 25,
    marks: { gives: ['blood'] },
    rule: { label: 'こぼれた怒り', on: 'markLost', cause: 'hurt', when: [], do: [{ type: 'gainMark', mark: 'blood', amount: 0, per: 1 }] },
  },
  // ---- 手で撃つ印の技と噛み合う札(遊び方が変わる札) ----
  dodgeArt: {
    no: 501,
    text: 'ジャスト回避から2秒以内に撃った枠の印の技は、使った印を全て取り戻す',
    cost: 45,
    marks: {},
    rule: { label: '見切りの一閃', on: 'markSpent', when: [{ type: 'spentByArt' }, { type: 'afterJustDodge', within: 2000 }], do: [{ type: 'gainMark', mark: 'source', amount: 0, per: 1, flat: true }] },
  },
  cashRush: {
    no: 502,
    text: '枠の印の技で印を100以上使うと、続く4つの技の振りかぶりと硬直が半分',
    cost: 30,
    marks: {},
    rule: { label: '換金の勢い', on: 'markSpent', when: [{ type: 'spentByArt' }, { type: 'spentAtLeast', min: 100 }], do: [{ type: 'quicken', scale: 0.5, charges: 4, duration: 8000 }] },
  },
  breathAfter: {
    no: 503,
    text: '枠の印の技を撃ってから4秒、被ダメージ-50%',
    cost: 30,
    marks: {},
    rule: { label: '呼吸の間', on: 'markSpent', when: [{ type: 'spentByArt' }], do: [{ type: 'grantBuff', label: '呼吸の間', add: 0, tags: ['__none'], duration: 4000 }] },
    extraRules: [{ label: '呼吸の間', on: 'stat', stat: 'damageTaken', when: [{ type: 'selfHasBuff', label: '呼吸の間' }], add: -0.5 }],
  },
  hoarder: {
    no: 504,
    text: '印が50以上ある間、その印を得るたびにもう1つ得る(撃たずに我慢するほど溜まる)',
    cost: 35,
    marks: {},
    rule: { label: '溜め込みの欲', on: 'markGained', mark: 'ember', when: [{ type: 'selfMarks', mark: 'ember', min: 50 }], do: [{ type: 'gainMark', mark: 'ember', amount: 1, flat: true }] },
    extraRules: [
      { label: '溜め込みの欲', on: 'markGained', mark: 'edge', when: [{ type: 'selfMarks', mark: 'edge', min: 50 }], do: [{ type: 'gainMark', mark: 'edge', amount: 1, flat: true }] },
      { label: '溜め込みの欲', on: 'markGained', mark: 'blood', when: [{ type: 'selfMarks', mark: 'blood', min: 50 }], do: [{ type: 'gainMark', mark: 'blood', amount: 1, flat: true }] },
      { label: '溜め込みの欲', on: 'markGained', mark: 'stillness', when: [{ type: 'selfMarks', mark: 'stillness', min: 50 }], do: [{ type: 'gainMark', mark: 'stillness', amount: 1, flat: true }] },
      { label: '溜め込みの欲', on: 'markGained', mark: 'prayer', when: [{ type: 'selfMarks', mark: 'prayer', min: 50 }], do: [{ type: 'gainMark', mark: 'prayer', amount: 1, flat: true }] },
    ],
  },
  deathsDoorArt: {
    no: 505,
    text: '瀕死のとき、枠の印の技の与ダメージ×2',
    cost: 40,
    stacking: 'mult',
    marks: {},
    rule: { label: '死中の閃き', on: 'damage', when: [{ type: 'hitHasTag', tag: 'art' }, { type: 'attackerHas', status: 'dying' }], add: 1 },
  },
  afterglow: {
    no: 506,
    text: '枠の印の技を撃つと、全てのクールダウンが2秒縮む',
    cost: 30,
    marks: {},
    rule: { label: '余韻', on: 'markSpent', when: [{ type: 'spentByArt' }], do: [{ type: 'cooldown', ms: 2000 }] },
  },
  spentEmbers: {
    no: 507,
    text: '枠の印の技で使った印の2割を、〈熾り〉として得る',
    cost: 25,
    marks: { gives: ['ember'] },
    rule: { label: '換金の火種', on: 'markSpent', when: [{ type: 'spentByArt' }], do: [{ type: 'gainMark', mark: 'ember', amount: 0, per: 0.2, flat: true }] },
  },
  stillArt: {
    no: 508,
    text: '1秒以上足を止めて撃った枠の印の技は、与ダメージ×1.5',
    cost: 35,
    stacking: 'mult',
    marks: {},
    rule: { label: '据えた一撃', on: 'damage', when: [{ type: 'hitHasTag', tag: 'art' }, { type: 'selfStill', ms: 1000 }], add: 0.5 },
  },
  counterArt: {
    no: 509,
    text: '直撃を受けてから2秒以内に撃った枠の印の技は、与ダメージ×2(印を剥がされた直後の反撃)',
    cost: 40,
    stacking: 'mult',
    marks: {},
    rule: { label: '剥がれ際の反撃', on: 'damage', when: [{ type: 'hitHasTag', tag: 'art' }, { type: 'afterHurt', within: 2000 }], add: 1 },
  },
  // ---- 生成力を伸ばす札(溜まっている量で、得る印が増える。別の印の量で伸ばす) ----
  prayerFurnace: {
    no: 511,
    text: '〈祈り〉50ごとに、札から得る〈熾り〉が1倍ずつ増える',
    cost: 25,
    marks: { gives: ['ember'], uses: ['prayer'] },
    rule: { label: '祈りの炉', on: 'markGrowth', mark: 'ember', by: 'prayer', per: 50, when: [] },
  },
  bloodForge: {
    no: 512,
    text: '〈血潮〉50ごとに、札から得る〈研ぎ〉が1倍ずつ増える',
    cost: 25,
    marks: { gives: ['edge'], uses: ['blood'] },
    rule: { label: '血の研ぎ場', on: 'markGrowth', mark: 'edge', by: 'blood', per: 50, when: [] },
  },
  quietDepth: {
    no: 513,
    text: '〈静寂〉50ごとに、札から得る〈祈り〉が1倍ずつ増える',
    cost: 25,
    marks: { gives: ['prayer'], uses: ['stillness'] },
    rule: { label: '静寂の深み', on: 'markGrowth', mark: 'prayer', by: 'stillness', per: 50, when: [] },
  },
  emberSmithy: {
    no: 514,
    text: '〈熾り〉50ごとに、札から得る〈血潮〉が1倍ずつ増える',
    cost: 25,
    marks: { gives: ['blood'], uses: ['ember'] },
    rule: { label: '熾りの鍛冶', on: 'markGrowth', mark: 'blood', by: 'ember', per: 50, when: [] },
  },
  edgeEye: {
    no: 515,
    text: '〈研ぎ〉50ごとに、札から得る〈静寂〉が1倍ずつ増える',
    cost: 25,
    marks: { gives: ['stillness'], uses: ['edge'] },
    rule: { label: '研ぎの目', on: 'markGrowth', mark: 'stillness', by: 'edge', per: 50, when: [] },
  },
  selfFeeding: {
    no: 516,
    text: '札から得る印が、その印の量50ごとにさらに1倍ずつ増える(溜まるほど速く溜まる)',
    cost: 40,
    marks: {},
    rule: { label: '己を糧に', on: 'markGrowth', by: 'self', per: 50, when: [] },
  },
  vastVessel: {
    no: 517,
    text: '印の合計が1000以上のとき、札から得る印が全て、〈祈り〉20ごとに1倍ずつ増える',
    cost: 35,
    marks: { uses: ['prayer'] },
    rule: { label: '大いなる器', on: 'markGrowth', by: 'prayer', per: 20, when: [{ type: 'selfMarksTotal', min: 1000 }] },
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

/** 印の札(印を生む・変える・使う条件文) */
export const MARK_CONDITION_IDS = HANDMADE_CONDITION_IDS.filter((id) => !!(HANDMADE[id] as ConditionDef).marks) as ConditionId[];

export function conditionDef(id: ConditionId): ConditionDef {
  return CONDITIONS[id]!;
}

/**
 * 条件文の与ダメージの重なり方。札に「+」「×」として出す。
 * 'add' は条件文どうしの足し算、'mult' は他と掛け算、'link' は繋ぎどうしの足し算(繋ぎの束は他と掛け算)、'none' は与ダメージに効かない
 */
export function conditionStacking(id: ConditionId): 'add' | 'mult' | 'link' | 'none' {
  const def = conditionDef(id);
  const damage = [def.rule, ...(def.extraRules ?? [])].some((r) => r.on === 'damage');
  if (!damage) return 'none';
  if (def.link) return 'link';
  return def.stacking === 'mult' ? 'mult' : 'add';
}

/** 足し算の条件文がまとまる種類の名前 */
export const CONDITION_ADD_GROUP = 'condition';
