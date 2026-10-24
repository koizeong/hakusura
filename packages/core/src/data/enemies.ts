import type { ElementId } from './elements';
import type { FieldId } from './fields';
import type { ActiveSkillId } from './skills';
import type { Rule } from '../rules';

/**
 * 動き方。
 * chase は相手に寄って殴る。swarm は寄りながら相手を囲むように散る。
 * skirmish は keepAt の間合いを保ち、近寄られると下がる。support は仲間の陰から keepAt を保つ。stationary は動かない
 */
export type EnemyBehavior = 'chase' | 'swarm' | 'skirmish' | 'support' | 'stationary';

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
  /** 生まれつき持つルール(棘の亡者の棘など) */
  rules?: readonly Rule[];
  /** 見た目。図形と色と大きさ */
  look: { shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'bell' | 'hood' | 'spike' | 'star' | 'eye' | 'sac' | 'cross'; color: number };
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
    concept: '鎧:斬と火が通りにくく、雷と打が通る。属性の選びと、大振りを避けてから叩く間が要る',
    description: '遅く硬い。長い予兆のあと重く叩きつける',
    maxHp: 1500,
    radius: 24,
    speed: 60,
    resist: { slash: 0.6, pierce: 0.3, fire: 0.4, lightning: -0.4, blunt: -0.3 },
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
  corpseCaller: {
    name: '屍術師',
    concept: '死体:倒れた者を屍喰いとして起こす。死体を残さない灰で崩すか、先に術師を倒す',
    description: '間合いを取って墓の矢を撃ち、近くの死体を起こす',
    maxHp: 440,
    radius: 15,
    speed: 85,
    resist: { rot: 0.5, curse: 0.3 },
    skills: ['raiseDead', 'graveBolt'],
    behavior: 'support',
    keepAt: 360,
    look: { shape: 'hood', color: 0x5a6a4a },
  },
  thornHusk: {
    name: '棘の亡者',
    concept: '棘:近攻撃を受けると、その一部を返す。遠くから崩すか、返されても押し切る',
    description: '棘に覆われた亡者。殴った者に棘が刺さる',
    maxHp: 950,
    radius: 20,
    speed: 70,
    resist: { pierce: 0.5, slash: 0.2, fire: -0.3 },
    skills: ['huskClaw'],
    behavior: 'chase',
    rules: [{ label: '亡者の棘', on: 'hurt', when: [{ type: 'hitHasTag', tag: 'melee' }], do: [{ type: 'reflect', ratio: 0.35 }] }],
    look: { shape: 'spike', color: 0x6a5a3a },
  },
  frostWitch: {
    name: '霜の巫女',
    concept: '足場:足元を凍らせ、霜の輪で凍結を溜める。火で解かすか、凍った床の滑りを使う',
    description: '狙った者の足元を凍った床に変え、霜の輪を撒く。火に弱い',
    maxHp: 320,
    radius: 15,
    speed: 90,
    resist: { ice: 0.8, fire: -0.5 },
    skills: ['frostFloor', 'frostRing'],
    behavior: 'skirmish',
    keepAt: 340,
    look: { shape: 'star', color: 0xa8d0e8 },
  },
  shadowStalker: {
    name: '影潜み',
    concept: '背後:離れて様子を窺い、影を渡って背後から斬る。盾で受けるか、振り向いて迎える',
    description: '間合いを取り、ふいに背後へ移って闇の刃で目を奪う',
    maxHp: 330,
    radius: 13,
    speed: 140,
    resist: { dark: 0.8 },
    skills: ['shadowCut', 'shadowStep'],
    behavior: 'skirmish',
    keepAt: 280,
    look: { shape: 'eye', color: 0x4a3a6a },
  },
  plagueCarrier: {
    name: '疫病の運び手',
    concept: '癒し手:瘴気を呼び、周りの仲間を癒す。腐らせれば癒しは傷になる',
    description: '仲間の陰で膿の癒しを施し、瘴気を呼ぶ。瘴気は仲間も腐らせる',
    maxHp: 480,
    radius: 17,
    speed: 75,
    resist: { rot: 0.8 },
    skills: ['miasmaCall', 'plagueMend'],
    behavior: 'support',
    keepAt: 320,
    look: { shape: 'sac', color: 0x7a8a3a },
  },
  doomHerald: {
    name: '宣告者',
    concept: '時間切れ:遠くから死の宣告を溜める。満ちる前に倒すか、加護で防ぐ',
    description: '遠くから宣告の矢を放つ。当たり続けると、十秒の後に倒れる',
    maxHp: 380,
    radius: 15,
    speed: 80,
    resist: { curse: 0.8, dark: 0.3 },
    skills: ['doomBolt'],
    behavior: 'skirmish',
    keepAt: 420,
    look: { shape: 'cross', color: 0x8a5aaa },
  },
  bloodZealot: {
    name: '血の狂信者',
    concept: '吸血:跳びかかって血を啜る。出血していると癒されてしまう。出血を止めるか、一気に倒す',
    description: '跳びかかって血裂きを振るう。渇くほど強く、出血した者から血を吸う',
    maxHp: 560,
    radius: 16,
    speed: 115,
    resist: { blood: 0.6, slash: 0.2 },
    skills: ['bloodRend', 'zealotLeap'],
    behavior: 'chase',
    look: { shape: 'triangle', color: 0xa02a30 },
  },
  broodSac: {
    name: '巣袋',
    concept: '巣:動かずに屍喰いを産み続ける。真っ先に潰す的。火に弱い',
    description: '地に根を張った肉の袋。数秒ごとに屍喰いを産み落とす',
    maxHp: 1300,
    radius: 28,
    speed: 0,
    resist: { fire: -0.5, slash: 0.3 },
    skills: ['spawnBrood'],
    behavior: 'stationary',
    look: { shape: 'sac', color: 0x6a3a3a },
  },
  hushMonk: {
    name: '黙りの修道士',
    concept: '封じ:沈黙の輪で静寂を溜め、作戦を封じる。切り札の出番か、弾を避け切る',
    description: '仲間の陰から沈黙の輪を撒く。当たり続けるとスキルを使えなくなる',
    maxHp: 420,
    radius: 16,
    speed: 80,
    resist: { dark: 0.5, curse: 0.3 },
    skills: ['hushRing'],
    behavior: 'support',
    keepAt: 340,
    look: { shape: 'hood', color: 0x7a8a9a },
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;
export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];

export function enemyDef(id: EnemyId): EnemyDef {
  return ENEMIES[id];
}
