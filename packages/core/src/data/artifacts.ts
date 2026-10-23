import type { Modifier, Rule } from '../rules';
import type { FieldId } from './fields';

/**
 * アーティファクト。効果が固定された装備。docs/artifacts.md の番号を持つ。
 * 補正値・ルールで書けないものは traits で書く
 */
export interface ArtifactDef {
  no: number;
  name: string;
  text: string;
  modifiers?: readonly Modifier[];
  rules?: readonly Rule[];
  traits?: ArtifactTraits;
}

export interface ArtifactTraits {
  /** このラベルのルール(相互作用など)を、自分には効かせない */
  ignoreRules?: readonly string[];
  /** 正面からの直撃を全て防ぐ */
  frontGuard?: boolean;
  /** 歩いた跡に床の状態を残す */
  trail?: { field: FieldId; every: number; radius: number; duration: number };
  /** 近攻撃が、この距離より近い相手に当たらない */
  meleeMinRange?: number;
}

export const ARTIFACTS = {
  twinGuns: {
    no: 2,
    name: '双子の銃',
    text: '遠攻撃が必ず2発になるが、1発ごとの威力は60%',
    modifiers: [
      { stat: 'projectiles', tags: [], value: 1 },
      { tags: ['projectile'], value: -0.4, group: 'artifact:twinGuns' },
    ],
  },
  halfLife: {
    no: 22,
    name: '半分の命',
    text: '最大HPが半分になり、その分だけ与ダメージが増える',
    modifiers: [
      { stat: 'maxHp', tags: [], value: -0.5, group: 'artifact:halfLife' },
      { tags: [], value: 0.5, group: 'artifact:halfLife' },
    ],
  },
  sootyTorch: {
    no: 52,
    name: '煤けた聖火',
    text: '火属性が、濡れている敵にも炎上を付与する',
    traits: { ignoreRules: ['濡れで消火'] },
  },
  oilMerchantBarrel: {
    no: 62,
    name: '油商人の樽',
    text: '歩いた跡に油溜まりが残る',
    traits: { trail: { field: 'oilPool', every: 70, radius: 45, duration: 6000 } },
  },
  mossyShield: {
    no: 112,
    name: '苔むした大盾',
    text: '正面からの攻撃を全て防ぐが、移動速度-50%',
    modifiers: [{ stat: 'moveSpeed', tags: [], value: -0.5, group: 'artifact:mossyShield' }],
    traits: { frontGuard: true },
  },
  thornArmor: {
    no: 114,
    name: '棘の鎧',
    text: '被弾するたびに、受けたダメージの半分を相手に返す',
    rules: [{ label: '棘の鎧', on: 'hurt', when: [], do: [{ type: 'reflect', ratio: 0.5 }] }],
  },
  rustyPole: {
    no: 101,
    name: '錆鉄の長柄',
    text: '近攻撃の射程が2倍になるが、密着した敵には当たらない',
    modifiers: [{ stat: 'meleeRange', tags: [], value: 1, group: 'artifact:rustyPole' }],
    traits: { meleeMinRange: 60 },
  },
} as const satisfies Record<string, ArtifactDef>;

export type ArtifactId = keyof typeof ARTIFACTS;
export const ARTIFACT_IDS = Object.keys(ARTIFACTS) as ArtifactId[];

export function artifactDef(id: ArtifactId): ArtifactDef {
  return ARTIFACTS[id];
}
