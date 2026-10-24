import type { Modifier } from '../rules';

/**
 * 武器の持ち方。武器を1つ着けると両手持ち、2つで二刀流、なしで素手。盾を持てば片手と盾。
 * 持ち方はタグとして本人に付き、条件文から「両手持ちのとき」のように参照できる
 */
export interface GripDef {
  name: string;
  modifiers: readonly Modifier[];
}

export const GRIPS = {
  twoHanded: { name: '両手持ち', modifiers: [{ tags: ['melee'], value: 0.25, group: 'grip' }] },
  dualWield: { name: '二刀流', modifiers: [{ stat: 'cooldown', tags: [], value: -0.15, group: 'grip' }] },
  unarmed: { name: '素手', modifiers: [] },
  /** 片手に武器、片手に盾。盾を2枚なら盾構え */
  swordAndShield: { name: '片手と盾', modifiers: [] },
  shieldOnly: { name: '盾構え', modifiers: [] },
} as const satisfies Record<string, GripDef>;

export type GripId = keyof typeof GRIPS;

/** 着けている武器と盾の数から持ち方を決める */
export function gripOf(weapons: number, shields = 0): GripId {
  if (weapons >= 2) return 'dualWield';
  if (weapons === 1) return shields > 0 ? 'swordAndShield' : 'twoHanded';
  return shields > 0 ? 'shieldOnly' : 'unarmed';
}
