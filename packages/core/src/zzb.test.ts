import { it } from 'vitest';
import { measureDps } from './balance.test';
import { LOOT_WEAPON_TYPE_IDS, WEAPON_TYPES } from './data/weapons';
import { ELEMENT_IDS } from './data/elements';
declare const console: { log(...a: unknown[]): void };
it('b', () => {
  for (const targets of ['solo', 'group'] as const) {
    const rows: [string, number][] = [];
    for (const id of LOOT_WEAPON_TYPE_IDS) for (const e of ELEMENT_IDS) rows.push([`${id}/${e}`, measureDps({ type: id, element: e }, WEAPON_TYPES[id].kind === 'melee' ? 'slash' : 'shoot', targets, 30)]);
    const melee = rows.filter(([k]) => WEAPON_TYPES[k.split('/')[0] as keyof typeof WEAPON_TYPES].kind === 'melee').sort((a, b) => a[1] - b[1]);
    const ranged = rows.filter(([k]) => WEAPON_TYPES[k.split('/')[0] as keyof typeof WEAPON_TYPES].kind === 'ranged').sort((a, b) => b[1] - a[1]);
    console.log(targets, 'minMelee', melee.slice(0, 3).map(([k, v]) => `${k}:${Math.round(v)}`).join(' '), 'maxRanged', ranged.slice(0, 5).map(([k, v]) => `${k}:${Math.round(v)}`).join(' '));
  }
}, 300000);
