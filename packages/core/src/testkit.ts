// テストで使う、技と武器の組み合わせ
import { resolveSkill, type ResolvedSkill } from './data/skills';
import type { WeaponTypeId } from './data/weapons';

/** 錆びた大剣で斬りつけ、雷管銃で射撃。テストの基準にする */
export const SWORD = resolveSkill('slash', 'rustGreatsword')!;
export const GUN = resolveSkill('shoot', 'capGun')!;
/** テストの自キャラが持つ武器。斬りつけは大剣、射撃は銃で出る */
export const TEST_WEAPONS: WeaponTypeId[] = ['rustGreatsword', 'capGun'];

export function pw(skill: ResolvedSkill): number {
  return 'power' in skill.action ? skill.action.power : 0;
}

export function bu(skill: ResolvedSkill): number {
  return 'buildup' in skill.action ? skill.action.buildup : 0;
}
