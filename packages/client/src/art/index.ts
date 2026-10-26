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

export * from './weapons';
import { drawShield, drawWeapon } from './weapons';
import type { ElementId, ShieldTypeId, WeaponTypeId } from '@hakusura/core';

/** 武器の絵を用意して名前を返す。形と属性の組ごとに、初めて要るときに作る。素手なら undefined */
export function weaponTexture(scene: Phaser.Scene, type: WeaponTypeId, element: ElementId): string | undefined {
  const key = `weapon:${type}:${element}`;
  if (scene.textures.exists(key)) return key;
  const g = drawWeapon(type, element);
  if (!g) return undefined;
  return paintTexture(scene, key, g);
}

/** 盾の絵を用意して名前を返す */
export function shieldTexture(scene: Phaser.Scene, type: ShieldTypeId, element?: ElementId): string {
  const key = `shield:${type}:${element ?? 'none'}`;
  if (scene.textures.exists(key)) return key;
  return paintTexture(scene, key, drawShield(type, element));
}

function paintTexture(scene: Phaser.Scene, key: string, g: { width: number; height: number; paint(ctx: CanvasRenderingContext2D, x: number, y: number): void }): string {
  const canvas = document.createElement('canvas');
  canvas.width = g.width;
  canvas.height = g.height;
  g.paint(canvas.getContext('2d')!, 0, 0);
  scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export * from './enemies';
import { ENEMY_FRAMES, buildEnemySheet, enemyArtSize } from './enemies';
import type { EnemyId } from '@hakusura/core';

/** 敵の絵を用意して名前を返す。コマは 0 から ENEMY_FRAMES の順 */
export function enemyTexture(scene: Phaser.Scene, id: EnemyId | 'scarecrow'): string {
  const key = `enemy:${id}`;
  if (scene.textures.exists(key)) return key;
  const size = enemyArtSize(id);
  const tex = scene.textures.addCanvas(key, buildEnemySheet(id))!;
  ENEMY_FRAMES.forEach((_, i) => tex.add(i, 0, i * size, 0, size, size));
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export * from './ground';
import { FLOOR_RADIUS_STEP, buildGround, drawFloor } from './ground';
import type { FieldId } from '@hakusura/core';

/** 戦場の地面を 'ground' の名前で用意する。width×height は升の数 */
export function groundTexture(scene: Phaser.Scene, width: number, height: number): string {
  const key = 'ground';
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, buildGround(width, height))!.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** 床の絵を用意して名前を返す。半径(升)は刻みに丸め、刻みごとに3通りの形を使い回す */
export function floorTexture(scene: Phaser.Scene, field: FieldId, radius: number, variant: number): string {
  const r = Math.max(FLOOR_RADIUS_STEP, Math.round(radius / FLOOR_RADIUS_STEP) * FLOOR_RADIUS_STEP);
  const v = variant % 3;
  const key = field === 'corpse' ? 'floor:corpse' : `floor:${field}:${r}:${v}`;
  if (scene.textures.exists(key)) return key;
  return paintTexture(scene, key, drawFloor(field, r, v + 1));
}

export * from './projectiles';
import { drawProjectile } from './projectiles';

/** 弾の絵を用意して名前を返す。敵の弾は別の絵 */
export function projectileTexture(scene: Phaser.Scene, element: ElementId, hostile: boolean): string {
  const key = `proj:${element}:${hostile ? 'foe' : 'ally'}`;
  if (scene.textures.exists(key)) return key;
  return paintTexture(scene, key, drawProjectile(element, hostile));
}
