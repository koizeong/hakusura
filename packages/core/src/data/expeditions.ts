import type { EquipKind } from './equipment';

/**
 * 遠征の行き先。長く危ない所ほど、多く持ち帰る。
 * threat はその地の手強さで、ビルドの強さ(早回しで測るDPS)と比べて持ち帰る量が変わる
 */
export interface ExpeditionDef {
  name: string;
  description: string;
  /** かかる時間(ミリ秒) */
  duration: number;
  /** 手強さ。ビルドの強さがこれと同じなら、持ち帰る量は1倍 */
  threat: number;
  exp: number;
  /** 持ち帰る装備の数 */
  items: number;
  /** 出やすい装備の種類 */
  itemKinds?: readonly EquipKind[];
  /** 条件文つきの装備が出る確率 */
  conditionChance: number;
  /** まだ覚えていないスキルを1つ見つける確率 */
  skillChance: number;
}

const MIN = 60 * 1000;

export const EXPEDITIONS = {
  outskirts: {
    name: '野営地の見回り',
    description: '近場を一回りする。すぐ戻るが、得る物も少ない',
    duration: 2 * MIN,
    threat: 60,
    exp: 40,
    items: 1,
    conditionChance: 0.1,
    skillChance: 0.1,
  },
  ashRoad: {
    name: '灰の街道',
    description: '崩れた街道を辿る。拾い物が多い',
    duration: 30 * MIN,
    threat: 120,
    exp: 400,
    items: 4,
    conditionChance: 0.25,
    skillChance: 0.3,
  },
  rustMine: {
    name: '錆の廃坑',
    description: '錆びた武具が眠る。武器が出やすい',
    duration: 2 * 60 * MIN,
    threat: 220,
    exp: 1600,
    items: 6,
    itemKinds: ['weapon', 'weapon', 'armor'],
    conditionChance: 0.3,
    skillChance: 0.5,
  },
  drownedChapel: {
    name: '沈んだ聖堂',
    description: '水に沈んだ聖堂の奥。条件文つきの装備と、古い技が見つかる',
    duration: 8 * 60 * MIN,
    threat: 400,
    exp: 7000,
    items: 10,
    itemKinds: ['accessory', 'armor', 'weapon'],
    conditionChance: 0.6,
    skillChance: 0.9,
  },
} as const satisfies Record<string, ExpeditionDef>;

export type ExpeditionId = keyof typeof EXPEDITIONS;
export const EXPEDITION_IDS = Object.keys(EXPEDITIONS) as ExpeditionId[];

export function expeditionDef(id: ExpeditionId): ExpeditionDef {
  return EXPEDITIONS[id];
}

/** 持ち帰る量に掛ける倍率の幅。弱すぎても少しは持ち帰り、強すぎても取り過ぎない */
export const EXPEDITION_YIELD = { min: 0.3, max: 1.5 } as const;
