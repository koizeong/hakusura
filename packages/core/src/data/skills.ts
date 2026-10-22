import type { ElementId } from './elements';

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
  /** 狙った方向の扇形 arc 度、range ピクセルに当たる */
  | { type: 'melee'; range: number; arc: number; power: number; buildup: number }
  | { type: 'projectile'; speed: number; range: number; radius: number; power: number; buildup: number }
  /** 一定時間、武器の攻撃に属性の追撃を乗せる */
  | { type: 'imbue'; ratio: number; buildup: number; duration: number };

export interface ActiveSkillDef {
  name: string;
  category: SkillCategory;
  element: ElementId;
  tags: readonly string[];
  /** ミリ秒 */
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
    cooldown: 450,
    action: { type: 'melee', range: 100, arc: 130, power: 18, buildup: 35 },
  },
  thunderGun: {
    name: '雷管銃',
    category: 'ranged',
    element: 'lightning',
    tags: ['attack', 'projectile'],
    cooldown: 350,
    action: { type: 'projectile', speed: 780, range: 700, radius: 6, power: 12, buildup: 40 },
  },
  emberOil: {
    name: '燠火の塗油',
    category: 'imbue',
    element: 'fire',
    tags: ['buff'],
    cooldown: 6000,
    action: { type: 'imbue', ratio: 0.5, buildup: 30, duration: 8000 },
  },
} as const satisfies Record<string, ActiveSkillDef>;

export type ActiveSkillId = keyof typeof ACTIVE_SKILLS;
export const ACTIVE_SKILL_IDS = Object.keys(ACTIVE_SKILLS) as ActiveSkillId[];

export function activeSkillDef(id: ActiveSkillId): ActiveSkillDef {
  return ACTIVE_SKILLS[id];
}
