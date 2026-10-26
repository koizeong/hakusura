import type { EnemyId } from '@hakusura/core';
import { PixelGrid } from './pixel';

/**
 * 敵と案山子のドット絵。向きは正面(斜め上から見下ろす)の1つで、左を向くときは裏返す。
 * コマは 動き0・動き1・振りかぶり・被弾 の4つ。被弾は動き0を少しのけぞらせて作る。
 * 大きい敵は48×48、それ以外は32×32
 */
export const ENEMY_FRAMES = ['move0', 'move1', 'windup', 'hurt'] as const;
export type EnemyFrame = (typeof ENEMY_FRAMES)[number];

type ArtId = EnemyId | 'scarecrow';
type Painter = (g: PixelGrid, f: 0 | 1 | 2) => void;

const C = {
  outline: '#120d0b',
  shadow: 'rgba(0,0,0,0.38)',
  flesh: '#8a8f6a',
  fleshDark: '#5e6448',
  fleshLight: '#aab08a',
  pale: '#c8c0a8',
  paleDark: '#8e8672',
  bone: '#d0c4a4',
  boneDark: '#8a7e66',
  eyeGlow: '#e8e0b0',
  red: '#a02a30',
  redDark: '#5a1418',
  mouth: '#2a0a0a',
  soot: '#2c2622',
  sootLight: '#4a4038',
  ember: '#ff8a3e',
  emberDark: '#c0502a',
  rust: '#7a4a2a',
  rustDark: '#4a2a18',
  rustLight: '#a06a3a',
  iron: '#3a3a38',
  oil: '#3a2e1a',
  oilLight: '#5a4a2a',
  oilSheen: '#8a7a4a',
  robe: '#3a3e44',
  robeLight: '#5a6068',
  robeDark: '#24262a',
  bell: '#8fa4b8',
  bellDark: '#5a6a7a',
  necro: '#4a5a3e',
  necroDark: '#2e3a26',
  necroGlow: '#9adf6a',
  thorn: '#6a5a3a',
  thornDark: '#3e3220',
  thornSpike: '#a89870',
  frost: '#a8d0e8',
  frostDark: '#5a7a90',
  frostLight: '#e0f2ff',
  shadowBody: '#2a2038',
  shadowLight: '#4a3a6a',
  shadowEye: '#d8c8f0',
  plague: '#5a6a2a',
  plagueDark: '#3a4418',
  plagueLight: '#8a9a4a',
  leather: '#3a2618',
  doom: '#4a2e5a',
  doomDark: '#2a1838',
  doomLight: '#8a5aaa',
  gold: '#a8905a',
  zealot: '#c8a890',
  zealotDark: '#8a6a58',
  sac: '#7a3a3a',
  sacDark: '#4a1e22',
  sacLight: '#a85a5a',
  vein: '#c87070',
  monk: '#6a7078',
  monkDark: '#44484e',
  monkLight: '#8a9098',
  straw: '#a8905a',
  strawDark: '#6a5a34',
  burlap: '#8a7454',
  burlapDark: '#5a4a34',
  wood: '#4a3b2c',
} as const;

/** 足元の影と、外側の縁取り */
function finish(g: PixelGrid, shadowW: number): void {
  g.outline(C.outline, [C.shadow]);
  const cx = (g.width - 1) / 2;
  const y = g.height - 3;
  // 影は縁取りの後に、空いている所だけへ敷く
  for (let yy = y - 1; yy <= y + 1; yy++) {
    for (let x = Math.floor(cx - shadowW); x <= Math.ceil(cx + shadowW); x++) {
      if (((x - cx) / shadowW) ** 2 + ((yy - y) / 1.4) ** 2 <= 1 && !g.get(x, yy)) g.set(x, yy, C.shadow);
    }
  }
}

const ART: Record<ArtId, { size: 32 | 48; draw: Painter; shadow: number }> = {
  scarecrow: {
    size: 32,
    shadow: 6,
    draw: (g, f) => {
      g.rect(15, 10, 2, 19, C.wood);
      const tilt = f === 1 ? 1 : 0;
      g.rect(8, 13 + tilt, 16, 2, C.wood);
      g.rect(9, 15, 14, 6, C.strawDark);
      g.rect(10, 15, 12, 5, C.straw);
      for (const x of [9, 12, 19, 22]) g.set(x, 21, C.straw);
      g.ellipse(15.5, 8, 4, 4, C.burlap);
      g.rect(12, 9, 8, 2, C.burlapDark);
      g.set(14, 7, C.mouth);
      g.set(17, 7, C.mouth);
      g.line(13, 10, 18, 10, C.mouth);
      g.rect(10, 4, 12, 1, C.strawDark);
    },
  },
  ghoul: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 這うように前屈みの屍。長い腕で地を掻く
      const reach = f === 1 ? 1 : 0;
      g.ellipse(15.5, 20, 6, 4, C.flesh);
      g.ellipse(15.5, 19, 5, 2.5, C.fleshLight);
      for (const x of [12, 15, 18]) g.set(x, 18, C.fleshDark);
      g.rect(10 - reach, 21, 2, 6 + reach, C.fleshDark);
      g.rect(20 + reach, 21, 2, 6 - reach, C.fleshDark);
      g.rect(13, 23, 2, 5, C.flesh);
      g.rect(17, 23, 2, 5, C.flesh);
      const hy = f === 2 ? 11 : 13;
      g.ellipse(15.5, hy, 4, 3.5, C.flesh);
      g.set(14, hy - 1, C.eyeGlow);
      g.set(17, hy - 1, C.eyeGlow);
      if (f === 2) {
        g.rect(14, hy + 1, 4, 2, C.mouth);
        g.set(15, hy + 1, C.bone);
      } else g.line(14, hy + 2, 17, hy + 2, C.fleshDark);
    },
  },
  sootSpitter: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 煤にまみれたずんぐりした者。喉の袋が熾火に光る
      const bob = f === 1 ? 1 : 0;
      g.rect(12, 22, 3, 6, C.soot);
      g.rect(17, 22, 3, 6, C.soot);
      g.ellipse(15.5, 18 + bob, 7, 6, C.soot);
      g.ellipse(14, 16 + bob, 4, 3, C.sootLight);
      const glow = f === 2 ? C.ember : C.emberDark;
      g.ellipse(15.5, 21 + bob, 3, 2, glow);
      g.ellipse(15.5, 10 + bob, 4, 3.5, C.soot);
      g.set(14, 9 + bob, C.ember);
      g.set(17, 9 + bob, C.ember);
      g.rect(14, 12 + bob, 4, f === 2 ? 2 : 1, f === 2 ? C.ember : C.mouth);
      g.rect(8, 16 + bob, 2, 5, C.soot);
      g.rect(22, 16 + bob, 2, 5, C.soot);
    },
  },
  rustKnight: {
    size: 48,
    shadow: 11,
    draw: (g, f) => {
      // 錆びた全身鎧。大剣を肩に担ぎ、振りかぶりで頭上へ
      const bob = f === 1 ? 1 : 0;
      g.rect(18, 34, 4, 9, C.rustDark);
      g.rect(26, 34, 4, 9, C.rustDark);
      g.rect(17, 41, 6, 2, C.iron);
      g.rect(25, 41, 6, 2, C.iron);
      g.rect(15, 19 + bob, 18, 16, C.rust);
      g.rect(16, 20 + bob, 6, 14, C.rustLight);
      g.rect(23, 21 + bob, 2, 12, C.rustDark);
      g.rect(15, 28 + bob, 18, 2, C.iron);
      g.ellipse(14, 20 + bob, 4, 3, C.rust);
      g.ellipse(34, 20 + bob, 4, 3, C.rust);
      g.rect(10, 21 + bob, 4, 10, C.rustDark);
      g.rect(34, 21 + bob, 4, 10, C.rustDark);
      // 兜と覗き穴
      g.rect(19, 9 + bob, 10, 10, C.rust);
      g.rect(20, 8 + bob, 8, 1, C.rustLight);
      g.rect(20, 13 + bob, 8, 2, C.mouth);
      g.set(21, 13 + bob, C.ember);
      g.set(26, 13 + bob, C.ember);
      g.rect(23, 15 + bob, 2, 4, C.rustDark);
      if (f === 2) {
        // 頭上に掲げた大剣
        g.rect(35, 2, 3, 20, C.rustLight);
        g.rect(36, 2, 1, 20, C.pale);
        g.rect(32, 20, 9, 2, C.iron);
      } else {
        g.rect(37, 10 + bob, 3, 26, C.rustLight);
        g.rect(38, 10 + bob, 1, 26, C.pale);
        g.rect(34, 30 + bob, 9, 2, C.iron);
      }
    },
  },
  oilBloat: {
    size: 48,
    shadow: 13,
    draw: (g, f) => {
      // 油で膨れた袋のような体。照りと、口から垂れる油
      const swell = f === 1 ? 1 : 0;
      g.ellipse(23.5, 27, 13 + swell, 12 + swell, C.oil);
      g.ellipse(20, 23, 7, 6, C.oilLight);
      g.ellipse(17, 20, 2.5, 2, C.oilSheen);
      g.set(29, 30, C.oilSheen);
      g.rect(16, 37, 4, 5, C.oil);
      g.rect(28, 37, 4, 5, C.oil);
      g.ellipse(23.5, 15, 5, 4, C.oil);
      g.set(21, 14, C.eyeGlow);
      g.set(26, 14, C.eyeGlow);
      const open = f === 2 ? 3 : 1;
      g.rect(21, 17, 6, open, C.mouth);
      if (f === 2) for (let y = 20; y <= 26; y++) g.set(23 + (y % 2), y, C.oilSheen);
    },
  },
  bellKeeper: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 衣を纏い、弔いの鐘を提げる
      const swingX = f === 1 ? 1 : 0;
      for (let r = 0; r < 14; r++) g.rect(15 - Math.floor(r / 3) - 3, 13 + r, 2 * (Math.floor(r / 3) + 3) + 2, 1, C.robe);
      g.rect(12, 14, 3, 12, C.robeLight);
      g.ellipse(15.5, 9, 4, 4, C.robeDark);
      g.rect(14, 9, 4, 3, C.mouth);
      g.set(14, 10, C.eyeGlow);
      g.set(17, 10, C.eyeGlow);
      const bx = 23 + swingX;
      const by = f === 2 ? 8 : 18;
      g.line(20, 17, bx, by - 3, C.leather);
      g.ellipse(bx, by, 3, 3, C.bell);
      g.rect(bx - 3, by + 1, 7, 2, C.bellDark);
      g.set(bx, by + 3, C.iron);
    },
  },
  corpseCaller: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 屍術師。頭巾の衣と髑髏の杖、手に緑の灯
      for (let r = 0; r < 15; r++) g.rect(15 - Math.floor(r / 4) - 3, 13 + r, 2 * (Math.floor(r / 4) + 3) + 2, 1, C.necro);
      g.rect(13, 15, 2, 11, C.necroDark);
      const hood: [number, number, number][] = [[4, 15, 16], [5, 13, 18], [6, 12, 19], [7, 12, 19], [8, 12, 19], [9, 12, 19], [10, 12, 19], [11, 13, 18], [12, 13, 18]];
      for (const [y, x0, x1] of hood) g.rect(x0, y, x1 - x0 + 1, 1, C.necroDark);
      g.rect(14, 8, 4, 4, C.mouth);
      g.set(14, 9, C.necroGlow);
      g.set(17, 9, C.necroGlow);
      // 杖
      const lift = f === 2 ? -4 : f === 1 ? -1 : 0;
      g.rect(23, 8 + lift, 1, 20, C.wood);
      g.ellipse(23.5, 7 + lift, 2.5, 2.5, C.bone);
      g.set(22, 6 + lift, C.mouth);
      g.set(24, 6 + lift, C.mouth);
      g.ellipse(10, 20 + (f === 2 ? -6 : 0), 1.5, 1.5, C.necroGlow);
    },
  },
  thornHusk: {
    size: 48,
    shadow: 11,
    draw: (g, f) => {
      // 棘に覆われた亡者。乾いた皮と、四方へ突き出す棘
      const bob = f === 1 ? 1 : 0;
      g.rect(18, 33, 4, 10, C.thornDark);
      g.rect(26, 33, 4, 10, C.thornDark);
      g.ellipse(23.5, 25 + bob, 10, 11, C.thorn);
      g.ellipse(21, 22 + bob, 4, 5, C.thornDark);
      g.ellipse(20, 21 + bob, 2, 3, C.thorn);
      g.ellipse(23.5, 12 + bob, 5, 5, C.thorn);
      g.set(21, 12 + bob, C.ember);
      g.set(26, 12 + bob, C.ember);
      const spikes: [number, number, number, number][] = [
        [14, 20, 9, 17], [33, 20, 38, 17], [15, 30, 10, 33], [32, 30, 37, 33], [19, 15, 16, 10], [28, 15, 31, 10], [23, 7, 23, 3], [23, 35, 23, 37],
      ];
      for (const [x0, y0, x1, y1] of spikes) g.line(x0, y0 + bob, x1, y1 + bob, C.thornSpike);
      const claw = f === 2 ? -6 : 0;
      g.rect(11, 24 + bob + claw, 3, 8, C.thornDark);
      g.rect(34, 24 + bob + claw, 3, 8, C.thornDark);
    },
  },
  frostWitch: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 霜の巫女。白い衣と氷の冠
      for (let r = 0; r < 15; r++) g.rect(15 - Math.floor(r / 3) - 2, 13 + r, 2 * (Math.floor(r / 3) + 2) + 2, 1, C.frost);
      g.rect(12, 15, 2, 11, C.frostLight);
      g.rect(18, 14, 2, 13, C.frostDark);
      g.ellipse(15.5, 9, 3.5, 3.5, C.pale);
      g.rect(14, 8, 1, 1, C.frostDark);
      g.rect(17, 8, 1, 1, C.frostDark);
      for (const [x, h] of [[12, 2], [14, 4], [16, 5], [17, 4], [19, 2]] as const) g.rect(x, 5 - h + 1, 1, h, C.frostLight);
      const up = f === 2 ? -7 : f === 1 ? -1 : 0;
      g.rect(9, 17 + up, 2, 5, C.frost);
      g.rect(21, 17 + up, 2, 5, C.frost);
      if (f === 2) {
        g.ellipse(10, 9, 1.5, 1.5, C.frostLight);
        g.ellipse(22, 9, 1.5, 1.5, C.frostLight);
      }
    },
  },
  shadowStalker: {
    size: 32,
    shadow: 6,
    draw: (g, f) => {
      // 影の塊。輪郭がほどけ、目と刃だけがはっきりする
      const crouch = f === 2 ? 2 : 0;
      g.ellipse(15.5, 19 + crouch, 6, 7 - crouch / 2, C.shadowBody);
      g.ellipse(14, 17 + crouch, 3, 3, C.shadowLight);
      for (const x of [10, 13, 18, 21]) g.set(x, 26 + (f === 1 ? (x % 2) : 0), C.shadowBody);
      g.ellipse(15.5, 11 + crouch, 4, 3.5, C.shadowBody);
      g.set(14, 11 + crouch, C.shadowEye);
      g.set(17, 11 + crouch, C.shadowEye);
      if (f === 2) g.line(21, 18, 27, 13, C.shadowEye);
      else g.line(21, 20, 24, 25, C.shadowLight);
    },
  },
  plagueCarrier: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 背に膿の袋を負い、嘴の面を被る
      const bob = f === 1 ? 1 : 0;
      g.ellipse(18, 15 + bob, 7, 6, C.plague);
      g.ellipse(16, 13 + bob, 3, 2, C.plagueLight);
      for (let r = 0; r < 12; r++) g.rect(15 - Math.floor(r / 4) - 3, 16 + r, 2 * (Math.floor(r / 4) + 3) + 1, 1, C.leather);
      g.ellipse(13, 12 + bob, 3.5, 3.5, C.leather);
      g.line(10, 13 + bob, 7, 15 + bob, C.bone);
      g.set(12, 11 + bob, C.eyeGlow);
      const cy = f === 2 ? 15 : 22;
      g.line(9, 19, 7, cy, C.iron);
      g.ellipse(7, cy + 2, 2, 2, C.plagueLight);
    },
  },
  doomHerald: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 顔のない背の高い者。宣告の旗竿を掲げる
      for (let r = 0; r < 18; r++) g.rect(15 - Math.floor(r / 5) - 2, 10 + r, 2 * (Math.floor(r / 5) + 2) + 2, 1, C.doom);
      g.rect(13, 12, 2, 15, C.doomLight);
      g.ellipse(15.5, 7, 3.5, 4, C.doomDark);
      g.rect(14, 6, 4, 4, C.mouth);
      const lift = f === 2 ? -4 : 0;
      g.rect(22, 4 + lift, 1, 24, C.wood);
      g.rect(19, 6 + lift, 7, 1, C.gold);
      g.rect(20, 7 + lift, 5, f === 1 ? 6 : 5, C.doomLight);
      g.set(22, 9 + lift, C.eyeGlow);
    },
  },
  bloodZealot: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 裸の上半身に傷を刻んだ狂信者。両手に血の刃
      const crouch = f === 2 ? 2 : 0;
      g.rect(12, 22 + crouch, 3, 6 - crouch, C.redDark);
      g.rect(17, 22 + crouch, 3, 6 - crouch, C.redDark);
      g.rect(11, 13 + crouch, 10, 10, C.zealot);
      g.rect(11, 13 + crouch, 2, 10, C.zealotDark);
      for (const [x, y] of [[14, 15], [16, 17], [13, 19], [18, 14]] as const) g.line(x, y + crouch, x + 2, y + 1 + crouch, C.red);
      g.ellipse(15.5, 9 + crouch, 3.5, 3.5, C.redDark);
      g.rect(14, 10 + crouch, 4, 2, C.mouth);
      g.set(14, 10 + crouch, C.eyeGlow);
      g.set(17, 10 + crouch, C.eyeGlow);
      const arm = f === 1 ? 1 : 0;
      g.rect(8, 14 + crouch, 2, 6, C.zealot);
      g.rect(22, 14 + crouch, 2, 6, C.zealot);
      g.line(8, 20 + crouch + arm, 6, 25 + crouch, C.red);
      g.line(23, 20 + crouch - arm, 25, 25 + crouch, C.red);
    },
  },
  broodSac: {
    size: 48,
    shadow: 14,
    draw: (g, f) => {
      // 地に根を張った肉の袋。脈打ち、産むときに口が裂ける
      const swell = f === 1 ? 1 : f === 2 ? 2 : 0;
      for (const [x0, x1] of [[10, 4], [16, 12], [31, 36], [37, 44]] as const) g.line(x0, 40, x1, 44, C.sacDark);
      g.ellipse(23.5, 27, 14 + swell, 13 + swell, C.sac);
      g.ellipse(19, 22, 6, 5, C.sacLight);
      for (const [x0, y0, x1, y1] of [[14, 30, 20, 24], [30, 20, 34, 30], [22, 34, 28, 30]] as const) g.line(x0, y0, x1, y1, C.vein);
      g.rect(20, 32, 8, f === 2 ? 4 : 1, C.mouth);
      if (f === 2) g.ellipse(24, 34, 2, 1, C.flesh);
    },
  },
  hushMonk: {
    size: 32,
    shadow: 7,
    draw: (g, f) => {
      // 口を縫い閉じた修道士。数珠を繰る
      for (let r = 0; r < 15; r++) g.rect(15 - Math.floor(r / 4) - 3, 13 + r, 2 * (Math.floor(r / 4) + 3) + 2, 1, C.monk);
      g.rect(13, 14, 2, 12, C.monkLight);
      g.rect(18, 14, 2, 13, C.monkDark);
      g.ellipse(15.5, 9, 3.5, 3.5, C.pale);
      g.rect(12, 5, 8, 3, C.monkDark);
      g.set(14, 9, C.mouth);
      g.set(17, 9, C.mouth);
      // 縫い閉じた口
      g.line(14, 11, 17, 11, C.redDark);
      for (const x of [14, 16]) g.set(x, 12, C.redDark);
      const hands = f === 2 ? 15 : 19;
      g.rect(14, hands, 4, 2, C.pale);
      for (let i = 0; i < 5; i++) g.set(13 + i, hands + 2 + (i % 2) + (f === 1 ? 1 : 0), C.boneDark);
      if (f === 2) g.ellipse(15.5, hands - 2, 1.5, 1.5, C.shadowEye);
    },
  },
};

/** その敵の1コマ */
export function drawEnemy(id: ArtId, frame: EnemyFrame): PixelGrid {
  const art = ART[id];
  const g = new PixelGrid(art.size, art.size);
  if (frame === 'hurt') {
    // 動き0を左上へ1マスのけぞらせる
    const base = new PixelGrid(art.size, art.size);
    art.draw(base, 0);
    for (let y = 0; y < art.size; y++) for (let x = 0; x < art.size; x++) {
      const c = base.get(x, y);
      if (c) g.set(x - 1, y - 1, c);
    }
  } else art.draw(g, ENEMY_FRAMES.indexOf(frame) as 0 | 1 | 2);
  finish(g, art.shadow);
  return g;
}

/** 絵の大きさ */
export function enemyArtSize(id: ArtId): number {
  return ART[id].size;
}

/** 絵のどの高さを立ち位置(当たり判定の中心)に合わせるか。胴のあたり */
export function enemyArtOrigin(id: ArtId): number {
  return id === 'scarecrow' ? 0.55 : ART[id].size === 48 ? 0.58 : 0.62;
}

/** 4コマを横に並べた1枚 */
export function buildEnemySheet(id: ArtId): HTMLCanvasElement {
  const size = ART[id].size;
  const canvas = document.createElement('canvas');
  canvas.width = size * ENEMY_FRAMES.length;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ENEMY_FRAMES.forEach((f, i) => drawEnemy(id, f).paint(ctx, i * size, 0));
  return canvas;
}
