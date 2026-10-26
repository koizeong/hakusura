import { ELEMENTS, type ElementId, type ShieldTypeId, type WeaponTypeId } from '@hakusura/core';
import { PixelGrid } from './pixel';

/**
 * 武器と盾のドット絵。体とは別の絵で、手の位置に重ねて狙う向きへ回す。
 * 武器は右を向けて描き、握りが (GRIP.x, GRIP.y) に来る。盾は正面から見た形
 */
export const WEAPON_SIZE = { w: 32, h: 16 } as const;
export const GRIP = { x: 3, y: 8 } as const;
export const SHIELD_SIZE = 16;

const C = {
  outline: '#140f0c',
  steel: '#8a8c88',
  steelLight: '#b8b8b0',
  steelDark: '#4a4c4a',
  rust: '#7a4a2a',
  rustDark: '#4a2a1a',
  wood: '#5a3e26',
  woodDark: '#3a2616',
  bone: '#c8bca0',
  boneDark: '#8a7e66',
  leather: '#3a2618',
  cloth: '#6a2a22',
  iron: '#2e2e2c',
  string: '#d8d0b8',
} as const;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** 刃の縁や宝玉に差す、属性の色。斬・打・刺は鋼のまま */
function edgeColor(element: ElementId): string | undefined {
  const def = ELEMENTS[element] as { color: number; tags: readonly string[] };
  return def.tags.includes('physical') ? undefined : hex(def.color);
}

/** 1本の武器の絵。素手なら undefined */
export function drawWeapon(type: WeaponTypeId, element: ElementId): PixelGrid | undefined {
  const g = new PixelGrid(WEAPON_SIZE.w, WEAPON_SIZE.h);
  const edge = edgeColor(element);
  const y = GRIP.y;
  switch (type) {
    case 'fists':
      return undefined;
    case 'ironSword': {
      g.rect(1, y - 1, 4, 2, C.leather);
      g.rect(5, y - 3, 1, 6, C.steelDark);
      g.rect(6, y - 1, 12, 1, edge ?? C.steelLight);
      g.rect(6, y, 12, 1, C.steel);
      g.rect(18, y - 1, 1, 1, C.steel);
      g.set(19, y - 1, C.steelLight);
      break;
    }
    case 'rustGreatsword': {
      g.rect(0, y - 1, 5, 2, C.leather);
      g.rect(5, y - 4, 2, 8, C.rustDark);
      g.rect(7, y - 2, 18, 1, edge ?? C.steel);
      g.rect(7, y - 1, 18, 2, C.rust);
      g.rect(7, y + 1, 17, 1, C.rustDark);
      g.rect(25, y - 1, 2, 2, C.rust);
      g.set(27, y - 1, C.steel);
      // 錆の斑
      for (const x of [10, 14, 19, 22]) g.set(x, y, C.rustDark);
      break;
    }
    case 'boneFlail': {
      g.rect(0, y - 1, 8, 2, C.bone);
      g.rect(0, y - 1, 2, 2, C.leather);
      for (let x = 9; x <= 15; x += 2) g.set(x, y, C.steelDark);
      g.ellipse(19, y, 3, 3, C.bone);
      g.set(18, y - 1, C.boneDark);
      g.set(20, y + 1, C.boneDark);
      for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-3, -3], [3, 3]] as const) g.set(19 + dx, y + dy, edge ?? C.boneDark);
      break;
    }
    case 'cinderAxe': {
      g.rect(0, y, 18, 1, C.wood);
      g.rect(0, y + 1, 18, 1, C.woodDark);
      // 斧頭。三日月の刃が先へ張り出す
      g.rect(14, y - 3, 3, 4, C.steelDark);
      for (let i = -7; i <= 3; i++) {
        const bx = 17 + Math.round(3 * Math.sin((Math.PI * (i + 7)) / 10));
        g.rect(17, y + i, bx - 16, 1, C.steel);
        g.set(bx, y + i, edge ?? C.steelLight);
      }
      break;
    }
    case 'stormSpear': {
      g.rect(0, y, 24, 1, C.wood);
      g.rect(0, y + 1, 24, 1, C.woodDark);
      g.rect(21, y - 1, 1, 3, C.cloth);
      // 木の葉の穂先
      g.rect(24, y - 1, 4, 3, C.steel);
      g.rect(28, y, 2, 1, C.steel);
      g.rect(24, y - 1, 4, 1, edge ?? C.steelLight);
      g.set(30, y, C.steelLight);
      break;
    }
    case 'capGun': {
      g.rect(1, y, 3, 4, C.wood);
      g.rect(2, y + 3, 2, 1, C.woodDark);
      g.rect(3, y - 2, 9, 3, C.iron);
      g.rect(12, y - 2, 6, 2, C.steelDark);
      g.set(4, y - 3, C.steelDark);
      g.set(17, y - 2, edge ?? C.steel);
      break;
    }
    case 'emberSling': {
      g.line(0, y, 7, y + 2, C.leather);
      g.line(7, y + 2, 12, y, C.leather);
      g.ellipse(14, y, 2.5, 2.5, C.leather);
      g.rect(13, y - 1, 3, 2, edge ?? C.steelDark);
      break;
    }
    case 'boneBow': {
      // 弓は縦に描く。弦と番えた矢
      for (let i = -6; i <= 6; i++) g.set(8 - Math.round((i * i) / 9), y + i, C.bone);
      g.set(4, y - 6, C.boneDark);
      g.set(4, y + 6, C.boneDark);
      g.line(4, y - 6, 4, y + 6, C.string);
      g.rect(2, y, 16, 1, C.wood);
      g.rect(18, y - 1, 2, 3, edge ?? C.steel);
      g.set(20, y, C.steel);
      break;
    }
    case 'dagger': {
      g.rect(1, y - 1, 3, 2, C.leather);
      g.rect(4, y - 2, 1, 4, C.steelDark);
      g.rect(5, y - 1, 6, 1, edge ?? C.steelLight);
      g.rect(5, y, 6, 1, C.steel);
      g.set(11, y, C.steel);
      break;
    }
    case 'warHammer': {
      g.rect(0, y, 18, 1, C.wood);
      g.rect(0, y + 1, 18, 1, C.woodDark);
      g.rect(16, y - 4, 6, 9, C.iron);
      g.rect(17, y - 4, 4, 1, C.steelDark);
      g.rect(22, y - 3, 1, 7, edge ?? C.steel);
      g.rect(15, y - 1, 1, 3, C.steelDark);
      break;
    }
    case 'staff': {
      // 節くれた杖と、先の宝玉
      g.rect(0, y, 20, 1, C.wood);
      g.rect(0, y + 1, 20, 1, C.woodDark);
      for (const x of [5, 11, 16]) g.set(x, y - 1, C.woodDark);
      g.line(20, y, 23, y - 3, C.wood);
      g.line(20, y + 1, 25, y - 1, C.woodDark);
      g.ellipse(25, y - 4, 2.2, 2.2, edge ?? C.steelLight);
      g.set(24, y - 5, '#f2ead8');
      break;
    }
  }
  g.outline(C.outline);
  return g;
}

/** 盾の絵(正面)。属性つきなら真ん中の印がその色 */
export function drawShield(type: ShieldTypeId, element?: ElementId): PixelGrid {
  const g = new PixelGrid(SHIELD_SIZE, SHIELD_SIZE);
  const mark = element ? hex((ELEMENTS[element] as { color: number }).color) : undefined;
  const c = 7.5;
  switch (type) {
    case 'woodShield':
      g.ellipse(c, c, 6.5, 6.5, C.wood);
      for (const x of [4, 8, 11]) g.line(x, 2, x, 13, C.woodDark);
      g.ellipse(c, c, 2, 2, mark ?? C.iron);
      for (let a = 0; a < 16; a++) g.set(c + Math.cos((a / 16) * Math.PI * 2) * 6.5, c + Math.sin((a / 16) * Math.PI * 2) * 6.5, C.iron);
      break;
    case 'towerShield':
      g.rect(2, 0, 12, 16, C.iron);
      g.rect(3, 1, 10, 14, C.steelDark);
      g.rect(7, 2, 2, 12, mark ?? C.steel);
      g.rect(4, 7, 8, 2, mark ?? C.steel);
      break;
    case 'prayerBuckler':
      g.ellipse(c, c, 4.5, 4.5, C.steel);
      g.ellipse(c, c, 3.5, 3.5, C.steelDark);
      g.rect(7, 5, 2, 6, mark ?? C.bone);
      g.rect(5, 7, 6, 2, mark ?? C.bone);
      break;
    case 'thornShield':
      g.ellipse(c, c, 5.5, 5.5, C.rust);
      g.ellipse(c, c, 2, 2, mark ?? C.rustDark);
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        g.line(c + Math.cos(t) * 5, c + Math.sin(t) * 5, c + Math.cos(t) * 7.5, c + Math.sin(t) * 7.5, C.steelDark);
      }
      break;
  }
  g.outline(C.outline);
  return g;
}
