import type { ElementId } from './elements';
import type { FieldId } from './fields';
import { weaponDef, type WeaponKind, type WeaponTypeId } from './weapons';
import { missingPoints, shortfallPenalty, type AttributeNeeds, type Attributes } from './attributes';

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
  /** 狙った方向の扇形 arc 度、range ピクセルに当たる。clearsProjectiles なら範囲内の敵の弾をかき消す */
  | { type: 'melee'; range: number; arc: number; power: number; buildup: number; clearsProjectiles?: boolean }
  /** 自分の周り radius の相手全てに当たる */
  | { type: 'nova'; radius: number; power: number; buildup: number }
  /** 狙った相手の足元に、一定時間だけ床の状態を敷く */
  | { type: 'floor'; field: FieldId; radius: number; duration: number }
  /** count 発を spread 度ずつずらして撃つ */
  | { type: 'projectile'; speed: number; range: number; radius: number; power: number; buildup: number; count?: number; spread?: number }
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
}

/**
 * 技。着けている武器の数値に倍率を掛けて使う。requires を満たす武器がなければ使えない。
 * swing は近接の武器を振る、shot は遠距離の武器で撃つ、nova は自分の周りに放つ
 */
export interface Technique {
  requires: { kind?: WeaponKind; element?: ElementId };
  shape: 'swing' | 'shot' | 'nova';
  /** 武器の威力・間隔・振りかぶりと硬直・射程・蓄積に掛ける倍率 */
  power: number;
  interval: number;
  windup?: number;
  range?: number;
  buildup?: number;
  /** swing の扇の角度(度)。なければ武器の角度 */
  arc?: number;
  /** shot の弾の数とずらす角度 */
  count?: number;
  spread?: number;
  /** nova の半径 */
  radius?: number;
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
} as const satisfies Record<string, ActiveSkillDef>;

export type ActiveSkillId = keyof typeof ACTIVE_SKILLS;
export const ACTIVE_SKILL_IDS = Object.keys(ACTIVE_SKILLS) as ActiveSkillId[];

export function activeSkillDef(id: ActiveSkillId): ActiveSkillDef {
  return ACTIVE_SKILLS[id];
}

/** 切り札として選べるスキル */
export const TRUMP_SKILL_IDS = ACTIVE_SKILL_IDS.filter((id) => (ACTIVE_SKILLS[id].tags as readonly string[]).includes('trump'));

/** 技なら、その武器で使えるか */
export function techniqueFits(def: TechniqueDef, weapon: WeaponTypeId): boolean {
  const w = weaponDef(weapon);
  const r = def.technique.requires;
  return (!r.kind || r.kind === w.kind) && (!r.element || r.element === w.element);
}

/** 技の条件を言葉にする(画面に出す) */
export function techniqueRequirement(def: TechniqueDef, elementName: (e: ElementId) => string): string {
  const r = def.technique.requires;
  const parts = [r.element ? `${elementName(r.element)}の` : '', r.kind === 'melee' ? '近接の' : r.kind === 'ranged' ? '遠距離の' : ''];
  return `${parts.join('')}武器`;
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
  /** 能力値が足りない点数(武器と技の合計)。0 なら足りている */
  missing: number;
}

/**
 * 実際に出す中身を作る。attrs を渡すと、武器と技の必要な能力値に足りない分だけ
 * 威力が落ち、間隔が延びる。渡さなければ(敵やテスト)落ちない
 */
export function resolveSkill(id: ActiveSkillId, weapon?: WeaponTypeId, attrs?: Attributes): ResolvedSkill | undefined {
  const raw = resolveRaw(id, weapon);
  if (!raw || !attrs) return raw;
  const def = activeSkillDef(id);
  const missing = missingPoints(def.needs, attrs) + (raw.weapon ? missingPoints(weaponDef(raw.weapon).needs, attrs) : 0);
  if (missing === 0) return raw;
  const penalty = shortfallPenalty(missing);
  const a = raw.action;
  const action: SkillAction =
    'power' in a ? { ...a, power: a.power * penalty.power } : a.type === 'imbue' ? { ...a, ratio: a.ratio * penalty.power } : a;
  return { ...raw, action, cooldown: raw.cooldown * penalty.interval, missing };
}

function resolveRaw(id: ActiveSkillId, weapon?: WeaponTypeId): ResolvedSkill | undefined {
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
      missing: 0,
    };
  }
  if (!weapon || !techniqueFits(def, weapon)) return undefined;
  const w = weaponDef(weapon);
  const t = def.technique;
  const power = w.power * t.power;
  const buildup = w.buildup * (t.buildup ?? 1);
  const range = w.range * (t.range ?? 1);
  let action: SkillAction;
  if (t.shape === 'swing' && w.kind === 'melee') {
    action = { type: 'melee', range, arc: t.arc ?? w.arc, power, buildup, clearsProjectiles: true };
  } else if (t.shape === 'shot' && w.kind === 'ranged') {
    action = { type: 'projectile', speed: w.speed, range, radius: w.radius, power, buildup, count: t.count, spread: t.spread };
  } else {
    action = { type: 'nova', radius: t.radius ?? 150, power, buildup };
  }
  return {
    id,
    // 内訳で武器の違いが見えるよう、「鉄の剣の薙ぎ払い」のように呼ぶ
    name: `${w.name}の${def.name}`,
    category: w.kind === 'melee' ? 'melee' : 'ranged',
    element: w.element,
    tags: [...def.tags, ...w.tags, weapon, ...(w.kind === 'ranged' ? ['projectile'] : [])],
    windup: w.windup * (t.windup ?? 1),
    recovery: w.recovery * (t.windup ?? 1),
    cooldown: w.interval * t.interval,
    action,
    weapon,
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
  return undefined;
}
