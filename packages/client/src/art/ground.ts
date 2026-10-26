import type { FieldId } from '@hakusura/core';
import { PixelGrid } from './pixel';

/**
 * 地面と床のドット絵。
 * 地面は戦場全体を1枚に描く(乾いた土・ひび・石・骨)。床は種類ごとに、縁の揺らいだ溜まりとして描く。
 * どちらも種つきの乱数で、同じ大きさなら毎回同じ絵になる
 */

/** 種つきの乱数。0 以上 1 未満を返す */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 格子の上でなめらかに揺らぐ値(0〜1)。土の濃淡や溜まりの縁に使う */
function valueNoise(seed: number, cell: number): (x: number, y: number) => number {
  const rand = seeded(seed);
  const table = Array.from({ length: 256 }, () => rand());
  const at = (i: number, j: number) => table[((i * 73856093) ^ (j * 19349663)) & 255]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = smooth(fx - i);
    const v = smooth(fy - j);
    const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
    const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
    return top * (1 - v) + bottom * v;
  };
}

const SOIL = ['#191715', '#1d1a17', '#211d19', '#25201b'] as const;
const CRACK = '#100e0c';
const STONE = ['#3a3530', '#2c2824', '#4a443c'] as const;
const BONE = ['#8a8070', '#6a6254'] as const;
const DEAD_GRASS = ['#3a3420', '#2e2a1a'] as const;

/** 戦場の地面。width×height 升の画布を返す(拡大して敷く) */
export function buildGround(width: number, height: number, seed = 7): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const big = valueNoise(seed, 40);
  const small = valueNoise(seed + 1, 7);
  const rand = seeded(seed + 2);
  const rgb = SOIL.map(toRgb);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 大きな濃淡と細かなざらつきを混ぜ、4段の色に落とす(ディザで段の境をぼかす)
      const n = big(x, y) * 0.65 + small(x, y) * 0.35 + (((x + y) & 1) - 0.5) * 0.06;
      const c = rgb[Math.min(rgb.length - 1, Math.max(0, Math.floor(n * rgb.length * 1.1 - 0.3)))]!;
      const k = (y * width + x) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  // ひび。折れ曲がりながら伸び、ときどき枝分かれする
  const crack = (x: number, y: number, len: number, angle: number) => {
    for (let i = 0; i < len; i++) {
      dot(x, y, CRACK);
      angle += (rand() - 0.5) * 0.9;
      x += Math.cos(angle);
      y += Math.sin(angle);
      if (rand() < 0.04 && len > 8) crack(x, y, Math.floor(len / 3), angle + (rand() < 0.5 ? 1 : -1));
    }
  };
  const area = width * height;
  for (let i = 0; i < area / 9000; i++) crack(rand() * width, rand() * height, 10 + rand() * 30, rand() * Math.PI * 2);
  // 石
  for (let i = 0; i < area / 2500; i++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    const w = 1 + Math.floor(rand() * 3);
    const h = 1 + Math.floor(rand() * 2);
    ctx.fillStyle = STONE[1];
    ctx.fillRect(x, y + 1, w, h);
    ctx.fillStyle = STONE[0];
    ctx.fillRect(x, y, w, h);
    if (w > 1) dot(x, y, STONE[2]);
  }
  // 枯れ草
  for (let i = 0; i < area / 3000; i++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    for (let j = 0; j < 3; j++) {
      const c = DEAD_GRASS[j % 2]!;
      dot(x + j - 1, y - (j === 1 ? 2 : 1), c);
      dot(x + j - 1, y, c);
    }
  }
  // 骨。細い骨と、ときどき髑髏
  for (let i = 0; i < area / 22000; i++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    if (rand() < 0.3) {
      ctx.fillStyle = BONE[0];
      ctx.fillRect(x, y, 3, 2);
      ctx.fillRect(x + 1, y + 2, 1, 1);
      dot(x, y + 1, CRACK);
      dot(x + 2, y + 1, CRACK);
    } else {
      const flat = rand() < 0.5;
      for (let j = 0; j < 4; j++) dot(x + (flat ? j : j * 0.5), y + (flat ? 0 : j), BONE[j === 0 || j === 3 ? 1 : 0]);
    }
  }
  return canvas;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 床の色。base が地、light が光る所、dark が縁や沈んだ所 */
const FLOOR_LOOK: Record<string, { base: string; light: string; dark: string; alpha: number }> = {
  oilPool: { base: '#2a2414', light: '#5a4e2e', dark: '#15120a', alpha: 0.92 },
  bloodPool: { base: '#4a1014', light: '#8a2228', dark: '#2a080a', alpha: 0.9 },
  puddle: { base: '#22384e', light: '#5a7a96', dark: '#142230', alpha: 0.8 },
  ashPile: { base: '#4e4a44', light: '#7a766e', dark: '#34312c', alpha: 0.92 },
  scorch: { base: '#24140c', light: '#5a2a12', dark: '#120a06', alpha: 0.92 },
  iceFloor: { base: '#5a7a90', light: '#c8e4f4', dark: '#3a5266', alpha: 0.88 },
  corpse: { base: '#3a2a24', light: '#5a463c', dark: '#1a1210', alpha: 1 },
};

/** 床の絵の半径を、この刻みに丸めて使い回す(升の数) */
export const FLOOR_RADIUS_STEP = 4;

/**
 * 床の溜まり1つの絵。radius は升の数(拡大前)。縁は角度ごとに揺らぎ、種類ごとに模様を足す。
 * 死体は溜まりでなく、倒れた体を描く
 */
export function drawFloor(field: FieldId, radius: number, seed = 1): PixelGrid {
  if (field === 'corpse') return drawCorpse();
  const size = radius * 2 + 3;
  const g = new PixelGrid(size, size);
  const look = FLOOR_LOOK[field] ?? FLOOR_LOOK.puddle!;
  const rand = seeded(seed * 31 + radius);
  const c = size / 2;
  // 角度ごとの縁の揺らぎ。いくつかの波を重ねる
  const waves = Array.from({ length: 3 }, (_, i) => ({ k: 2 + i * 2 + Math.floor(rand() * 2), phase: rand() * Math.PI * 2, amp: 0.07 / (i + 1) }));
  const edge = (a: number) => 1 - waves.reduce((s, w) => s + w.amp * (1 + Math.sin(a * w.k + w.phase)), 0);
  const inner = valueNoise(seed + radius, Math.max(3, radius / 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy) / radius;
      const e = edge(Math.atan2(dy, dx));
      if (d > e) continue;
      const n = inner(x, y);
      let color = look.base;
      if (d > e - 1.5 / radius) color = look.dark;
      else if (n > 0.74) color = look.light;
      else if (n < 0.24) color = look.dark;
      g.set(x, y, color);
    }
  }
  const inside = (x: number, y: number) => g.get(x, y) !== null;
  switch (field) {
    case 'oilPool':
    case 'puddle':
    case 'bloodPool': {
      // 水面の照り返し。左上に短い光の筋
      const shine = field === 'oilPool' ? '#8a7a4a' : field === 'puddle' ? '#9ab8d0' : '#b03a3a';
      for (let i = 0; i < Math.max(1, radius / 6); i++) {
        const x = Math.round(c - radius * 0.4 + rand() * radius * 0.5);
        const y = Math.round(c - radius * 0.4 + rand() * radius * 0.5);
        for (let j = 0; j < 2 + radius / 8; j++) if (inside(x + j, y)) g.set(x + j, y, shine);
      }
      if (field === 'oilPool') {
        // 油の虹色の筋
        for (let i = 0; i < radius / 5; i++) {
          const x = Math.round(c + (rand() - 0.5) * radius);
          const y = Math.round(c + (rand() - 0.5) * radius);
          if (inside(x, y)) g.set(x, y, i % 2 ? '#4a5a3a' : '#5a3a4a');
        }
      }
      break;
    }
    case 'ashPile': {
      // 灰の小山と燃え残り
      for (let i = 0; i < radius / 3; i++) {
        const x = Math.round(c + (rand() - 0.5) * radius * 1.2);
        const y = Math.round(c + (rand() - 0.5) * radius * 1.2);
        if (!inside(x, y)) continue;
        g.set(x, y, '#9a968c');
        if (rand() < 0.3) g.set(x + 1, y + 1, '#1a1612');
      }
      break;
    }
    case 'scorch': {
      // 焦げたひびと、燻る赤い点
      for (let i = 0; i < radius / 4; i++) {
        let x = c;
        let y = c;
        const a = rand() * Math.PI * 2;
        for (let j = 0; j < radius * 0.8; j++) {
          x += Math.cos(a + (rand() - 0.5));
          y += Math.sin(a + (rand() - 0.5));
          if (inside(x, y)) g.set(x, y, '#0a0604');
        }
      }
      for (let i = 0; i < radius / 3; i++) {
        const x = Math.round(c + (rand() - 0.5) * radius * 1.3);
        const y = Math.round(c + (rand() - 0.5) * radius * 1.3);
        if (inside(x, y)) g.set(x, y, '#c24a1a');
      }
      break;
    }
    case 'iceFloor': {
      // 氷のひびは斜めに走る白い線
      for (let i = 0; i < radius / 4; i++) {
        const x0 = c + (rand() - 0.5) * radius;
        const y0 = c + (rand() - 0.5) * radius;
        const len = radius * (0.3 + rand() * 0.4);
        const a = -0.6 + (rand() - 0.5) * 0.6;
        for (let j = 0; j < len; j++) {
          const x = x0 + Math.cos(a) * j;
          const y = y0 + Math.sin(a) * j;
          if (inside(x, y)) g.set(x, y, '#e8f6ff');
        }
      }
      break;
    }
  }
  return g;
}

/** 倒れた者の体。頭巾の残骸と骨のはみ出た、横たわる影 */
function drawCorpse(): PixelGrid {
  const g = new PixelGrid(24, 12);
  const cloth = '#3a2a24';
  const clothDark = '#241a16';
  const bone = '#8a8070';
  g.ellipse(12, 7, 10, 3.5, '#120d0b');
  g.ellipse(11, 6, 8, 3, cloth);
  g.rect(5, 6, 12, 2, clothDark);
  // 頭
  g.ellipse(19, 5, 2.5, 2, bone);
  g.set(19, 5, '#120d0b');
  g.set(20, 5, '#120d0b');
  // 投げ出した腕と脚の骨
  g.line(13, 3, 16, 1, bone);
  g.line(3, 7, 0, 9, bone);
  g.line(4, 5, 1, 4, bone);
  // 血の染み
  g.set(9, 9, '#5a1418');
  g.set(10, 9, '#5a1418');
  g.set(14, 8, '#5a1418');
  g.outline('#120d0b', ['#120d0b']);
  return g;
}

/** 床の絵の透明度(液体は下の土が少し透ける) */
export function floorAlpha(field: FieldId): number {
  return FLOOR_LOOK[field]?.alpha ?? 0.9;
}
