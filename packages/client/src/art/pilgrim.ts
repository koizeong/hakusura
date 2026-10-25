import { PixelGrid } from './pixel';

/**
 * 自キャラ「巡礼者」のドット絵。頭巾と擦り切れた外套に、血の色の襟巻き。
 * 1コマ32×32。向きは下・上・横(左は横を裏返す)。
 * 並びは SHEET_LAYOUT のとおりで、同じ並びの PNG(public/art/pilgrim.png)を置けばそちらを使う
 */

export const FRAME = 32;
export type Dir = 'down' | 'up' | 'side';
export type Anim = 'idle' | 'walk' | 'attack' | 'hurt';

/** コマの並び。行が向き、列が動き */
export const SHEET_LAYOUT = {
  rows: ['down', 'up', 'side'] as const,
  columns: [
    ['idle', 0],
    ['idle', 1],
    ['walk', 0],
    ['walk', 1],
    ['walk', 2],
    ['walk', 3],
    ['attack', 0],
    ['attack', 1],
    ['attack', 2],
    ['hurt', 0],
  ] as const,
};

/** 動きごとのコマ数 */
export const ANIM_FRAMES: Record<Anim, number> = { idle: 2, walk: 4, attack: 3, hurt: 1 };

export function frameIndex(dir: Dir, anim: Anim, i: number): number {
  const row = SHEET_LAYOUT.rows.indexOf(dir);
  const col = SHEET_LAYOUT.columns.findIndex(([a, n]) => a === anim && n === i % ANIM_FRAMES[anim]);
  return row * SHEET_LAYOUT.columns.length + Math.max(0, col);
}

/** 色。くすんだ少ない色で、襟巻きの赤だけを差す */
const C = {
  outline: '#140f0c',
  shadow: 'rgba(0,0,0,0.38)',
  cloakDark: '#2e2620',
  cloakShade: '#3e332a',
  cloak: '#54463a',
  cloakLight: '#6e5e4c',
  tunic: '#241c17',
  trouser: '#3a3230',
  trouserDark: '#2a2422',
  boot: '#2a1e16',
  bootDark: '#1e1610',
  belt: '#4a3020',
  metal: '#9a9488',
  skin: '#c4a888',
  skinShade: '#8a6e56',
  face: '#0e0a08',
  eye: '#e8dcc8',
  accent: '#7a1f22',
  accentLight: '#a83228',
  accentDark: '#541418',
} as const;

/** 1コマの姿勢 */
interface Pose {
  /** 上半身の上下(息づかい・歩きの揺れ) */
  bob: number;
  /** 上半身の横ずれ(のけぞり) */
  shift: number;
  /** 下・上向き:上がっている足(-1 左、1 右、0 なし)。横向き:歩幅 */
  step: number;
  /** 腕の振り */
  swing: number;
  attack?: 0 | 1 | 2;
  hurt?: boolean;
}

function poseOf(anim: Anim, i: number): Pose {
  switch (anim) {
    case 'idle':
      return { bob: i, shift: 0, step: 0, swing: 0 };
    case 'walk':
      return { bob: i % 2, shift: 0, step: [-1, 0, 1, 0][i]!, swing: [1, 0, -1, 0][i]! };
    case 'attack':
      return { bob: i === 1 ? 1 : 0, shift: 0, step: 0, swing: 0, attack: i as 0 | 1 | 2 };
    case 'hurt':
      return { bob: -1, shift: -1, step: 0, swing: 0, hurt: true };
  }
}

/** 下向き(front)と上向き(back)。左右がほぼ対称 */
function drawFrontBack(g: PixelGrid, back: boolean, p: Pose): void {
  const by = p.bob;
  const ux = (x: number) => x + p.shift;
  g.ellipse(15.5, 29, 6, 1.4, C.shadow);

  // 足。上がった足は短く描く
  const leg = (x: number, lifted: boolean) => {
    const bottom = lifted ? 27 : 28;
    g.rect(x, 24, 2, bottom - 24 - 1, C.trouser);
    g.rect(x, bottom - 1, 2, 2, C.boot);
  };
  leg(13, p.step === -1);
  leg(17, p.step === 1);

  // 外套。下へ行くほど広がり、裾は擦り切れている
  for (let r = 0; r < 12; r++) {
    const y = 14 + r + by;
    const hw = 5 + Math.floor(r / 4);
    const x0 = 16 - hw;
    const x1 = 15 + hw;
    for (let x = x0; x <= x1; x++) {
      if (r === 11 && (x + 1) % 3 === 0) continue;
      let c: string = C.cloak;
      if (x === x0 || x === x1) c = C.cloakDark;
      else if (x === x0 + 1) c = C.cloakLight;
      else if (x === x1 - 1) c = C.cloakShade;
      g.set(ux(x), y, c);
    }
    if (!back && r >= 1 && r <= 9) g.rect(ux(15), y, 2, 1, C.tunic);
    if (back && r >= 2 && r <= 10) g.set(ux(15), y, C.cloakShade);
    if (!back && r === 5) {
      g.rect(ux(x0 + 1), y, x1 - x0 - 1, 1, C.belt);
      g.rect(ux(15), y, 2, 1, C.metal);
    }
  }

  // 腕。袖と手。右の腕(画面の右)で振るう
  const arm = (side: -1 | 1, dy: number) => {
    const x = side === -1 ? ux(10) : ux(21);
    g.rect(x, 16 + by + dy, 1, 4, C.cloakDark);
    g.set(x, 20 + by + dy, back ? C.skinShade : C.skin);
  };
  arm(-1, p.swing);
  if (p.attack === undefined) arm(1, -p.swing);
  else if (!back) {
    if (p.attack === 0) {
      g.rect(ux(21), 12 + by, 1, 5, C.cloakDark);
      g.rect(ux(21), 11 + by, 2, 1, C.skin);
    } else if (p.attack === 1) {
      g.rect(ux(19), 18 + by, 2, 5, C.cloakShade);
      g.rect(ux(20), 23 + by, 2, 2, C.skin);
    } else {
      g.rect(ux(21), 17 + by, 1, 4, C.cloakDark);
      g.rect(ux(21), 21 + by, 2, 1, C.skin);
    }
  } else {
    if (p.attack === 0) {
      g.rect(ux(21), 17 + by, 1, 3, C.cloakDark);
      g.set(ux(22), 20 + by, C.skinShade);
    } else if (p.attack === 1) {
      g.rect(ux(20), 6 + by, 2, 7, C.cloakShade);
      g.rect(ux(20), 5 + by, 2, 1, C.skinShade);
    } else {
      g.rect(ux(21), 10 + by, 1, 5, C.cloakDark);
      g.set(ux(21), 9 + by, C.skinShade);
    }
  }

  // 襟巻き。前は右へ、後ろは左へ端が垂れる
  g.rect(ux(11), 13 + by, 10, 2, C.accent);
  g.rect(ux(12), 13 + by, 2, 1, C.accentLight);
  if (!back) {
    g.rect(ux(19), 15 + by, 2, 4, C.accent);
    g.set(ux(20), 19 + by, C.accentDark);
  } else {
    g.rect(ux(11), 15 + by, 2, 5, C.accent);
    g.set(ux(11), 20 + by, C.accentDark);
  }

  // 頭巾
  const hood: [number, number, number][] = [
    [3, 15, 16],
    [4, 13, 18],
    [5, 12, 19],
    [6, 11, 20],
    [7, 11, 20],
    [8, 11, 20],
    [9, 11, 20],
    [10, 11, 20],
    [11, 11, 20],
    [12, 11, 20],
  ];
  for (const [y, x0, x1] of hood) {
    for (let x = x0; x <= x1; x++) {
      let c: string = C.cloak;
      if (x === x0) c = C.cloakLight;
      else if (x === x1) c = C.cloakDark;
      else if (x === x1 - 1) c = C.cloakShade;
      g.set(ux(x), y + by, c);
    }
  }
  g.rect(ux(14), 4 + by, 3, 2, C.cloakLight);
  if (back) {
    // 頭巾の後ろの縫い目
    for (let y = 6; y <= 11; y++) g.set(ux(16), y + by, C.cloakShade);
    return;
  }
  // 頭巾の奥の暗がりと、そこに光る目
  g.rect(ux(14), 7 + by, 4, 1, C.face);
  g.rect(ux(13), 8 + by, 6, 4, C.face);
  g.rect(ux(14), 12 + by, 4, 1, C.face);
  g.rect(ux(14), 10 + by, 4, 2, C.skin);
  g.rect(ux(15), 12 + by, 2, 1, C.skinShade);
  if (!p.hurt) {
    g.set(ux(14), 9 + by, C.eye);
    g.set(ux(17), 9 + by, C.eye);
  } else {
    g.set(ux(14), 10 + by, C.skinShade);
    g.set(ux(17), 10 + by, C.skinShade);
  }
}

/** 横向き(右を向く)。左向きはこれを裏返す */
function drawSide(g: PixelGrid, p: Pose): void {
  const by = p.bob;
  const ux = (x: number) => x + p.shift;
  g.ellipse(16, 29, 5.5, 1.4, C.shadow);

  // 足。歩幅だけ前後に開く。奥の足は暗い
  const s = p.step * 2;
  const leg = (x: number, near: boolean) => {
    g.rect(x, 24, 2, 3, near ? C.trouser : C.trouserDark);
    g.rect(x, 27, 2, 2, near ? C.boot : C.bootDark);
    g.set(x + 2, 28, near ? C.boot : C.bootDark);
  };
  leg(15 - s, false);
  leg(16 + s, true);

  // 外套。背中側が広く、歩くと裾が後ろへ流れる
  const flutter = p.step !== 0 ? 1 : 0;
  for (let r = 0; r < 12; r++) {
    const y = 14 + r + by;
    const x0 = 12 - Math.floor(r / 4) - (r >= 8 ? flutter : 0);
    const x1 = 19 + (r >= 8 ? 1 : 0);
    for (let x = x0; x <= x1; x++) {
      if (r === 11 && (x + 1) % 3 === 0) continue;
      let c: string = C.cloak;
      if (x === x0) c = C.cloakLight;
      else if (x === x1) c = C.cloakDark;
      else if (x === x1 - 1) c = C.cloakShade;
      g.set(ux(x), y, c);
    }
    if (r === 5) {
      g.rect(ux(13), y, x1 - 13, 1, C.belt);
      g.set(ux(18), y, C.metal);
    }
  }

  // 手前の腕
  if (p.attack === undefined) {
    g.rect(ux(16), 16 + by, 2, 4, C.cloakShade);
    g.rect(ux(16 + p.swing), 20 + by, 2, 1, C.skin);
  } else if (p.attack === 0) {
    g.rect(ux(12), 15 + by, 2, 4, C.cloakShade);
    g.set(ux(11), 15 + by, C.skin);
  } else if (p.attack === 1) {
    g.rect(ux(18), 17 + by, 6, 2, C.cloakShade);
    g.rect(ux(24), 17 + by, 2, 2, C.skin);
  } else {
    g.rect(ux(17), 18 + by, 3, 2, C.cloakShade);
    g.set(ux(20), 20 + by, C.skin);
  }

  // 襟巻き。端は後ろへなびく
  g.rect(ux(13), 13 + by, 7, 2, C.accent);
  g.rect(ux(14), 13 + by, 2, 1, C.accentLight);
  if (p.step !== 0) {
    g.rect(ux(9), 14 + by, 4, 1, C.accent);
    g.set(ux(9), 15 + by, C.accentDark);
  } else {
    g.rect(ux(11), 15 + by, 2, 3, C.accent);
    g.set(ux(11), 18 + by, C.accentDark);
  }

  // 頭巾(横顔)。後ろへ垂れる
  const hood: [number, number, number][] = [
    [3, 14, 15],
    [4, 13, 17],
    [5, 12, 18],
    [6, 11, 19],
    [7, 11, 19],
    [8, 11, 19],
    [9, 11, 19],
    [10, 11, 19],
    [11, 11, 19],
    [12, 11, 18],
    [13, 11, 12],
  ];
  for (const [y, x0, x1] of hood) {
    for (let x = x0; x <= x1; x++) {
      let c: string = C.cloak;
      if (x === x0) c = C.cloakLight;
      else if (x === x1) c = C.cloakDark;
      g.set(ux(x), y + by, c);
    }
  }
  g.rect(ux(13), 4 + by, 3, 2, C.cloakLight);
  // 顔は右に覗く
  g.rect(ux(18), 7 + by, 2, 1, C.face);
  g.rect(ux(17), 8 + by, 3, 4, C.face);
  g.rect(ux(18), 9 + by, 2, 3, C.skin);
  g.set(ux(20), 10 + by, C.skin);
  g.set(ux(18), 11 + by, C.skinShade);
  g.set(ux(19), 9 + by, p.hurt ? C.skinShade : C.eye);
}

/** 1コマを描く */
export function drawPilgrim(dir: Dir, anim: Anim, i: number): PixelGrid {
  const g = new PixelGrid(FRAME);
  const pose = poseOf(anim, i);
  if (dir === 'side') drawSide(g, pose);
  else drawFrontBack(g, dir === 'up', pose);
  g.outline(C.outline, [C.shadow]);
  return g;
}

/** 全てのコマを並べた1枚の画布。SHEET_LAYOUT の並び */
export function buildPilgrimSheet(): HTMLCanvasElement {
  const cols = SHEET_LAYOUT.columns.length;
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * cols;
  canvas.height = FRAME * SHEET_LAYOUT.rows.length;
  const ctx = canvas.getContext('2d')!;
  SHEET_LAYOUT.rows.forEach((dir, row) => {
    SHEET_LAYOUT.columns.forEach(([anim, n], col) => drawPilgrim(dir, anim, n).paint(ctx, col * FRAME, row * FRAME));
  });
  return canvas;
}
