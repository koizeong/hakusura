import Phaser from 'phaser';
import { FRAME, SHEET_LAYOUT, buildPilgrimSheet } from './pilgrim';

export * from './pilgrim';

/**
 * 手で描いた PNG があれば、生成した絵の代わりに使う。
 * public/art/pilgrim.png を SHEET_LAYOUT の並び(1コマ32×32、10列×3行)で置く
 */
const overrides = import.meta.glob('../../public/art/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const PILGRIM_ART_URL = Object.entries(overrides).find(([path]) => path.endsWith('/pilgrim.png'))?.[1];

/** 自キャラの絵を読み込む(あれば)。preload で呼ぶ */
export function preloadPilgrim(scene: Phaser.Scene): void {
  if (PILGRIM_ART_URL) scene.load.image('pilgrim-art', PILGRIM_ART_URL);
}

/** 自キャラの絵を 'pilgrim' の名前で用意する。コマは左上から行ごとに 0, 1, 2… と数える */
export function createPilgrimTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('pilgrim')) return;
  const source = scene.textures.exists('pilgrim-art')
    ? (scene.textures.get('pilgrim-art').getSourceImage() as HTMLImageElement)
    : buildPilgrimSheet();
  const tex = source instanceof HTMLCanvasElement ? scene.textures.addCanvas('pilgrim', source)! : scene.textures.addImage('pilgrim', source)!;
  const cols = SHEET_LAYOUT.columns.length;
  for (let row = 0; row < SHEET_LAYOUT.rows.length; row++) {
    for (let col = 0; col < cols; col++) tex.add(row * cols + col, 0, col * FRAME, row * FRAME, FRAME, FRAME);
  }
  // ドット絵は拡大してもにじまないようにする
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
