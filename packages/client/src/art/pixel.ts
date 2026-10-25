/**
 * ドット絵を描く小さな道具。1枚の絵は size×size の升目で、升目ごとに色(なければ透明)を持つ。
 * 塗り終わったら、外側に1マスの暗い縁取りを自動で付ける
 */
export class PixelGrid {
  readonly cells: (string | null)[];

  constructor(readonly size: number) {
    this.cells = new Array(size * size).fill(null);
  }

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.cells[y * this.size + x] = color;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    return this.cells[y * this.size + x]!;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  /** 横の線を左右対称に引く(中心は size/2 と size/2-1 の間) */
  mirrorRow(y: number, x0: number, x1: number, color: string): void {
    for (let x = x0; x <= x1; x++) {
      this.set(x, y, color);
      this.set(this.size - 1 - x, y, color);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, color);
      }
    }
  }

  /** 塗った所の外側に縁取りを付ける。skip の色(影など)は縁取りしない */
  outline(color: string, skip: readonly string[] = []): void {
    const filled = (x: number, y: number) => {
      const c = this.get(x, y);
      return c !== null && !skip.includes(c) && c !== color;
    };
    const marks: [number, number][] = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const c = this.get(x, y);
        if (c !== null && !skip.includes(c)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.set(x, y, color);
  }

  /** 横に裏返す(右向きを左向きにするなど) */
  flipped(): PixelGrid {
    const out = new PixelGrid(this.size);
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const c = this.get(x, y);
      if (c) out.set(this.size - 1 - x, y, c);
    }
    return out;
  }

  /** 画布の (ox, oy) に scale 倍で描く */
  paint(ctx: CanvasRenderingContext2D, ox: number, oy: number, scale = 1): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }
}
