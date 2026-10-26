import { ELEMENTS, type ElementId } from '@hakusura/core';
import { PixelGrid } from './pixel';

/**
 * 弾のドット絵。右へ飛ぶ向きで描き、飛ぶ向きへ回す。
 * 味方の弾は属性ごとの形(物理は矢と礫、火は炎、雷は火花、ほかは魔弾)。
 * 敵の弾は弾幕の中で見分けられるよう、形を丸に揃えて赤い縁と白い芯を付ける
 */
export const PROJECTILE_SIZE = { w: 14, h: 10 } as const;
/** 絵の中で弾の芯がある所。ここを弾の位置に合わせる */
export const PROJECTILE_CORE = { x: 9, y: 5 } as const;
/** 芯の半径(升)。当たりの半径に合わせて拡大する */
export const PROJECTILE_CORE_RADIUS = 2.5;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** 色を明るく(t>0)または暗く(t<0)する */
function shade(color: number, t: number): string {
  const ch = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((c) => Math.round(t > 0 ? c + (255 - c) * t : c * (1 + t)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function drawProjectile(element: ElementId, hostile: boolean): PixelGrid {
  const g = new PixelGrid(PROJECTILE_SIZE.w, PROJECTILE_SIZE.h);
  const color = (ELEMENTS[element] as { color: number }).color;
  const base = hex(color);
  const light = shade(color, 0.55);
  const dark = shade(color, -0.45);
  const { x, y } = PROJECTILE_CORE;
  if (hostile) {
    // 尾を引く丸い弾。縁は赤、芯は白
    g.rect(x - 6, y, 3, 1, dark);
    g.rect(x - 4, y - 1, 2, 3, dark);
    g.ellipse(x, y, 3, 3, base);
    g.ellipse(x, y, 1.6, 1.6, '#fff2e0');
    g.outline('#c23a2c');
    return g;
  }
  switch (element) {
    case 'slash':
    case 'pierce': {
      // 矢。羽根と鏃
      g.rect(1, y, 9, 1, '#5a3e26');
      g.set(1, y - 1, '#c8bca0');
      g.set(2, y - 1, '#c8bca0');
      g.set(1, y + 1, '#c8bca0');
      g.set(2, y + 1, '#c8bca0');
      g.rect(x, y - 1, 2, 3, base);
      g.set(x + 2, y, light);
      break;
    }
    case 'blunt': {
      // 礫。尾に土埃
      g.set(x - 4, y, dark);
      g.set(x - 6, y + 1, dark);
      g.ellipse(x, y, 2.5, 2.2, base);
      g.set(x - 1, y - 1, light);
      break;
    }
    case 'fire': {
      // 炎のしずく。後ろへ揺らぐ尾
      g.rect(x - 6, y, 3, 1, dark);
      g.line(x - 5, y - 2, x - 2, y - 1, dark);
      g.line(x - 5, y + 2, x - 2, y + 1, base);
      g.ellipse(x - 1, y, 3, 2.2, base);
      g.ellipse(x, y, 2.4, 2.4, base);
      g.ellipse(x + 0.5, y, 1.3, 1.3, '#ffe6a0');
      break;
    }
    case 'lightning': {
      // 火花。折れ曲がった尾と、白く光る芯
      g.line(x - 7, y - 1, x - 5, y + 1, dark);
      g.line(x - 5, y + 1, x - 3, y - 1, base);
      g.line(x - 3, y - 1, x - 1, y, base);
      g.ellipse(x, y, 2, 2, base);
      g.set(x, y, '#ffffff');
      g.set(x + 1, y, '#ffffff');
      g.set(x, y - 3, light);
      g.set(x + 2, y + 3, light);
      break;
    }
    default: {
      // 魔弾。光の輪と、暗い尾
      g.rect(x - 6, y, 3, 1, dark);
      g.rect(x - 4, y - 1, 2, 3, dark);
      g.ellipse(x, y, 2.6, 2.6, base);
      g.ellipse(x - 0.5, y - 0.5, 1.2, 1.2, light);
      break;
    }
  }
  g.outline('#140f0c');
  return g;
}
