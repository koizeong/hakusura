import Phaser from 'phaser';
import {
  ACTIVE_SKILLS,
  CombatWorld,
  ELEMENTS,
  FIELDS,
  STATUSES,
  STATUS_IDS,
  dealtBy,
  summarize,
  type ActiveSkillId,
  type CombatEvent,
  type FieldId,
  type Unit,
} from '@hakusura/core';
import { InputController } from '../input/InputController';
import { ACTIVE_SLOT_ACTIONS, loadKeybinds, type Keybinds } from '../input/keybinds';
import { BreakdownView } from '../ui/BreakdownView';
import { Hud } from '../ui/Hud';
import { createTrainingPanel } from '../ui/TrainingPanel';

const ARENA = { width: 1600, height: 1000 };
const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const MOVE_SPEED = 230;
const DODGE = { speed: 900, duration: 170, invulnerable: 260, cooldown: 700 };

/** アクティブ1〜6に入れるスキル */
const SLOT_SKILLS: readonly (ActiveSkillId | null)[] = ['rustGreatsword', 'thunderGun', 'emberOil', null, null, null];

/** 案山子の配置。感電が飛び移れるよう寄せて立てる */
const SCARECROW_SPOTS = [
  { x: 1050, y: 500 },
  { x: 1140, y: 430 },
  { x: 1140, y: 570 },
  { x: 1230, y: 500 },
  { x: 1010, y: 640 },
];

/** 床の状態を敷く場所 */
const FLOOR_SPOTS: Record<FieldId, { x: number; y: number; radius: number }[]> = {
  rain: [],
  oilPool: [
    { x: 1120, y: 510, radius: 170 },
    { x: 700, y: 500, radius: 70 },
  ],
};

interface Dodge {
  vx: number;
  vy: number;
  until: number;
}

/** 試し斬り場。案山子と、天候・床・状態・耐性を切り替える支度がある */
export class TrainingGroundScene extends Phaser.Scene {
  private world!: CombatWorld;
  private player!: Unit;
  private scarecrows: Unit[] = [];
  private homes = new Map<string, { x: number; y: number; phase: number }>();
  private input2!: InputController;
  private keybinds!: Keybinds;
  private gfx!: Phaser.GameObjects.Graphics;
  private rainGfx!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private breakdown!: BreakdownView;
  private walking = false;
  private dodge: Dodge | null = null;
  private dodgeReadyAt = 0;
  private lastBreakdown = 0;
  private facing = 0;
  private numberStack = new Map<string, number>();

  constructor() {
    super('TrainingGround');
  }

  create(): void {
    this.world = new CombatWorld();
    this.player = this.world.addUnit({
      id: 'player',
      name: '巡礼者',
      team: 'player',
      x: 560,
      y: 500,
      radius: 16,
      maxHp: 300,
      passives: ['sootPrayer', 'bloodCallsThunder'],
      conditions: ['twinStrikeOnBurning', 'shiftingElement', 'rainSoaked'],
    });
    SCARECROW_SPOTS.forEach((spot, i) => {
      const unit = this.world.addUnit({ id: `scarecrow${i}`, name: '案山子', team: 'enemy', x: spot.x, y: spot.y, radius: 20, maxHp: 1e9 });
      this.scarecrows.push(unit);
      this.homes.set(unit.id, { ...spot, phase: i * 1.3 });
    });

    this.gfx = this.add.graphics();
    this.rainGfx = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.keybinds = loadKeybinds();
    this.input2 = new InputController(this.keybinds, this.game.canvas);
    this.hud = new Hud(SLOT_SKILLS, DODGE.cooldown);
    this.hud.setKeybinds(this.keybinds);
    this.breakdown = new BreakdownView();

    const scene = this;
    const host = {
      world: this.world,
      player: this.player,
      scarecrows: this.scarecrows,
      input: this.input2,
      keybinds: this.keybinds,
      get walking() {
        return scene.walking;
      },
      set walking(v: boolean) {
        scene.walking = v;
      },
      setFloor: (field: FieldId, on: boolean) => this.setFloor(field, on),
      resetMeasure: () => this.world.resetLog(),
    };
    const panel = createTrainingPanel(host);
    // キー設定が変わったら枠の表示も変える
    panel.addEventListener('click', () => setTimeout(() => this.hud.setKeybinds(this.keybinds), 50));
    panel.addEventListener('mousedown', () => setTimeout(() => this.hud.setKeybinds(this.keybinds), 50));
    window.addEventListener('keydown', () => setTimeout(() => this.hud.setKeybinds(this.keybinds), 50));

    const ui = document.getElementById('ui')!;
    ui.replaceChildren(panel, this.hud.el, this.breakdown.el);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ui.replaceChildren());
  }

  private setFloor(field: FieldId, on: boolean): void {
    this.world.floors = this.world.floors.filter((f) => f.field !== field);
    if (on) for (const spot of FLOOR_SPOTS[field]) this.world.addFloor(field, spot.x, spot.y, spot.radius);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    const world = this.world;
    const input = this.input2;
    const aim = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.facing = Math.atan2(aim.y - this.player.y, aim.x - this.player.x);

    // 移動と回避
    let mx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    let my = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    if (input.consumePressed('dodge') && world.time >= this.dodgeReadyAt) {
      const dir = len > 0 ? { x: mx, y: my } : { x: Math.cos(this.facing), y: Math.sin(this.facing) };
      this.dodge = { vx: dir.x * DODGE.speed, vy: dir.y * DODGE.speed, until: world.time + DODGE.duration };
      this.dodgeReadyAt = world.time + DODGE.cooldown;
      world.setInvulnerable(this.player.id, DODGE.invulnerable);
    }
    let vx = mx * MOVE_SPEED;
    let vy = my * MOVE_SPEED;
    if (this.dodge) {
      if (world.time < this.dodge.until) {
        vx = this.dodge.vx;
        vy = this.dodge.vy;
      } else this.dodge = null;
    }
    const r = this.player.radius;
    let nx = this.player.x + (vx * dt) / 1000;
    let ny = this.player.y + (vy * dt) / 1000;
    // 案山子はすり抜けない
    for (const s of this.scarecrows) {
      const dx = nx - s.x;
      const dy = ny - s.y;
      const d = Math.hypot(dx, dy);
      const min = r + s.radius;
      if (d < min && d > 0.001) {
        nx = s.x + (dx / d) * min;
        ny = s.y + (dy / d) * min;
      }
    }
    world.moveUnit(this.player.id, Phaser.Math.Clamp(nx, r, ARENA.width - r), Phaser.Math.Clamp(ny, r, ARENA.height - r));

    // アクティブスキル。押しっぱなしで撃ち続ける
    ACTIVE_SLOT_ACTIONS.forEach((action, i) => {
      const skill = SLOT_SKILLS[i];
      if (skill && input.isDown(action)) world.useSkill(this.player.id, skill, aim);
    });

    if (input.consumePressed('breakdown')) {
      this.breakdown.toggle();
      this.lastBreakdown = 0;
    }
    input.endFrame();

    // 案山子を歩かせる。出血は動くと効く
    if (this.walking) {
      for (const s of this.scarecrows) {
        const home = this.homes.get(s.id)!;
        world.moveUnit(s.id, home.x + Math.sin(world.time / 900 + home.phase) * 50, home.y + Math.cos(world.time / 1300 + home.phase) * 30);
      }
    }

    world.update(dt);
    for (const event of world.drainEvents()) this.showEvent(event);

    const cam = this.cameras.main;
    cam.scrollX += (this.player.x - cam.width / 2 - cam.scrollX) * 0.12;
    cam.scrollY += (this.player.y - cam.height / 2 - cam.scrollY) * 0.12;

    this.draw();
    this.hud.update(world, this.player, this.dodgeReadyAt);
    if (this.breakdown.visible && world.time - this.lastBreakdown > 250) {
      this.lastBreakdown = world.time;
      this.breakdown.render(summarize(dealtBy(world.log, this.player.id), world.time));
    }
  }

  // ---- 描画 ----

  private draw(): void {
    const g = this.gfx;
    const world = this.world;
    g.clear();

    // 地面
    g.fillStyle(0x1c1a18).fillRect(0, 0, ARENA.width, ARENA.height);
    g.lineStyle(1, 0x26231f, 1);
    for (let x = 0; x <= ARENA.width; x += 80) g.lineBetween(x, 0, x, ARENA.height);
    for (let y = 0; y <= ARENA.height; y += 80) g.lineBetween(0, y, ARENA.width, y);
    g.lineStyle(3, 0x3a2f28, 1).strokeRect(0, 0, ARENA.width, ARENA.height);

    for (const patch of world.floors) {
      g.fillStyle(FIELDS[patch.field].color, 0.85).fillCircle(patch.x, patch.y, patch.radius);
      g.lineStyle(2, 0x56492a, 0.6).strokeCircle(patch.x, patch.y, patch.radius);
    }

    // 案山子
    for (const s of this.scarecrows) {
      g.fillStyle(0x4a3b2c).fillRect(s.x - 3, s.y - 26, 6, 46);
      g.fillRect(s.x - 20, s.y - 14, 40, 5);
      g.fillStyle(0x8a7454).fillCircle(s.x, s.y - 28, 9);
      g.lineStyle(1, 0x2a2018).strokeCircle(s.x, s.y - 28, 9);
      this.drawStatuses(s, s.y + 26);
    }

    // 自分
    const p = this.player;
    const invulnerable = p.invulnerableUntil > world.time;
    g.fillStyle(0xcbbfa8, invulnerable ? 0.35 : 1).fillCircle(p.x, p.y, p.radius);
    g.lineStyle(2, 0x6b2b22, invulnerable ? 0.35 : 1).strokeCircle(p.x, p.y, p.radius);
    if (p.imbue && p.imbue.until > world.time) {
      g.lineStyle(2, ELEMENTS[ACTIVE_SKILLS[p.imbue.skill].element].color, 0.7 + Math.sin(world.time / 80) * 0.3).strokeCircle(p.x, p.y, p.radius + 5);
    }
    const ax = p.x + Math.cos(this.facing) * (p.radius + 14);
    const ay = p.y + Math.sin(this.facing) * (p.radius + 14);
    g.lineStyle(3, 0x9c8f78).lineBetween(p.x + Math.cos(this.facing) * p.radius, p.y + Math.sin(this.facing) * p.radius, ax, ay);
    this.drawStatuses(p, p.y + p.radius + 8);

    for (const proj of world.projectiles) {
      const color = ELEMENTS[proj.element].color;
      g.fillStyle(color, 0.3).fillCircle(proj.x, proj.y, proj.radius * 2.2);
      g.fillStyle(color).fillCircle(proj.x, proj.y, proj.radius);
    }

    this.drawRain();
  }

  /** 状態の蓄積を細い棒、発動中を太い棒で出す */
  private drawStatuses(unit: Unit, top: number): void {
    const g = this.gfx;
    const width = 40;
    let y = top;
    for (const id of STATUS_IDS) {
      const st = unit.statuses[id];
      const def = STATUSES[id];
      const active = this.world.isActive(unit, id);
      if (!active && st.buildup <= 0.5) continue;
      g.fillStyle(0x000000, 0.6).fillRect(unit.x - width / 2, y, width, active ? 5 : 3);
      const ratio = active ? 1 : st.buildup / def.max;
      g.fillStyle(def.color, active ? 1 : 0.7).fillRect(unit.x - width / 2, y, width * ratio, active ? 5 : 3);
      y += active ? 7 : 5;
    }
  }

  private drawRain(): void {
    const g = this.rainGfx;
    g.clear();
    if (this.world.weather !== 'rain') return;
    const { width, height } = this.cameras.main;
    const t = this.world.time;
    g.lineStyle(1, 0x8fa8c0, 0.35);
    for (let i = 0; i < 160; i++) {
      const seed = (i * 9301 + 49297) % 233280;
      const x = ((seed / 233280) * (width + 200) + t * 0.15) % (width + 200) - 100;
      const y = ((i * 37.7 + t * 0.9) % (height + 40)) - 20;
      g.lineBetween(x, y, x - 4, y + 14);
    }
  }

  // ---- 戦闘の出来事 ----

  private showEvent(event: CombatEvent): void {
    switch (event.type) {
      case 'damage': {
        const { record } = event;
        if (record.amount <= 0 && record.depth > 0) return;
        const color = `#${ELEMENTS[record.element].color.toString(16).padStart(6, '0')}`;
        const big = record.emphasized;
        const value = record.amount >= 10 ? Math.round(record.amount).toString() : record.amount.toFixed(1);
        // 同じ相手に続けて出る数字は少しずつずらして重ねない
        const stack = (this.numberStack.get(record.targetId) ?? 0) + 1;
        this.numberStack.set(record.targetId, stack);
        this.time.delayedCall(350, () => this.numberStack.set(record.targetId, Math.max(0, (this.numberStack.get(record.targetId) ?? 1) - 1)));
        const x = event.x + ((stack % 3) - 1) * 26 + Phaser.Math.Between(-6, 6);
        const y = event.y - 44 - (stack % 4) * 16;
        const parts: Phaser.GameObjects.Text[] = [
          this.add
            .text(0, 0, value, {
              fontFamily: FONT,
              fontSize: big ? '24px' : '15px',
              fontStyle: big ? 'bold' : 'normal',
              color,
              stroke: '#000000',
              strokeThickness: big ? 4 : 3,
            })
            .setOrigin(0.5, 1),
        ];
        if (big) {
          const via = record.via.filter((v) => v !== record.source);
          const label = via.length > 0 ? `${record.source} ‹${via.join('・')}›` : record.source;
          parts.push(
            this.add
              .text(0, 0, label, { fontFamily: FONT, fontSize: '12px', color, stroke: '#000000', strokeThickness: 3 })
              .setOrigin(0.5, 0),
          );
        }
        const container = this.add.container(x, y, parts).setDepth(40);
        this.tweens.add({
          targets: container,
          y: y - (big ? 46 : 32),
          alpha: 0,
          duration: big ? 1100 : 750,
          ease: 'Cubic.easeOut',
          onComplete: () => container.destroy(),
        });
        break;
      }
      case 'statusActivated': {
        const unit = this.world.units.get(event.unitId);
        if (!unit) return;
        const def = STATUSES[event.status];
        const text = this.add
          .text(unit.x, unit.y + 30, event.source, {
            fontFamily: FONT,
            fontSize: '14px',
            color: `#${def.color.toString(16).padStart(6, '0')}`,
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 0)
          .setDepth(39);
        this.tweens.add({ targets: text, alpha: 0, delay: 500, duration: 600, onComplete: () => text.destroy() });
        break;
      }
      case 'swing': {
        const fx = this.add.graphics().setDepth(30);
        const half = Phaser.Math.DegToRad(event.arc / 2);
        fx.fillStyle(ELEMENTS[event.element].color, 0.25);
        fx.slice(event.x, event.y, event.range, event.angle - half, event.angle + half, false).fillPath();
        fx.lineStyle(2, ELEMENTS[event.element].color, 0.7);
        fx.beginPath().arc(event.x, event.y, event.range, event.angle - half, event.angle + half).strokePath();
        this.tweens.add({ targets: fx, alpha: 0, duration: 180, onComplete: () => fx.destroy() });
        break;
      }
      case 'chain': {
        const fx = this.add.graphics().setDepth(31);
        fx.lineStyle(3, STATUSES[event.status].color, 1);
        const steps = 6;
        fx.beginPath().moveTo(event.from.x, event.from.y);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          fx.lineTo(
            event.from.x + (event.to.x - event.from.x) * t + Phaser.Math.Between(-10, 10),
            event.from.y + (event.to.y - event.from.y) * t + Phaser.Math.Between(-10, 10),
          );
        }
        fx.lineTo(event.to.x, event.to.y).strokePath();
        this.tweens.add({ targets: fx, alpha: 0, duration: 260, onComplete: () => fx.destroy() });
        break;
      }
      case 'burst': {
        const fx = this.add.graphics().setDepth(29);
        fx.fillStyle(STATUSES[event.status].color, 0.3).fillCircle(event.x, event.y, event.radius);
        fx.lineStyle(2, STATUSES[event.status].color, 0.8).strokeCircle(event.x, event.y, event.radius);
        this.tweens.add({ targets: fx, alpha: 0, duration: 400, onComplete: () => fx.destroy() });
        break;
      }
      case 'projectileEnd': {
        if (!event.hit) return;
        const fx = this.add.graphics().setDepth(29);
        fx.fillStyle(0xffffff, 0.6).fillCircle(event.x, event.y, 8);
        this.tweens.add({ targets: fx, alpha: 0, scale: 1.6, duration: 150, onComplete: () => fx.destroy() });
        break;
      }
      case 'fell': {
        if (event.unitId !== this.player.id) return;
        const text = this.add
          .text(this.player.x, this.player.y - 50, 'また、起き上がる', { fontFamily: FONT, fontSize: '22px', color: '#a03030', stroke: '#000', strokeThickness: 4 })
          .setOrigin(0.5)
          .setDepth(45);
        this.tweens.add({ targets: text, alpha: 0, delay: 800, duration: 800, onComplete: () => text.destroy() });
        break;
      }
      case 'statusEnded':
      case 'imbue':
        break;
    }
  }
}
