import type { ElementId } from './elements';
import type { FieldId } from './fields';

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
  | { type: 'projectile'; speed: number; range: number; radius: number; power: number; buildup: number }
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

export interface ActiveSkillDef {
  name: string;
  category: SkillCategory;
  /** 攻撃と付与のスキルは必ず持つ */
  element?: ElementId;
  /** 画面に出す説明。切り札は選ぶときに見せる */
  description?: string;
  tags: readonly string[];
  /** 使ってから効果が出るまでの振りかぶり(ミリ秒)。この間に昏倒すると潰れる */
  windup: number;
  /** 効果が出た後の硬直(ミリ秒)。回避でだけ抜けられる */
  recovery: number;
  /** 使ってから再び使えるまで(ミリ秒) */
  cooldown: number;
  action: SkillAction;
}

/** アクティブスキル */
export const ACTIVE_SKILLS = {
  rustGreatsword: {
    name: '錆びた大剣',
    category: 'melee',
    element: 'slash',
    tags: ['attack'],
    windup: 280,
    recovery: 420,
    cooldown: 1100,
    action: { type: 'melee', range: 110, arc: 150, power: 52, buildup: 55, clearsProjectiles: true },
  },
  thunderGun: {
    name: '雷管銃',
    category: 'ranged',
    element: 'lightning',
    tags: ['attack', 'projectile'],
    windup: 320,
    recovery: 380,
    cooldown: 2400,
    action: { type: 'projectile', speed: 900, range: 750, radius: 7, power: 26, buildup: 60 },
  },
  emberOil: {
    name: '燠火の塗油',
    category: 'imbue',
    element: 'fire',
    tags: ['buff'],
    windup: 500,
    recovery: 300,
    cooldown: 20000,
    action: { type: 'imbue', ratio: 0.5, buildup: 40, duration: 15000 },
  },
  /** 切り札。tags に trump を持つスキルから1つ選んでビルドに入れる */
  rainBell: {
    name: '雨乞いの鈴',
    category: 'imbue',
    description: '12秒、雨を呼ぶ。全員が濡れる',
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

/** 攻撃と付与のスキルの属性 */
/** 切り札として選べるスキル */
export const TRUMP_SKILL_IDS = ACTIVE_SKILL_IDS.filter((id) => (ACTIVE_SKILLS[id].tags as readonly string[]).includes('trump'));

export function skillElement(def: ActiveSkillDef): ElementId {
  if (!def.element) throw new Error(`${def.name} には属性がない`);
  return def.element;
}

/** 相手に届く距離。届かせる必要のないスキルは undefined */
export function skillReach(def: ActiveSkillDef): number | undefined {
  const a = def.action;
  if (a.type === 'melee') return a.range;
  if (a.type === 'projectile') return a.range * 0.9;
  if (a.type === 'barrage') return a.range * 0.7;
  if (a.type === 'floor') return 600;
  if (a.type === 'nova') return a.radius * 0.85;
  return undefined;
}
