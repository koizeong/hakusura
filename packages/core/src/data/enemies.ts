import type { ElementId } from './elements';
import type { FieldId } from './fields';
import type { ActiveSkillId } from './skills';

/**
 * 動き方。
 * chase は相手に寄って殴る。swarm は寄りながら相手を囲むように散る。
 * skirmish は keepAt の間合いを保ち、近寄られると下がる。support は仲間の陰から keepAt を保つ
 */
export type EnemyBehavior = 'chase' | 'swarm' | 'skirmish' | 'support';

export interface EnemyDef {
  name: string;
  /** この敵がビルドに問うこと */
  concept: string;
  description: string;
  maxHp: number;
  radius: number;
  /** 1秒に歩く距離 */
  speed: number;
  resist?: Partial<Record<ElementId, number>>;
  /** 並んだ順に、使えて届くものを使う */
  skills: readonly ActiveSkillId[];
  behavior: EnemyBehavior;
  /** skirmish と support が保つ間合い */
  keepAt?: number;
  /** 倒れたときに起きること。破裂は敵味方の区別なく周りに当たる */
  onDeath?: {
    floor?: { field: FieldId; radius: number; duration: number };
    burst?: { element: ElementId; power: number; buildup: number; radius: number };
  };
  /** 見た目。図形と色と大きさ */
  look: { shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'bell'; color: number };
}

export const ENEMIES = {
  ghoul: {
    name: '屍喰い',
    concept: '群れ:数で囲む。範囲の技と、囲まれない足運びが要る',
    description: '脆く速い。群れで寄ってきて噛み、出血を刻む',
    maxHp: 90,
    radius: 11,
    speed: 150,
    skills: ['ghoulBite'],
    behavior: 'swarm',
    look: { shape: 'triangle', color: 0x8a8f6a },
  },
  sootSpitter: {
    name: '煤吹き',
    concept: '射手:間合いを取って火を吐く。追い詰めるか、撃ち返すか',
    description: '距離を取って煤の火を吐く。寄られると下がる。濡れていれば燃えない',
    maxHp: 240,
    radius: 14,
    speed: 110,
    resist: { fire: 0.5 },
    skills: ['sootSpit'],
    behavior: 'skirmish',
    keepAt: 320,
    look: { shape: 'diamond', color: 0xc0603a },
  },
  rustKnight: {
    name: '錆鎧',
    concept: '鎧:斬と火が通りにくく、雷が通る。属性の選びと、大振りを避けてから叩く間が要る',
    description: '遅く硬い。長い予兆のあと重く叩きつける',
    maxHp: 1500,
    radius: 24,
    speed: 60,
    resist: { slash: 0.6, fire: 0.4, lightning: -0.4 },
    skills: ['rustSlam'],
    behavior: 'chase',
    look: { shape: 'square', color: 0x7a5a44 },
  },
  oilBloat: {
    name: '油袋',
    concept: '床:油を撒き、倒れると弾けて周りを焼く。燃やせば敵ごと巻き込める',
    description: '足元に油を吐く。倒れると火を噴いて弾け、油溜まりを残す',
    maxHp: 420,
    radius: 20,
    speed: 70,
    skills: ['bloatShove', 'oilSpew'],
    behavior: 'chase',
    onDeath: {
      floor: { field: 'oilPool', radius: 110, duration: 12000 },
      burst: { element: 'fire', power: 45, buildup: 80, radius: 120 },
    },
    look: { shape: 'circle', color: 0x5a4a2a },
  },
  bellKeeper: {
    name: '鐘守',
    concept: '場を変える:雨を呼ぶ。雨は火を消し雷を倍にする。先に倒すか、雨を使うか',
    description: '仲間の陰で鐘を鳴らし、雨を呼ぶ。雷の輪を撒き、濡れた者を痺れさせる',
    maxHp: 520,
    radius: 16,
    speed: 90,
    resist: { lightning: 0.5 },
    skills: ['bellToll', 'bellRing'],
    behavior: 'support',
    keepAt: 380,
    look: { shape: 'bell', color: 0x8fa4b8 },
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;
export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];

export function enemyDef(id: EnemyId): EnemyDef {
  return ENEMIES[id];
}
