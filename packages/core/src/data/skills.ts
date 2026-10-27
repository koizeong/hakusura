import type { ElementId } from './elements';
import type { FieldId } from './fields';
import { toWeaponSpec, weaponDef, type WeaponKind, type WeaponRef, type WeaponSpec, type WeaponTypeId } from './weapons';
import { missingPoints, shortfallPenalty, type AttributeNeeds, type Attributes } from './attributes';
import type { Predicate, Rule } from '../rules';
import type { StatusId } from './statuses';
import { VARIATIONS, applyVariations, variantName, type SkillVariant, type VariationDef } from './variations';

/** スキルの6分類。分類もタグとしてヒットに乗る */
export const SKILL_CATEGORIES = {
  melee: '近攻撃',
  ranged: '遠攻撃',
  imbue: '付与',
  summon: '召喚',
  guard: '防御',
  heal: '回復',
} as const;
export type SkillCategory = keyof typeof SKILL_CATEGORIES;

export type SkillAction =
  /**
   * 狙った方向の扇形 arc 度、range ピクセルに当たる。clearsProjectiles なら範囲内の敵の弾をかき消す。
   * hits があれば、1回振るごとに hits 回当たる
   */
  | { type: 'melee'; range: number; arc: number; power: number; buildup: number; clearsProjectiles?: boolean; hits?: number }
  /** 自分の周り radius の相手全てに当たる */
  | { type: 'nova'; radius: number; power: number; buildup: number; hits?: number }
  /** 狙った相手の足元に、一定時間だけ床の状態を敷く */
  | { type: 'floor'; field: FieldId; radius: number; duration: number }
  /** 自分に効く。最大HPの heal だけ回復し、status を満タンにする */
  | { type: 'selfCare'; heal?: number; status?: StatusId }
  /** 敵を呼ぶ(ENEMIES の名前)。fromCorpse なら近くの死体を起こし、死体は消える。呼んだ者が max 体を超えない */
  | { type: 'summon'; enemy: string; count: number; max: number; radius: number; fromCorpse?: boolean }
  /**
   * 相手の背後か正面へ一瞬で移る。at なら、振りかぶったときに狙った所へ降りる(見てから離れれば避けられる)。
   * land があれば、降りた所の周り radius に当たり、飛んでいれば地に降りる
   */
  | {
      type: 'blink';
      where: 'behind' | 'front' | 'at';
      distance: number;
      range: number;
      land?: { radius: number; power: number; buildup: number };
    }
  /**
   * duration の間、空へ飛び上がる。飛んでいる間は近攻撃と周りに放つ技が届かず、床も踏まない。
   * land があれば、飛ぶ時間が切れたとき一番近い相手へその技(急降下など)で降りる
   */
  | { type: 'takeOff'; duration: number; land?: string }
  /** radius 内の仲間を最大HPの ratio だけ癒す。腐敗していれば傷になる */
  | { type: 'healAllies'; ratio: number; radius: number }
  /** count 発を spread 度ずつずらして撃つ。pierce があれば、その数だけ相手を貫いて飛び続ける */
  | {
      type: 'projectile';
      speed: number;
      range: number;
      radius: number;
      power: number;
      buildup: number;
      count?: number;
      spread?: number;
      pierce?: number;
      /** 当たると弾け、周り radius の相手にも ratio の威力で当たる */
      explode?: { radius: number; ratio: number };
    }
  /** 一定時間、武器の攻撃に属性の追撃を乗せる */
  | { type: 'imbue'; ratio: number; buildup: number; duration: number }
  /**
   * 弾をまとめて撃つ。ring は全方位に等間隔、fan は狙った方向へ spread 度に広げる。
   * spin を与えると、撃つたびに ring の向きがずれる
   */
  | {
      type: 'barrage';
      pattern: 'ring' | 'fan';
      count: number;
      spread?: number;
      spin?: number;
      speed: number;
      radius: number;
      range: number;
      power: number;
      buildup: number;
    }
  /** 一定時間、天候を変える */
  | { type: 'weather'; field: FieldId; duration: number };

interface SkillBase {
  name: string;
  category: SkillCategory;
  /** 画面に出す説明 */
  description?: string;
  tags: readonly string[];
  /** 必要な能力値。足りなくても使えるが、威力が落ち間隔が延びる */
  needs?: AttributeNeeds;
}

/** 数値を自分で持つスキル。付与・切り札・敵のスキル */
export interface FixedSkillDef extends SkillBase {
  /** 攻撃と付与のスキルは必ず持つ */
  element?: ElementId;
  /** 使ってから効果が出るまでの振りかぶり(ミリ秒)。この間に昏倒すると潰れる */
  windup: number;
  /** 効果が出た後の硬直(ミリ秒)。回避でだけ抜けられる */
  recovery: number;
  /** 使ってから再び使えるまで(ミリ秒) */
  cooldown: number;
  action: SkillAction;
  /** このスキルで当てたときだけ効くルール(宣告の矢の死の宣告など) */
  rules?: readonly Rule[];
  /** true なら飛んでいる間だけ、false なら地にいる間だけ使える */
  aloft?: boolean;
  /** 現れてから最初に使えるまで(ミリ秒)。なければすぐ(少しずらして)使う */
  opening?: number;
}

/**
 * 技。着けている武器の数値に倍率を掛けて使う。requires を満たす武器がなければ使えない。
 * swing は近接の武器を振る、shot は遠距離の武器で撃つ、nova は自分の周りに放つ
 */
export interface Technique {
  /** 使える武器。tag は武器のタグ(杖・槍など) */
  requires: { kind?: WeaponKind; element?: ElementId; tag?: string };
  shape: 'swing' | 'shot' | 'nova';
  /** 武器の威力・間隔・振りかぶりと硬直・射程・蓄積に掛ける倍率 */
  power: number;
  interval: number;
  windup?: number;
  range?: number;
  buildup?: number;
  /** swing の扇の角度(度)。なければ武器の角度 */
  arc?: number;
  /** 扇の角度に掛ける倍率(変化から) */
  arcScale?: number;
  /** shot の弾の数とずらす角度 */
  count?: number;
  spread?: number;
  /** nova の半径 */
  radius?: number;
  /** 1回で何回当たるか(swing と nova) */
  hits?: number;
  /** 弾が貫く数(shot) */
  pierce?: number;
  /** 弾が当たると弾ける(shot)。武器も弾けるなら、広い方を使う */
  explode?: { radius: number; ratio: number };
  /** この技で当てたときだけ効くルール */
  rules?: readonly Rule[];
}

export interface TechniqueDef extends SkillBase {
  technique: Technique;
}

export type ActiveSkillDef = FixedSkillDef | TechniqueDef;

export function isTechnique(def: ActiveSkillDef): def is TechniqueDef {
  return 'technique' in def;
}

/** アクティブスキル。技は武器で、それ以外は自分の数値で出る */
export const ACTIVE_SKILLS = {
  slash: {
    name: '斬りつけ',
    category: 'melee',
    description: '武器をそのまま振る',
    tags: ['attack'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 1, interval: 1 },
  },
  sweep: {
    name: '薙ぎ払い',
    category: 'melee',
    description: '広く薙ぐ。扇が180度になり、少し遅い',
    needs: { str: 12 },
    tags: ['attack'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 0.9, interval: 1.3, arc: 180 },
  },
  thrust: {
    name: '突き',
    category: 'melee',
    description: '細く遠くまで突く。射程が1.6倍、扇は30度',
    needs: { dex: 14 },
    tags: ['attack'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 1.1, interval: 1.1, range: 1.6, arc: 30 },
  },
  whirlwind: {
    name: '旋風',
    category: 'melee',
    description: '周り全てを薙ぎ、弾もまとめてかき消す(二刀流向け)',
    needs: { dex: 16 },
    tags: ['attack', 'dual'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 0.8, interval: 1.4, range: 0.95, arc: 360 },
  },
  cleave: {
    name: '叩き割り',
    category: 'melee',
    description: '大きく振りかぶって叩き割る。威力2.2倍、間隔2倍',
    needs: { str: 20 },
    tags: ['attack'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 2.2, interval: 2, windup: 1.6 },
  },
  gouge: {
    name: '抉り',
    category: 'melee',
    description: '斬の武器で抉る。蓄積が2倍(二刀流向け)',
    needs: { dex: 14 },
    tags: ['attack', 'dual'],
    technique: { requires: { kind: 'melee', element: 'slash' }, shape: 'swing', power: 0.8, interval: 1.1, buildup: 2, arc: 90 },
  },
  scorch: {
    name: '焼き払い',
    category: 'melee',
    description: '火の武器で焼き払う。扇が200度になり、蓄積が1.4倍',
    needs: { fai: 14 },
    tags: ['attack'],
    technique: { requires: { kind: 'melee', element: 'fire' }, shape: 'swing', power: 0.9, interval: 1.4, buildup: 1.4, arc: 200 },
  },
  shoot: {
    name: '射撃',
    category: 'ranged',
    description: '武器をそのまま撃つ',
    tags: ['attack'],
    technique: { requires: { kind: 'ranged' }, shape: 'shot', power: 1, interval: 1 },
  },
  volley: {
    name: '三連射',
    category: 'ranged',
    description: '3発を扇に撃つ。1発ごとの威力は半分',
    needs: { dex: 16 },
    tags: ['attack'],
    technique: { requires: { kind: 'ranged' }, shape: 'shot', power: 0.5, interval: 1.5, count: 3, spread: 12 },
  },
  aimedShot: {
    name: '狙い撃ち',
    category: 'ranged',
    description: 'じっくり狙う。威力2.4倍、射程1.3倍、間隔2.2倍',
    needs: { dex: 18 },
    tags: ['attack'],
    technique: { requires: { kind: 'ranged' }, shape: 'shot', power: 2.4, interval: 2.2, range: 1.3, windup: 1.8 },
  },
  discharge: {
    name: '放電',
    category: 'melee',
    description: '雷の武器から周りへ放つ。蓄積が1.5倍',
    needs: { int: 16 },
    tags: ['attack'],
    technique: { requires: { element: 'lightning' }, shape: 'nova', power: 0.9, interval: 2.2, buildup: 1.5, radius: 150 },
  },
  flurry: {
    name: '連撃',
    category: 'melee',
    description: '細かく3回斬る。1回ごとの威力は4割',
    needs: { dex: 12 },
    tags: ['attack', 'dual'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 0.4, interval: 1.1, hits: 3, buildup: 0.5, arc: 100 },
  },
  lunge: {
    name: '踏み込み',
    category: 'melee',
    description: '踏み込んで斬る。射程1.4倍、扇は70度',
    needs: { str: 10, dex: 10 },
    tags: ['attack'],
    technique: { requires: { kind: 'melee' }, shape: 'swing', power: 1.15, interval: 1.2, range: 1.4, arc: 70 },
  },
  breaker: {
    name: '崩し',
    category: 'melee',
    description: '体勢を崩す。威力は低いが、当てると昏倒が溜まる',
    needs: { str: 14 },
    tags: ['attack'],
    technique: {
      requires: { kind: 'melee' },
      shape: 'swing',
      power: 0.6,
      interval: 1.3,
      rules: [{ label: '崩し', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'stun', amount: 35 }] }],
    },
  },
  bloodCut: {
    name: '血の一閃',
    category: 'melee',
    description: '斬の武器で、自分の血も払って斬る。威力1.8倍、当てると自分に出血が溜まる',
    needs: { dex: 12 },
    tags: ['attack'],
    technique: {
      requires: { kind: 'melee', element: 'slash' },
      shape: 'swing',
      power: 1.8,
      interval: 1.4,
      rules: [{ label: '血の一閃', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'bleed', amount: 30, to: 'attacker' }] }],
    },
  },
  quake: {
    name: '地鳴り',
    category: 'melee',
    description: '重い武器で地を叩き、周りを揺らす。当てると昏倒が溜まる',
    needs: { str: 18 },
    tags: ['attack'],
    technique: {
      requires: { kind: 'melee' },
      shape: 'nova',
      power: 0.9,
      interval: 1.9,
      windup: 1.5,
      radius: 130,
      rules: [{ label: '地鳴り', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'stun', amount: 25 }] }],
    },
  },
  scatterShot: {
    name: '散弾',
    category: 'ranged',
    description: '近くへ5発をばら撒く。射程は半分、1発ごとの威力は3割',
    tags: ['attack'],
    technique: { requires: { kind: 'ranged' }, shape: 'shot', power: 0.3, interval: 1.2, range: 0.5, count: 5, spread: 9 },
  },
  pierceShot: {
    name: '貫き撃ち',
    category: 'ranged',
    description: '弾が3体まで貫いて飛ぶ',
    needs: { dex: 14 },
    tags: ['attack'],
    technique: { requires: { kind: 'ranged' }, shape: 'shot', power: 0.85, interval: 1.4, pierce: 3 },
  },
  quickShot: {
    name: '牽制射',
    category: 'ranged',
    description: '素早く撃つ。威力は5割、間隔は半分',
    tags: ['attack'],
    technique: { requires: { kind: 'ranged' }, shape: 'shot', power: 0.5, interval: 0.5, windup: 0.6 },
  },
  burstBolt: {
    name: '炸裂弾',
    category: 'ranged',
    description: '杖の魔弾を大きく弾けさせる。周りにも7割の威力',
    needs: { int: 14 },
    tags: ['attack', 'magic'],
    technique: { requires: { kind: 'ranged', tag: 'staff' }, shape: 'shot', power: 1.1, interval: 1.5, windup: 1.3, explode: { radius: 100, ratio: 0.7 } },
  },
  soulOrbs: {
    name: '漂う魂',
    category: 'ranged',
    description: '杖から魂を3つ放つ。1つごとの威力は4割',
    needs: { int: 12 },
    tags: ['attack', 'magic'],
    technique: { requires: { kind: 'ranged', tag: 'staff' }, shape: 'shot', power: 0.4, interval: 1.2, count: 3, spread: 26 },
  },
  prayerTorrent: {
    name: '祈りの奔流',
    category: 'ranged',
    description: '杖を掲げ、周りに属性の奔流を放つ',
    needs: { fai: 12 },
    tags: ['attack', 'magic'],
    technique: { requires: { tag: 'staff' }, shape: 'nova', power: 0.8, interval: 1.6, radius: 150, windup: 1.4 },
  },
  emberOil: {
    name: '燠火の塗油',
    category: 'imbue',
    element: 'fire',
    description: '一定時間、武器の攻撃に火の追撃が乗る',
    needs: { fai: 12 },
    tags: ['buff'],
    windup: 500,
    recovery: 300,
    cooldown: 20000,
    action: { type: 'imbue', ratio: 0.5, buildup: 40, duration: 15000 },
  },
  /** 武器に雷を纏わせる */
  stormOil: {
    name: '雷の塗油',
    category: 'imbue',
    element: 'lightning',
    description: '一定時間、武器の攻撃に雷の追撃が乗る',
    needs: { int: 12 },
    tags: ['buff'],
    windup: 500,
    recovery: 300,
    cooldown: 20000,
    action: { type: 'imbue', ratio: 0.45, buildup: 40, duration: 15000 },
  },
  /** 切り札。tags に trump を持つスキルから1つ選んでビルドに入れる */
  rainBell: {
    name: '雨乞いの鈴',
    category: 'imbue',
    description: '12秒、雨を呼ぶ。全員が濡れる',
    needs: { fai: 16 },
    tags: ['buff', 'trump'],
    windup: 600,
    recovery: 300,
    cooldown: 40000,
    action: { type: 'weather', field: 'rain', duration: 12000 },
  },
  oilFlask: {
    name: '油壺の投擲',
    category: 'imbue',
    description: '狙った敵の足元に油溜まりを撒く(10秒)',
    tags: ['trump'],
    windup: 400,
    recovery: 300,
    cooldown: 30000,
    action: { type: 'floor', field: 'oilPool', radius: 140, duration: 10000 },
  },
  fogHorn: {
    name: '霧笛',
    category: 'imbue',
    description: '15秒、霧を呼ぶ。弾は遠くへ届かず、背後からの奇襲が効く',
    needs: { int: 12 },
    tags: ['buff', 'trump'],
    windup: 600,
    recovery: 300,
    cooldown: 40000,
    action: { type: 'weather', field: 'fog', duration: 15000 },
  },
  lampSnuff: {
    name: '灯消し',
    category: 'imbue',
    description: '15秒、夜を呼ぶ。闇と呪いが強まる',
    needs: { int: 14 },
    tags: ['buff', 'trump'],
    windup: 600,
    recovery: 300,
    cooldown: 40000,
    action: { type: 'weather', field: 'night', duration: 15000 },
  },
  waterFlask: {
    name: '水差しの投擲',
    category: 'imbue',
    description: '狙った敵の足元に水たまりを撒く(10秒)。凍らせれば凍った床になる',
    tags: ['trump'],
    windup: 400,
    recovery: 300,
    cooldown: 30000,
    action: { type: 'floor', field: 'puddle', radius: 140, duration: 10000 },
  },
  blessedPrayer: {
    name: '加護の祈り',
    category: 'heal',
    description: '最大HPの25%を癒し、次の直撃を1回無効にする加護を得る。腐敗していると癒しは傷になる',
    needs: { fai: 14 },
    tags: ['buff', 'trump', 'heal'],
    windup: 500,
    recovery: 300,
    cooldown: 35000,
    action: { type: 'selfCare', heal: 0.25, status: 'blessing' },
  },
  frenzyDraught: {
    name: '狂い水',
    category: 'imbue',
    description: '狂気に呑まれる。10秒、与ダメージ+80%だが、敵味方の区別なく当たる',
    tags: ['buff', 'trump'],
    windup: 300,
    recovery: 300,
    cooldown: 40000,
    action: { type: 'selfCare', status: 'madness' },
  },
  thunderPrayer: {
    name: '雷鳴の祈祷',
    category: 'melee',
    element: 'lightning',
    description: '周りの敵すべてに雷を落とし、感電させる',
    needs: { int: 18 },
    tags: ['attack', 'trump'],
    windup: 700,
    recovery: 400,
    cooldown: 45000,
    action: { type: 'nova', radius: 280, power: 30, buildup: 100 },
  },
  /** 案山子の反撃。大きく振りかぶるので見てから避けられる */
  strawSwipe: {
    name: '藁の薙ぎ',
    category: 'melee',
    element: 'slash',
    tags: ['attack', 'enemy'],
    windup: 900,
    recovery: 700,
    cooldown: 2600,
    action: { type: 'melee', range: 115, arc: 120, power: 36, buildup: 25 },
  },
  /** 案山子の弾幕。遅い弾を全方位に撒く */
  strawScatter: {
    name: '藁くずの散弾',
    category: 'ranged',
    element: 'slash',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 700,
    recovery: 300,
    cooldown: 5200,
    action: { type: 'barrage', pattern: 'ring', count: 9, spin: 17, speed: 170, radius: 6, range: 700, power: 14, buildup: 20 },
  },
  /** 案山子の弾幕。火の粉を扇に撒く。当たると燃える */
  emberFan: {
    name: '火の粉の扇',
    category: 'ranged',
    element: 'fire',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 600,
    recovery: 300,
    cooldown: 5600,
    action: { type: 'barrage', pattern: 'fan', count: 3, spread: 36, speed: 210, radius: 6, range: 650, power: 12, buildup: 30 },
  },
  /** 屍喰いの噛みつき。短く速い。出血を刻む */
  ghoulBite: {
    name: '噛みつき',
    category: 'melee',
    element: 'slash',
    tags: ['attack', 'enemy'],
    windup: 450,
    recovery: 450,
    cooldown: 1500,
    action: { type: 'melee', range: 46, arc: 90, power: 8, buildup: 30 },
  },
  /** 煤吹きの吐き出し。遅い火の粉を3つ扇に吐く */
  sootSpit: {
    name: '煤の吐き出し',
    category: 'ranged',
    element: 'fire',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 750,
    recovery: 350,
    cooldown: 3400,
    action: { type: 'barrage', pattern: 'fan', count: 3, spread: 28, speed: 190, radius: 7, range: 620, power: 11, buildup: 35 },
  },
  /** 錆鎧の叩きつけ。予兆が長く、当たると重い */
  rustSlam: {
    name: '錆鉄の叩きつけ',
    category: 'melee',
    element: 'slash',
    tags: ['attack', 'enemy'],
    windup: 1300,
    recovery: 1000,
    cooldown: 4200,
    action: { type: 'melee', range: 135, arc: 150, power: 60, buildup: 25 },
  },
  /** 油袋の吐き戻し。狙った相手の足元に油溜まりを撒く */
  oilSpew: {
    name: '油の吐き戻し',
    category: 'ranged',
    tags: ['enemy'],
    windup: 700,
    recovery: 500,
    cooldown: 5500,
    action: { type: 'floor', field: 'oilPool', radius: 75, duration: 9000 },
  },
  /** 油袋の体当たり。近いと押し付けてくる */
  bloatShove: {
    name: '膨れた体当たり',
    category: 'melee',
    element: 'slash',
    tags: ['attack', 'enemy'],
    windup: 600,
    recovery: 600,
    cooldown: 2400,
    action: { type: 'melee', range: 60, arc: 120, power: 14, buildup: 0 },
  },
  /** 鐘守の鐘。雨を呼ぶ。雨は火を消し、雷を倍にする */
  bellToll: {
    name: '弔いの鐘',
    category: 'imbue',
    tags: ['enemy'],
    windup: 1400,
    recovery: 600,
    cooldown: 22000,
    action: { type: 'weather', field: 'rain', duration: 14000 },
  },
  /** 鐘守の鐘の音。雷を帯びた輪がゆっくり広がる。濡れていると痛い */
  bellRing: {
    name: '鐘の残響',
    category: 'ranged',
    element: 'lightning',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 800,
    recovery: 400,
    cooldown: 4600,
    action: { type: 'barrage', pattern: 'ring', count: 10, spin: 18, speed: 130, radius: 6, range: 560, power: 9, buildup: 28 },
  },
  /** 屍術師。近くの死体を屍喰いとして起こす */
  raiseDead: {
    name: '死体起こし',
    category: 'summon',
    tags: ['enemy'],
    windup: 1200,
    recovery: 500,
    cooldown: 6500,
    action: { type: 'summon', enemy: 'ghoul', count: 2, max: 4, radius: 450, fromCorpse: true },
  },
  /** 屍術師の墓の矢。遅い腐れの矢 */
  graveBolt: {
    name: '墓の矢',
    category: 'ranged',
    element: 'rot',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 700,
    recovery: 300,
    cooldown: 3200,
    action: { type: 'barrage', pattern: 'fan', count: 2, spread: 16, speed: 200, radius: 7, range: 600, power: 9, buildup: 40 },
  },
  /** 棘の亡者のひっかき */
  huskClaw: {
    name: '亡者の爪',
    category: 'melee',
    element: 'pierce',
    tags: ['attack', 'enemy'],
    windup: 600,
    recovery: 500,
    cooldown: 2200,
    action: { type: 'melee', range: 60, arc: 110, power: 16, buildup: 35 },
  },
  /** 霜の巫女の霜の輪 */
  frostRing: {
    name: '霜の輪',
    category: 'ranged',
    element: 'ice',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 800,
    recovery: 400,
    cooldown: 4200,
    action: { type: 'barrage', pattern: 'ring', count: 8, spin: 22, speed: 150, radius: 7, range: 560, power: 9, buildup: 30 },
  },
  /** 霜の巫女。狙った相手の足元を凍らせる */
  frostFloor: {
    name: '凍てつく足元',
    category: 'ranged',
    tags: ['enemy'],
    windup: 900,
    recovery: 400,
    cooldown: 7000,
    action: { type: 'floor', field: 'iceFloor', radius: 90, duration: 8000 },
  },
  /** 影潜みの影渡り。相手の背後へ移る */
  shadowStep: {
    name: '影渡り',
    category: 'melee',
    tags: ['enemy'],
    windup: 300,
    recovery: 150,
    cooldown: 5500,
    action: { type: 'blink', where: 'behind', distance: 42, range: 450 },
  },
  /** 影潜みの影の刃。闇で目を奪う */
  shadowCut: {
    name: '影の刃',
    category: 'melee',
    element: 'dark',
    tags: ['attack', 'enemy'],
    windup: 350,
    recovery: 450,
    cooldown: 1600,
    action: { type: 'melee', range: 55, arc: 100, power: 16, buildup: 45 },
  },
  /** 疫病の運び手。瘴気を呼ぶ */
  miasmaCall: {
    name: '瘴気の祈り',
    category: 'imbue',
    tags: ['enemy'],
    windup: 1400,
    recovery: 500,
    cooldown: 26000,
    action: { type: 'weather', field: 'miasma', duration: 14000 },
  },
  /** 疫病の運び手。周りの仲間を癒す。腐っていれば傷になる */
  plagueMend: {
    name: '膿の癒し',
    category: 'heal',
    tags: ['enemy', 'heal'],
    windup: 900,
    recovery: 400,
    cooldown: 4500,
    action: { type: 'healAllies', ratio: 0.12, radius: 260 },
  },
  /** 宣告者の宣告の矢。当たると死の宣告が溜まる */
  doomBolt: {
    name: '宣告の矢',
    category: 'ranged',
    element: 'curse',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 900,
    recovery: 400,
    cooldown: 3600,
    action: { type: 'barrage', pattern: 'fan', count: 1, speed: 170, radius: 9, range: 680, power: 8, buildup: 30 },
    rules: [{ label: '宣告', on: 'hit', when: [], do: [{ type: 'applyBuildup', status: 'doom', amount: 28 }] }],
  },
  /** 血の狂信者の跳びかかり。相手の目の前へ */
  zealotLeap: {
    name: '跳びかかり',
    category: 'melee',
    tags: ['enemy'],
    windup: 550,
    recovery: 100,
    cooldown: 6000,
    action: { type: 'blink', where: 'front', distance: 34, range: 380 },
  },
  /** 血の狂信者の血裂き。血の攻撃で、出血した相手から吸う */
  bloodRend: {
    name: '血裂き',
    category: 'melee',
    element: 'blood',
    tags: ['attack', 'enemy'],
    windup: 450,
    recovery: 450,
    cooldown: 1500,
    action: { type: 'melee', range: 58, arc: 120, power: 14, buildup: 45 },
  },
  /** 巣袋。屍喰いを産む */
  spawnBrood: {
    name: '産み落とし',
    category: 'summon',
    tags: ['enemy'],
    windup: 1000,
    recovery: 300,
    cooldown: 5000,
    action: { type: 'summon', enemy: 'ghoul', count: 1, max: 4, radius: 60 },
  },
  /** 黙りの修道士の沈黙の輪。当たると静寂が溜まる */
  hushRing: {
    name: '沈黙の輪',
    category: 'ranged',
    element: 'dark',
    tags: ['attack', 'enemy', 'projectile'],
    windup: 900,
    recovery: 400,
    cooldown: 5000,
    action: { type: 'barrage', pattern: 'ring', count: 12, spin: 15, speed: 120, radius: 6, range: 520, power: 6, buildup: 15 },
    rules: [{ label: '沈黙', on: 'hit', when: [], do: [{ type: 'applyBuildup', status: 'silence', amount: 22 }] }],
  },
  /** 灰翼の飛竜の噛みつき。大きな顎で前を噛み裂く */
  wyvernBite: {
    name: '飛竜の顎',
    category: 'melee',
    element: 'slash',
    tags: ['attack', 'enemy', 'boss'],
    windup: 650,
    recovery: 550,
    cooldown: 2000,
    aloft: false,
    action: { type: 'melee', range: 125, arc: 80, power: 48, buildup: 40 },
  },
  /** 灰翼の飛竜の尾の薙ぎ。寄った者を周りごと払う */
  tailSweep: {
    name: '尾の薙ぎ払い',
    category: 'melee',
    element: 'blunt',
    tags: ['attack', 'enemy', 'boss'],
    windup: 900,
    recovery: 700,
    cooldown: 5200,
    aloft: false,
    action: { type: 'nova', radius: 175, power: 42, buildup: 35 },
  },
  /** 灰翼の飛竜の炎の息。長く溜めて、前へ太い炎を吐く。濡れていれば燃えない */
  flameBreath: {
    name: '灰炎の息',
    category: 'ranged',
    element: 'fire',
    tags: ['attack', 'enemy', 'boss'],
    windup: 1500,
    recovery: 900,
    cooldown: 7500,
    opening: 6000,
    aloft: false,
    action: { type: 'melee', range: 400, arc: 46, power: 22, buildup: 45, hits: 3 },
  },
  /** 灰翼の飛竜の飛翔。空へ上がり、近攻撃の届かない所から火を降らせる */
  wyvernTakeOff: {
    name: '飛翔',
    category: 'melee',
    tags: ['enemy', 'boss'],
    windup: 1000,
    recovery: 300,
    cooldown: 42000,
    opening: 24000,
    aloft: false,
    action: { type: 'takeOff', duration: 11000, land: 'wyvernDive' },
  },
  /** 飛んでいる間の火の雨。回る輪で全方位に火を撒く */
  fireRain: {
    name: '火の雨',
    category: 'ranged',
    element: 'fire',
    tags: ['attack', 'enemy', 'boss', 'projectile'],
    windup: 650,
    recovery: 250,
    cooldown: 2300,
    aloft: true,
    action: { type: 'barrage', pattern: 'ring', count: 16, spin: 11, speed: 150, radius: 8, range: 700, power: 13, buildup: 28 },
  },
  /** 飛んでいる間の火の礫。狙った相手へ扇に撃つ */
  emberVolley: {
    name: '火の礫',
    category: 'ranged',
    element: 'fire',
    tags: ['attack', 'enemy', 'boss', 'projectile'],
    windup: 550,
    recovery: 250,
    cooldown: 1700,
    aloft: true,
    action: { type: 'barrage', pattern: 'fan', count: 5, spread: 48, speed: 240, radius: 7, range: 700, power: 11, buildup: 25 },
  },
  /** 飛竜の急降下。飛ぶ時間が切れると、狙った所へ落ちて降りた周りを砕く。地に降りる */
  wyvernDive: {
    name: '急降下',
    category: 'melee',
    element: 'blunt',
    tags: ['attack', 'enemy', 'boss'],
    windup: 1300,
    recovery: 1200,
    cooldown: 0,
    aloft: true,
    action: { type: 'blink', where: 'at', distance: 0, range: 900, land: { radius: 150, power: 70, buildup: 60 } },
  },
} as const satisfies Record<string, ActiveSkillDef>;

export type ActiveSkillId = keyof typeof ACTIVE_SKILLS;
export const ACTIVE_SKILL_IDS = Object.keys(ACTIVE_SKILLS) as ActiveSkillId[];

export function activeSkillDef(id: ActiveSkillId): ActiveSkillDef {
  return ACTIVE_SKILLS[id];
}

/** 切り札として選べるスキル */
export const TRUMP_SKILL_IDS = ACTIVE_SKILL_IDS.filter((id) => (ACTIVE_SKILLS[id].tags as readonly string[]).includes('trump'));

/** 技なら、その武器で使えるか */
export function techniqueFits(def: TechniqueDef, weapon: WeaponRef): boolean {
  const w = weaponDef(weapon);
  const r = def.technique.requires;
  return (!r.kind || r.kind === w.kind) && (!r.element || r.element === w.element) && (!r.tag || w.tags.includes(r.tag));
}

/** 技の条件に出す、武器のタグの呼び名 */
const WEAPON_TAG_NAMES: Record<string, string> = { staff: '杖', spear: '槍', sword: '剣', dagger: '短剣', hammer: '槌', bow: '弓', gun: '銃', heavy: '重い' };

/** 技の条件を言葉にする(画面に出す) */
export function techniqueRequirement(def: TechniqueDef, elementName: (e: ElementId) => string): string {
  const r = def.technique.requires;
  const parts = [r.element ? `${elementName(r.element)}の` : '', r.kind === 'melee' ? '近接の' : r.kind === 'ranged' ? '遠距離の' : ''];
  return `${parts.join('')}${r.tag ? (WEAPON_TAG_NAMES[r.tag] ?? r.tag) : '武器'}`;
}

/**
 * 実際に出すときの中身。技は武器の数値から作り、それ以外は定義のまま。
 * どの武器で出したかも持つ
 */
export interface ResolvedSkill {
  id: ActiveSkillId;
  name: string;
  category: SkillCategory;
  element?: ElementId;
  tags: readonly string[];
  windup: number;
  recovery: number;
  cooldown: number;
  action: SkillAction;
  weapon?: WeaponTypeId;
  /** 出した武器の属性と性質まで含めたもの */
  weaponSpec?: WeaponSpec;
  /** 能力値が足りない点数(武器と技の合計)。0 なら足りている */
  missing: number;
  /** この技で当てたときだけ効くルール(技と変化から) */
  rules?: readonly Rule[];
  /** 条件を満たしているとき、間隔に掛ける倍率(変化から) */
  intervalWhen?: readonly { when: readonly Predicate[]; mult: number }[];
  /** 何回目に使ったか。使うたびに付く */
  useIndex?: number;
  /** 使ったときの1つ前の手と、その間(ミリ秒)。繋ぎの条件文で見る */
  prev?: { element?: ElementId; category: string; gap: number };
}

/**
 * 実際に出す中身を作る。attrs を渡すと、武器と技の必要な能力値に足りない分だけ
 * 威力が落ち、間隔が延びる。渡さなければ(敵やテスト)落ちない
 */
export function resolveSkill(id: ActiveSkillId, weapon?: WeaponRef, attrs?: Attributes, variant?: SkillVariant): ResolvedSkill | undefined {
  const raw = resolveRaw(id, weapon, variant && variant.base === id ? variant : undefined);
  if (!raw || !attrs) return raw;
  const def = activeSkillDef(id);
  const missing = missingPoints(def.needs, attrs) + (raw.weaponSpec ? missingPoints(weaponDef(raw.weaponSpec).needs, attrs) : 0);
  if (missing === 0) return raw;
  const penalty = shortfallPenalty(missing);
  const a = raw.action;
  const action: SkillAction =
    'power' in a ? { ...a, power: a.power * penalty.power } : a.type === 'imbue' ? { ...a, ratio: a.ratio * penalty.power } : a;
  return { ...raw, action, cooldown: raw.cooldown * penalty.interval, missing };
}

function resolveRaw(id: ActiveSkillId, weapon?: WeaponRef, variant?: SkillVariant): ResolvedSkill | undefined {
  const def = activeSkillDef(id);
  if (!isTechnique(def)) {
    return {
      id,
      name: def.name,
      category: def.category,
      element: def.element,
      tags: def.tags,
      windup: def.windup,
      recovery: def.recovery,
      cooldown: def.cooldown,
      action: def.action,
      rules: def.rules,
      missing: 0,
    };
  }
  if (!weapon || !techniqueFits(def, weapon)) return undefined;
  const w = weaponDef(weapon);
  // 変化があれば、技の倍率に重ねる
  const t = variant ? applyVariations(def.technique, variant.variations) : def.technique;
  const power = w.power * t.power;
  const buildup = w.buildup * (t.buildup ?? 1);
  const range = w.range * (t.range ?? 1);
  let action: SkillAction;
  if (t.shape === 'swing' && w.kind === 'melee') {
    action = { type: 'melee', range, arc: Math.min(360, (t.arc ?? w.arc) * (t.arcScale ?? 1)), power, buildup, clearsProjectiles: true, hits: t.hits };
  } else if (t.shape === 'shot' && w.kind === 'ranged') {
    // 技と武器の両方が弾けるなら、広い方で弾ける
    const explode = [t.explode, w.explode].filter((e) => !!e).sort((a, b) => b!.radius - a!.radius)[0];
    action = { type: 'projectile', speed: w.speed, range, radius: w.radius, power, buildup, count: t.count, spread: t.spread, pierce: t.pierce, explode };
  } else {
    action = { type: 'nova', radius: (t.radius ?? 150) * (t.range ?? 1), power, buildup, hits: t.hits };
  }
  const variations = variant ? variant.variations.map((v) => VARIATIONS[v]) : [];
  const rules = [...(w.rules ?? []), ...(t.rules ?? []), ...variations.flatMap((v) => (v as VariationDef).rules ?? [])];
  const intervalWhen = variations.flatMap((v) => ((v as VariationDef).intervalWhen ? [(v as VariationDef).intervalWhen!] : []));
  return {
    id,
    // 内訳で武器の違いが見えるよう、「鉄の剣の雨垂れの薙ぎ払い」のように呼ぶ
    name: `${w.name}の${variant ? variantName(variant, def.name) : def.name}`,
    rules: rules.length > 0 ? rules : undefined,
    intervalWhen: intervalWhen.length > 0 ? intervalWhen : undefined,
    category: w.kind === 'melee' ? 'melee' : 'ranged',
    element: w.element,
    tags: [...def.tags, ...w.tags, w.id, ...(w.kind === 'ranged' ? ['projectile'] : [])],
    windup: w.windup * (t.windup ?? 1),
    recovery: w.recovery * (t.windup ?? 1),
    cooldown: w.interval * t.interval,
    action,
    weapon: w.id,
    weaponSpec: toWeaponSpec(weapon),
    missing: 0,
  };
}

/** 攻撃と付与のスキルの属性 */
export function skillElement(skill: { name: string; element?: ElementId }): ElementId {
  if (!skill.element) throw new Error(`${skill.name} には属性がない`);
  return skill.element;
}

/** 相手に届く距離。届かせる必要のないスキルは undefined */
export function actionReach(a: SkillAction): number | undefined {
  if (a.type === 'melee') return a.range;
  if (a.type === 'projectile') return a.range * 0.9;
  if (a.type === 'barrage') return a.range * 0.7;
  if (a.type === 'floor') return 600;
  if (a.type === 'nova') return a.radius * 0.85;
  if (a.type === 'blink') return a.range;
  return undefined;
}
