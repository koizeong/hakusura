import type { ArmorMaterialId, EquipSlotId, Item } from '@hakusura/core';
import { PixelGrid } from './pixel';
import { drawShield, drawWeapon } from './weapons';

/**
 * 装備の印(支度の画面の札に添える)。32×32 升。
 * 武器と盾は手に持つ絵をそのまま使い、防具は部位の形に素材の色、装飾品は指輪・首飾り・護符、
 * アーティファクトは古い遺物の形で描く
 */
export const ITEM_ICON_SIZE = 32;

/** 防具の素材の色(地・明るい所・暗い所) */
const MATERIAL_COLORS: Record<ArmorMaterialId, readonly [string, string, string]> = {
  leather: ['#5a3e26', '#7a5a3a', '#3a2616'],
  chain: ['#6a6c68', '#9a9c98', '#3a3c3a'],
  bone: ['#b8ac90', '#d8d0b8', '#7a6e56'],
  soot: ['#3a3430', '#5a524a', '#1e1a18'],
  storm: ['#4a5a7a', '#8aa0c8', '#2a3248'],
  blood: ['#6a1a1e', '#9a3036', '#3a0c10'],
  pilgrim: ['#6a5a44', '#8a7a5e', '#423828'],
  hunter: ['#3e4a2e', '#5e6a44', '#262e1a'],
  frost: ['#7a9ab0', '#c8e0f0', '#4a6478'],
  mire: ['#4e5a2a', '#76843e', '#2e3618'],
  hex: ['#4a2e5a', '#7a4e8a', '#2a1a36'],
  pyre: ['#5e5a54', '#8a867e', '#3a3834'],
  bloodpact: ['#4a1418', '#7a2a2e', '#2a080c'],
  iron: ['#3e3e3c', '#6a6a66', '#222220'],
  priest: ['#5a4e6a', '#8a7e9a', '#342c42'],
};
const NO_MATERIAL = ['#5a4e3e', '#7a6e5a', '#3a3226'] as const;

function armorIcon(g: PixelGrid, slot: EquipSlotId, [base, light, dark]: readonly [string, string, string]): void {
  switch (slot) {
    case 'head': {
      // 頭巾。顔は闇に沈む
      g.ellipse(16, 15, 9, 10, base);
      g.rect(7, 18, 18, 8, base);
      g.ellipse(16, 18, 5.5, 6, '#0e0b09');
      g.line(9, 8, 13, 6, light);
      g.rect(7, 25, 18, 2, dark);
      g.set(14, 18, '#c8b48a');
      g.set(18, 18, '#c8b48a');
      break;
    }
    case 'body': {
      // 胴着。肩当てと帯
      g.rect(9, 7, 14, 20, base);
      g.rect(5, 7, 6, 6, dark);
      g.rect(21, 7, 6, 6, dark);
      g.rect(13, 6, 6, 3, '#0e0b09');
      g.rect(9, 18, 14, 2, dark);
      g.set(16, 19, light);
      g.line(11, 9, 11, 16, light);
      g.rect(10, 26, 12, 1, dark);
      break;
    }
    case 'hands': {
      // 籠手。指と手首の帯
      g.rect(10, 15, 11, 9, base);
      g.rect(10, 9, 3, 7, base);
      g.rect(13, 8, 3, 8, base);
      g.rect(16, 9, 3, 7, base);
      g.rect(19, 11, 3, 6, base);
      g.rect(6, 17, 4, 4, base);
      g.rect(10, 24, 11, 4, dark);
      g.line(11, 10, 11, 14, light);
      g.line(14, 9, 14, 14, light);
      break;
    }
    case 'feet': {
      // 長靴。脛と爪先
      g.rect(10, 5, 9, 17, base);
      g.rect(10, 20, 15, 6, base);
      g.rect(10, 26, 16, 2, dark);
      g.rect(10, 11, 9, 2, dark);
      g.line(12, 6, 12, 19, light);
      g.set(24, 21, light);
      break;
    }
    default:
      g.ellipse(16, 16, 9, 9, base);
  }
}

/** 装飾品の形。名前の言葉で決まり、どれにも当たらなければ指輪 */
const ACCESSORY_SHAPES = [
  ['指輪', 'ring'],
  ['数珠', 'beads'],
  ['護符', 'talisman'],
  ['鈴', 'bell'],
  ['鏡', 'mirror'],
  ['徽章', 'badge'],
] as const;
type AccessoryShape = (typeof ACCESSORY_SHAPES)[number][1];

function accessoryShape(name: string): AccessoryShape {
  return ACCESSORY_SHAPES.find(([word]) => name.includes(word))?.[1] ?? 'ring';
}

/** 装飾品。形は名前から、石の色は品ごとに */
function accessoryIcon(g: PixelGrid, shape: AccessoryShape, seed: number): void {
  const gold = '#a8884a';
  const goldDark = '#6a5228';
  const gem = ['#8a2a30', '#3a6a8a', '#5a8a3a', '#7a4a9a'][seed % 4]!;
  switch (shape) {
    case 'ring': {
      // 指輪
      for (let a = 0; a < 40; a++) {
        const t = (a / 40) * Math.PI * 2;
        g.set(16 + Math.cos(t) * 8, 19 + Math.sin(t) * 6, a > 20 ? goldDark : gold);
        g.set(16 + Math.cos(t) * 7, 19 + Math.sin(t) * 5, goldDark);
      }
      g.ellipse(16, 11, 3.5, 3, gem);
      g.set(15, 10, '#f2ead8');
      break;
    }
    case 'beads': {
      // 数珠。灰色の玉の輪と房
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        g.ellipse(16 + Math.cos(t) * 9, 14 + Math.sin(t) * 8, 1.6, 1.6, a % 3 ? '#7a766e' : gem);
      }
      g.rect(15, 22, 3, 3, gem);
      g.line(15, 25, 13, 29, '#6a2a22');
      g.line(17, 25, 19, 29, '#6a2a22');
      break;
    }
    case 'bell': {
      // 錆びた鈴
      g.ellipse(16, 17, 8, 8, '#7a4a2a');
      g.rect(8, 17, 17, 6, '#7a4a2a');
      g.rect(7, 22, 19, 2, '#4a2a1a');
      g.ellipse(16, 23, 2, 2, gem);
      g.rect(15, 6, 3, 4, '#4a2a1a');
      g.line(12, 12, 11, 19, '#9a6a42');
      break;
    }
    case 'mirror': {
      // 割れた鏡の欠片
      g.line(10, 6, 23, 9, '#9aa4ac');
      for (let y = 6; y <= 27; y++) {
        const x0 = 10 + Math.round((y - 6) * 0.2);
        const x1 = 23 - Math.round((y - 6) * 0.55);
        g.rect(x0, y, Math.max(1, x1 - x0), 1, y % 5 === 0 ? '#c8d4dc' : '#5a6a76');
      }
      g.line(12, 10, 18, 22, '#e8f0f4');
      g.set(14, 13, gem);
      break;
    }
    case 'badge': {
      // 褪せた徽章。盾形に印
      g.rect(9, 7, 15, 12, goldDark);
      g.ellipse(16, 19, 7.5, 8, goldDark);
      g.rect(10, 8, 13, 10, gold);
      g.ellipse(16, 19, 6, 6.5, gold);
      g.ellipse(16, 15, 3, 3, gem);
      g.line(10, 8, 22, 8, '#d8c08a');
      break;
    }
    case 'talisman': {
      // 護符。札に印
      g.rect(10, 6, 12, 20, '#c8bca0');
      g.rect(10, 6, 12, 2, '#8a7e66');
      g.line(16, 10, 16, 22, gem);
      g.line(12, 14, 20, 14, gem);
      g.line(13, 19, 19, 19, gem);
      g.line(16, 26, 16, 29, '#6a2a22');
      break;
    }
  }
}

/** アーティファクト。眼を持つ古い遺物 */
function artifactIcon(g: PixelGrid): void {
  g.rect(9, 20, 14, 8, '#4a3e30');
  g.rect(11, 18, 10, 2, '#6a5a44');
  g.ellipse(16, 12, 7, 8, '#6a5a44');
  g.ellipse(16, 12, 5, 4, '#1a1210');
  g.ellipse(16, 12, 2.5, 2.5, '#c8a24a');
  g.set(16, 12, '#140f0c');
  g.set(12, 6, '#8a7a5e');
  g.line(10, 24, 22, 24, '#2a221a');
  g.set(9, 4, '#c8a24a');
  g.set(23, 6, '#c8a24a');
  g.set(25, 15, '#c8a24a');
}

/** 1つの装備の印 */
export function drawItemIcon(item: Item): PixelGrid {
  const g = new PixelGrid(ITEM_ICON_SIZE, ITEM_ICON_SIZE);
  if (item.weaponType) {
    const w = drawWeapon(item.weaponType, item.element ?? 'slash');
    if (w) {
      // 握りを左下、先を右上へ斜めに置く。升ごとに元の絵を引いて、にじませずに回す
      const scale = 1.3;
      const cos = Math.SQRT1_2;
      for (let y = 0; y < ITEM_ICON_SIZE; y++) for (let x = 0; x < ITEM_ICON_SIZE; x++) {
        const dx = (x + 0.5 - ITEM_ICON_SIZE / 2) / scale;
        const dy = (y + 0.5 - ITEM_ICON_SIZE / 2) / scale;
        const sx = Math.floor(dx * cos - dy * cos + w.width / 2);
        const sy = Math.floor(dx * cos + dy * cos + w.height / 2);
        const c = w.get(sx, sy);
        if (c) g.set(x, y, c);
      }
      return g;
    }
    // 素手は拳の形
    armorIcon(g, 'hands', ['#8a6a50', '#a88a6a', '#5a4230']);
  } else if (item.shieldType) {
    const s = drawShield(item.shieldType, item.element);
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const c = s.get(x, y);
      if (c) g.rect(x * 2, y * 2, 2, 2, c);
    }
    return g;
  } else if (item.artifact) {
    artifactIcon(g);
  } else if (item.kind === 'armor') {
    armorIcon(g, item.slot ?? 'body', item.material ? MATERIAL_COLORS[item.material] : NO_MATERIAL);
  } else {
    accessoryIcon(g, accessoryShape(item.name), hash(item.id));
  }
  g.outline('#140f0c');
  return g;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 同じ見た目になる装備は同じ鍵 */
function iconKey(item: Item): string {
  if (item.weaponType) return `w:${item.weaponType}:${item.element ?? ''}`;
  if (item.shieldType) return `s:${item.shieldType}:${item.element ?? ''}`;
  if (item.artifact) return 'artifact';
  if (item.kind === 'armor') return `a:${item.slot}:${item.material ?? ''}`;
  return `acc:${accessoryShape(item.name)}:${hash(item.id) % 4}`;
}

const urls = new Map<string, string>();

/** 装備の印の画像(data URL)。同じ見た目のものは使い回す */
export function itemIconUrl(item: Item): string {
  const key = iconKey(item);
  let url = urls.get(key);
  if (url) return url;
  const g = drawItemIcon(item);
  const canvas = document.createElement('canvas');
  canvas.width = g.width;
  canvas.height = g.height;
  g.paint(canvas.getContext('2d')!, 0, 0);
  url = canvas.toDataURL();
  urls.set(key, url);
  return url;
}
