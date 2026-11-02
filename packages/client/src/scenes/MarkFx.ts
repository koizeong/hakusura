import Phaser from 'phaser';
import { MARKS, MARK_IDS, type CombatEvent, type CombatWorld, type DamageRecord, type MarkId, type Unit } from '@hakusura/core';
import { sfxMarkFlow, sfxMarkGain, sfxMarkLost, sfxMarkReady, sfxMarkSpend, sfxRelease } from '../audio/sfx';

/** 印の演出の決まり */
const FX = {
  /** 同時に飛ばす粒の上限(重くならないように) */
  maxParticles: 60,
  /** 1つの出来事で飛ばす粒の上限 */
  perEvent: 8,
  /** この数以上の印を一度に使う技は「放つ」演出にする */
  releaseAt: 15,
  /** 印の巡り:印が変わる・使うが、この間あかずに続くと数える(ミリ秒) */
  lapGap: 2500,
} as const;

type MarksEvent = Extract<CombatEvent, { type: 'marks' }>;

const color = (mark: MarkId) => MARKS[mark].color;
const css = (mark: MarkId) => `#${MARKS[mark].color.toString(16).padStart(6, '0')}`;

/**
 * 印を目に見える物にする。
 * - 溜まった印は、キャラの周りを印の色の粒として回る(多いほど粒が増え、速く、明るく)
 * - 得る・変わる・使う・こぼれるを、粒の飛ぶ向きで見せる
 * - 重い印の技は、当たる瞬間に時を止め、揺らし、名前を大きく出す
 * - 印が変わる・使うが途切れず続くと「印の巡り」として数える
 */
export class MarkFx {
  private orbit: Phaser.GameObjects.Graphics;
  private particles = 0;
  /** 足りた印(印の技の印)。足りた瞬間に知らせる */
  private wasReady = new Set<MarkId>();
  /** 放つ技。印を使った瞬間に覚え、その技が当たったら演出する */
  private pending: { name: string; mark: MarkId; spent: number; until: number }[] = [];
  private lap = { count: 0, lastAt: -Infinity };
  private spin = 0;

  constructor(
    private scene: Phaser.Scene,
    private font: string,
    private hooks: { hitstop(ms: number): void; onLap(count: number): void },
  ) {
    this.orbit = scene.add.graphics().setDepth(34);
  }

  /** 毎フレーム。周りを回る粒と、足りた知らせ */
  draw(world: CombatWorld, player: Unit, dt: number): void {
    const g = this.orbit.clear();
    const held = MARK_IDS.map((m) => [m, world.marksOf(player, m)] as const).filter(([, n]) => n > 0);
    const total = held.reduce((s, [, n]) => s + n, 0);
    // 多く溜まるほど速く回る
    this.spin += (dt / 1000) * (1.1 + Math.log10(1 + total) * 0.9);
    const ready = this.readyMarks(world, player);
    held.forEach(([mark, n], ring) => {
      const count = Math.min(16, 1 + Math.floor(Math.log2(n) * 2.2));
      const radius = 24 + ring * 6;
      const size = 2.2 + Math.log10(1 + n) * 1.1;
      const dir = ring % 2 === 0 ? 1 : -1;
      const alpha = Math.min(1, 0.45 + Math.log10(1 + n) * 0.25);
      for (let i = 0; i < count; i++) {
        const a = this.spin * dir * (1 + ring * 0.15) + (i / count) * Math.PI * 2;
        const x = player.x + Math.cos(a) * radius;
        const y = player.y - 6 + Math.sin(a) * radius * 0.45;
        g.fillStyle(color(mark), alpha).fillCircle(x, y, size);
      }
      // 印の技に足りていれば、輪が脈打つ
      if (ready.has(mark)) {
        const pulse = 0.35 + Math.sin(this.scene.time.now / 120) * 0.25;
        g.lineStyle(2, color(mark), pulse).strokeEllipse(player.x, player.y - 6, radius * 2 + 6, radius * 0.9 + 4);
      }
    });
    for (const mark of ready) {
      if (this.wasReady.has(mark)) continue;
      this.flashRing(player, mark);
      sfxMarkReady();
    }
    this.wasReady = ready;
    this.pending = this.pending.filter((p) => p.until > this.scene.time.now);
  }

  /** 作戦に入っている技のうち、重い印の技(15以上)に足りている印 */
  private readyMarks(world: CombatWorld, player: Unit): Set<MarkId> {
    const out = new Set<MarkId>();
    for (const id of player.actives) {
      const cost = world.markCostOf(player, id);
      if (cost && cost.amount >= FX.releaseAt && world.marksOf(player, cost.mark) >= cost.amount) out.add(cost.mark);
    }
    return out;
  }

  /** 印の出来事 */
  onMarks(event: MarksEvent, world: CombatWorld, player: Unit): void {
    if (event.unitId !== player.id) return;
    const now = this.scene.time.now;
    if (event.spent) {
      // 使った:粒が相手へ流れ込む。重い技なら、当たる瞬間を待つ
      const target = event.targetId ? world.units.get(event.targetId) : undefined;
      this.burst(player, target ?? player, event.mark, Math.min(FX.perEvent, 2 + Math.floor(Math.log2(event.spent))), 260);
      const weight = Math.min(1, Math.log10(event.spent) / 3);
      sfxMarkSpend(weight);
      if (event.spent >= FX.releaseAt && event.label) {
        this.pending.push({ name: event.label, mark: event.mark, spent: event.spent, until: now + 3000 });
        this.charge(player, event.mark, weight);
      }
      this.countLap(now);
      return;
    }
    if (event.lost) {
      // こぼれた・消えた:粒が外へ散る
      this.scatter(player, event.mark, Math.min(FX.perEvent, 2 + Math.floor(Math.log2(event.lost))));
      if (event.cause === 'hurt') sfxMarkLost();
      return;
    }
    if (!event.gained) return;
    if (event.from) {
      // 変わった:元の印の色から、得た印の色へ
      this.flowBetween(player, event.from, event.mark);
      sfxMarkFlow();
      this.countLap(now);
      return;
    }
    // 得た:当てた相手から粒が戻ってくる
    const source = event.sourceId ? world.units.get(event.sourceId) : undefined;
    this.burst(source ?? player, player, event.mark, Math.min(FX.perEvent, event.gained), 320, !source);
    sfxMarkGain(Math.min(1, Math.log10(1 + event.count) / 3));
  }

  /** 与ダメージ。重い印の技が当たった瞬間なら、放つ演出 */
  onDamage(record: DamageRecord, world: CombatWorld): void {
    if (record.depth > 0) return;
    const i = this.pending.findIndex((p) => record.skill === p.name || record.skill.endsWith(`の${p.name}`));
    if (i < 0) return;
    const p = this.pending[i]!;
    this.pending.splice(i, 1);
    const weight = Math.min(1, Math.log10(p.spent) / 3);
    const target = world.units.get(record.targetId);
    this.hooks.hitstop(60 + weight * 140);
    const cam = this.scene.cameras.main;
    cam.shake(160 + weight * 260, 0.006 + weight * 0.016);
    const rgb = Phaser.Display.Color.IntegerToRGB(color(p.mark));
    cam.flash(90 + weight * 120, rgb.r, rgb.g, rgb.b);
    sfxRelease(weight);
    if (target) this.shockwave(target, p.mark, weight);
    // 名前を大きく
    const x = (target?.x ?? cam.midPoint.x) as number;
    const y = (target?.y ?? cam.midPoint.y) - 70;
    const text = this.scene.add
      .text(x, y, `${p.name}  ${MARKS[p.mark].name}${p.spent}`, {
        fontFamily: this.font,
        fontSize: `${Math.round(24 + weight * 16)}px`,
        fontStyle: 'bold',
        color: css(p.mark),
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(46)
      .setScale(1.6);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: text, y: y - 30, alpha: 0, delay: 650, duration: 600, onComplete: () => text.destroy() });
  }

  private countLap(now: number): void {
    this.lap.count = now - this.lap.lastAt <= FX.lapGap ? this.lap.count + 1 : 1;
    this.lap.lastAt = now;
    if (this.lap.count >= 3) this.hooks.onLap(this.lap.count);
  }

  /** from から to へ粒を飛ばす */
  private burst(from: { x: number; y: number }, to: { x: number; y: number }, mark: MarkId, n: number, duration: number, around = false): void {
    for (let i = 0; i < n && this.particles < FX.maxParticles; i++) {
      const a = Math.random() * Math.PI * 2;
      const sx = from.x + (around ? Math.cos(a) * 40 : Phaser.Math.Between(-8, 8));
      const sy = from.y - 10 + (around ? Math.sin(a) * 20 : Phaser.Math.Between(-8, 8));
      const dot = this.scene.add.circle(sx, sy, 2.4, color(mark), 1).setDepth(36);
      this.particles++;
      // 少し膨らんだ弧を描いて飛ぶ
      const mid = { x: (sx + to.x) / 2 + Phaser.Math.Between(-30, 30), y: (sy + to.y) / 2 - 30 - Math.random() * 20 };
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(sx, sy), new Phaser.Math.Vector2(mid.x, mid.y), new Phaser.Math.Vector2(to.x, to.y - 6));
      const t = { v: 0 };
      this.scene.tweens.add({
        targets: t,
        v: 1,
        delay: i * 25,
        duration,
        ease: 'Sine.easeIn',
        onUpdate: () => {
          const pt = curve.getPoint(t.v);
          dot.setPosition(pt.x, pt.y);
        },
        onComplete: () => {
          dot.destroy();
          this.particles--;
        },
      });
    }
  }

  /** 印が別の印に変わる。元の色の粒が、得た色に染まりながら回る */
  private flowBetween(player: Unit, from: MarkId, to: MarkId): void {
    if (this.particles >= FX.maxParticles) return;
    const dot = this.scene.add.circle(player.x - 20, player.y - 10, 3, color(from), 1).setDepth(36);
    this.particles++;
    const c0 = Phaser.Display.Color.IntegerToColor(color(from));
    const c1 = Phaser.Display.Color.IntegerToColor(color(to));
    const t = { v: 0 };
    const start = Math.random() * Math.PI * 2;
    this.scene.tweens.add({
      targets: t,
      v: 1,
      duration: 380,
      onUpdate: () => {
        const a = start + t.v * Math.PI * 1.5;
        dot.setPosition(player.x + Math.cos(a) * 30, player.y - 8 + Math.sin(a) * 14);
        const mix = Phaser.Display.Color.Interpolate.ColorWithColor(c0, c1, 100, t.v * 100);
        dot.setFillStyle(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b));
        dot.setRadius(3 + Math.sin(t.v * Math.PI) * 2);
      },
      onComplete: () => {
        dot.destroy();
        this.particles--;
      },
    });
  }

  /** 印がこぼれる。外へ散って消える */
  private scatter(player: Unit, mark: MarkId, n: number): void {
    for (let i = 0; i < n && this.particles < FX.maxParticles; i++) {
      const a = Math.random() * Math.PI * 2;
      const dot = this.scene.add.circle(player.x, player.y - 8, 2.4, color(mark), 1).setDepth(36);
      this.particles++;
      this.scene.tweens.add({
        targets: dot,
        x: player.x + Math.cos(a) * (40 + Math.random() * 30),
        y: player.y - 8 + Math.sin(a) * (24 + Math.random() * 16) + 20,
        alpha: 0,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => {
          dot.destroy();
          this.particles--;
        },
      });
    }
  }

  /** 重い技を出す前:周りから粒が集まる */
  private charge(player: Unit, mark: MarkId, weight: number): void {
    const ring = this.scene.add.graphics().setDepth(35);
    const t = { v: 0 };
    this.scene.tweens.add({
      targets: t,
      v: 1,
      duration: 300 + weight * 300,
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(2 + weight * 3, color(mark), 0.8 * (1 - t.v * 0.3));
        ring.strokeEllipse(player.x, player.y - 6, (80 - t.v * 50) * 2, (36 - t.v * 22) * 2);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** 足りた瞬間の輪 */
  private flashRing(player: Unit, mark: MarkId): void {
    const ring = this.scene.add.graphics().setDepth(35);
    ring.lineStyle(3, color(mark), 1).strokeEllipse(0, 0, 60, 26);
    ring.setPosition(player.x, player.y - 6);
    this.scene.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** 放った技の当たった所に広がる輪 */
  private shockwave(at: { x: number; y: number }, mark: MarkId, weight: number): void {
    const ring = this.scene.add.graphics().setDepth(33);
    ring.lineStyle(4 + weight * 6, color(mark), 0.9).strokeCircle(0, 0, 30);
    ring.setPosition(at.x, at.y);
    this.scene.tweens.add({ targets: ring, scale: 3 + weight * 4, alpha: 0, duration: 420 + weight * 300, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }
}
