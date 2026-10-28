import type { ElementId } from './elements';
import type { SkillCategory } from './skills';
import type { StatusId } from './statuses';

/**
 * 型。決まった順にスキルを出すと決まり、最後の一手が強くなる。
 * 作戦の連携(1行に「次に〇〇」を足す)で狙って組む。遠征で型の書を拾うと覚える
 */
export interface FormStep {
  /** そのスキル */
  skill?: string;
  /** その属性で出すスキル(武器の属性も含む) */
  element?: ElementId;
  category?: SkillCategory;
  /** その状態を溜めるスキル(属性・変化・付与・天候・床から) */
  applies?: StatusId;
}

export interface FormDef {
  name: string;
  description: string;
  steps: readonly FormStep[];
  /** 前の一手からこの間(ミリ秒)に次を出せば続く */
  window: number;
  /** 最後の一手の与ダメージに足す */
  bonus: number;
  /** 手順がそれぞれ別のスキルでないと決まらない */
  distinct?: boolean;
  /** 決まったときに溜まる昂り */
  fervor: number;
  color: number;
}

export const FORMS = {
  threefoldPrayer: {
    name: '三度の祈りの型',
    description: '儀式を三つ重ねてから攻める',
    steps: [{ category: 'rite' }, { category: 'rite' }, { category: 'rite' }, { category: 'melee' }],
    window: 3500,
    bonus: 0.8,
    distinct: false,
    fervor: 35,
    color: 0xe8d8a8,
  },
  thunderRain: {
    name: '雷雨の型',
    description: '濡らしてから雷で打つ',
    steps: [{ applies: 'wet' }, { element: 'lightning' }],
    window: 4000,
    bonus: 0.6,
    fervor: 25,
    color: 0x7fd4ff,
  },
  oilFire: {
    name: '油火の型',
    description: '油を塗ってから火で打つ',
    steps: [{ applies: 'oiled' }, { element: 'fire' }],
    window: 4000,
    bonus: 0.6,
    fervor: 25,
    color: 0xff9a3e,
  },
  shootAndCut: {
    name: '撃ち込みの型',
    description: '撃ってから斬り込む',
    steps: [{ category: 'ranged' }, { category: 'melee' }],
    window: 2500,
    bonus: 0.35,
    fervor: 15,
    color: 0xe6dccb,
  },
  frostBreak: {
    name: '凍て砕きの型',
    description: '凍らせてから打で砕く',
    steps: [{ element: 'ice' }, { element: 'blunt' }],
    window: 3500,
    bonus: 0.5,
    fervor: 25,
    color: 0xa8e0f0,
  },
  bloodEdge: {
    name: '血刃の型',
    description: '斬って血を流させ、血で啜る',
    steps: [{ element: 'slash' }, { element: 'blood' }],
    window: 3000,
    bonus: 0.4,
    fervor: 20,
    color: 0xc8323c,
  },
  shadowStab: {
    name: '闇討ちの型',
    description: '闇で目を奪い、刺で穿つ',
    steps: [{ element: 'dark' }, { element: 'pierce' }],
    window: 3000,
    bonus: 0.5,
    fervor: 20,
    color: 0x8a7aaa,
  },
  ashPyre: {
    name: '灰燼の型',
    description: '火で焼き、灰で崩す',
    steps: [{ element: 'fire' }, { element: 'ash' }],
    window: 3500,
    bonus: 0.5,
    fervor: 20,
    color: 0x9a9088,
  },
  emberDance: {
    name: '燠火纏いの型',
    description: '付与を纏ってから、近攻撃を2つ続ける',
    steps: [{ category: 'imbue' }, { category: 'melee' }, { category: 'melee' }],
    window: 3000,
    bonus: 0.45,
    fervor: 30,
    color: 0xff7a2e,
  },
  threeCuts: {
    name: '三段の型',
    description: '違う近攻撃を3つ続ける',
    steps: [{ category: 'melee' }, { category: 'melee' }, { category: 'melee' }],
    window: 2500,
    bonus: 0.4,
    distinct: true,
    fervor: 30,
    color: 0xd8c25a,
  },
  rotCurse: {
    name: '腐れ呪いの型',
    description: '腐らせてから呪う',
    steps: [{ element: 'rot' }, { element: 'curse' }],
    window: 3500,
    bonus: 0.5,
    fervor: 20,
    color: 0x9a5ab8,
  },
} as const satisfies Record<string, FormDef>;

export type FormId = keyof typeof FORMS;
export const FORM_IDS = Object.keys(FORMS) as FormId[];

/** 最初から知っている型 */
export const STARTING_FORMS: readonly FormId[] = ['thunderRain', 'oilFire', 'shootAndCut'];

export function formDef(id: FormId): FormDef {
  return FORMS[id];
}

/** 手順を言葉にする(画面に出す) */
export function stepText(step: FormStep, names: { skill(id: string): string; element(id: ElementId): string; category(id: SkillCategory): string; status(id: StatusId): string }): string {
  if (step.skill) return names.skill(step.skill);
  if (step.element) return `${names.element(step.element)}の技`;
  if (step.applies) return `${names.status(step.applies)}を溜める技`;
  if (step.category) return names.category(step.category);
  return '何か';
}

/** 昂り。コンボと型で溜まり、満ちると切り札が早く戻り、続く数撃が強くなる */
export const FERVOR = {
  max: 100,
  /** コンボのヒット1回で溜まる量。同じコンボが続くほど減る */
  perCombo: 6,
  /** 直近 recent 回のコンボのうち同じものが1つあるごとに、溜まる量が 1/(1+repeatPenalty×数) になる */
  recent: 12,
  repeatPenalty: 0.6,
  /** 満ちたとき:切り札のクールダウンが縮む(ミリ秒)、続く charges 撃の与ダメージ+add */
  trumpCut: 10000,
  buff: { label: '昂り', add: 0.5, charges: 3, duration: 8000 },
} as const;
