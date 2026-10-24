import Phaser from 'phaser';
import {
  ACTIVE_SKILLS,
  CombatWorld,
  DEFENSE,
  applyBuild,
  growCharacter,
  unspentPoints,
  ELEMENTS,
  FIELDS,
  STATUSES,
  STATUS_IDS,
  activeSkillDef,
  actionReach,
  resolveSkill,
  type SkillAction,
  type ElementId,
  dealtBy,
  skillElement,
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
import { createTrainingPanel, type BattleMode, type EnemyAttack } from '../ui/TrainingPanel';
import { ComboView } from '../ui/ComboView';
import { BuildScreen } from '../ui/BuildScreen';
import { currentBuild, currentCharacter, loadBuildState, resetBuildState, saveBuildState, type BuildState } from '../ui/buildStore';

const ARENA = { width: 1600, height: 1000 };
const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const MOVE_SPEED = 230;
/** 自動のときの移動。すいすい動いて弾を避ける */
const AUTO_MOVE_SPEED = 330;
/** 自分の見た目の大きさ。当たり判定(unit.radius)はこれより小さい */
const PLAYER_LOOK = 15;
/** 浮きスティック。押した所から引いた向きへ動く(画面のピクセル) */
const STICK = { deadzone: 10, full: 56, tapMs: 260 };
const DODGE = { speed: 900, duration: 170, cooldown: 650 };
/** 振りかぶり・硬直中、ガード中の移動の速さ(倍率) */
const BUSY_MOVE = 0.25;
const GUARD_MOVE = 0.45;
/** ターゲット固定できる距離と、外れる距離 */
const LOCK_RANGE = 650;
const LOCK_BREAK = 850;
/** ジャスト成功時のスロー */
const SLOWMO = { scale: 0.3, duration: 260 };
/** 硬直中に押したスキルを覚えておく時間 */
const INPUT_BUFFER = 350;
/** 早送りの段階 */
const SPEEDS = [1, 2, 3];
/** タップで歩かせた後、作戦の寄り道に戻るまでの間 */
const TAP_HOLD = 700;


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
  private lockTarget: Unit | null = null;
  private buffered: { skill: ActiveSkillId; until: number } | null = null;
  private slowUntil = 0;
  /** 振りかぶりの予兆。効果が出るか潰れるまで描く */
  private telegraphs: { unitId: string; skill: ActiveSkillId; angle: number; start: number; at: number; action: SkillAction; element?: ElementId }[] = [];
  private numberStack = new Map<string, number>();
  private mode: BattleMode = 'auto';
  private speed = 1;
  /** タップで指した行き先 */
  private moveTo: { x: number; y: number } | null = null;
  private tapHoldUntil = 0;
  private stick: { id: number; startX: number; startY: number; x: number; y: number; downAt: number; dragged: boolean } | null = null;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private combo!: ComboView;
  private buildState!: BuildState;
  private buildScreen!: BuildScreen;
  private nextGrowthCheck = 0;

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
      // 弾幕を抜けやすいよう、当たり判定は見た目より小さい
      radius: 8,
      maxHp: 300,
      autoBattle: true,
    });
    this.buildState = loadBuildState(Math.random);
    applyBuild(this.world, this.player, currentBuild(this.buildState));
    SCARECROW_SPOTS.forEach((spot, i) => {
      const unit = this.world.addUnit({
        id: `scarecrow${i}`,
        name: '案山子',
        team: 'enemy',
        x: spot.x,
        y: spot.y,
        radius: 20,
        maxHp: 1e9,
        ai: ['strawSwipe', i % 2 === 0 ? 'strawScatter' : 'emberFan'],
      });
      // 一斉に撃たないよう、最初の間をずらす
      for (const skill of unit.ai!.skills) unit.cooldowns[skill] = 400 + i * 700;
      this.scarecrows.push(unit);
      this.homes.set(unit.id, { ...spot, phase: i * 1.3 });
    });

    this.gfx = this.add.graphics();
    this.rainGfx = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(60);
    this.combo = new ComboView();
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.keybinds = loadKeybinds();
    this.input2 = new InputController(this.keybinds, this.game.canvas);
    this.input2.onWheel = (dir) => this.switchLock(dir);
    this.hud = new Hud(this.player.actives, DODGE.cooldown, this.player.trump!, {
      onTrump: () => this.useTrump(),
      onSpeed: () => this.cycleSpeed(),
      onBreakdown: () => this.toggleBreakdown(),
      onBuild: () => this.openBuild(),
    });
    this.hud.setKeybinds(this.keybinds);
    this.hud.setMode(this.mode);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitZoom());
    this.fitZoom();
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
      get mode() {
        return scene.mode;
      },
      set mode(v: BattleMode) {
        scene.setMode(v);
      },
      setFloor: (field: FieldId, on: boolean) => this.setFloor(field, on),
      setEnemyAttack: (attack: EnemyAttack) => this.setEnemyAttack(attack),
      resetMeasure: () => this.world.resetLog(),
    };
    const panel = createTrainingPanel(host);
    // キー設定が変わったら枠の表示も変える
    panel.addEventListener('click', () => setTimeout(() => this.hud.setKeybinds(this.keybinds), 50));
    panel.addEventListener('mousedown', () => setTimeout(() => this.hud.setKeybinds(this.keybinds), 50));
    window.addEventListener('keydown', () => setTimeout(() => this.hud.setKeybinds(this.keybinds), 50));

    // 開発中だけ、ブラウザのコンソールから戦闘の状態を覗けるようにする
    if (import.meta.env.DEV) (window as unknown as { hakusura: unknown }).hakusura = { world: this.world, scene: this };

    const ui = document.getElementById('ui')!;
    this.buildScreen = new BuildScreen({
      get state() {
        return scene.buildState;
      },
      world: this.world,
      player: this.player,
      random: Math.random,
      onChange: () => this.onBuildChange(),
      onClose: () => {},
      onReset: () => {
        this.buildState = resetBuildState(Math.random);
        this.onBuildChange();
      },
    });
    ui.replaceChildren(panel, this.hud.el, this.combo.el, this.breakdown.el, this.buildScreen.el);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ui.replaceChildren());
  }

  private setMode(mode: BattleMode): void {
    this.mode = mode;
    this.player.autoBattle = mode === 'auto';
    this.player.focusId = undefined;
    this.lockTarget = null;
    this.moveTo = null;
    this.hud.setMode(mode);
  }

  /** 狭い画面では引いて、場を広く見せる */
  private fitZoom(): void {
    const { width, height } = this.scale;
    // 場の外が見えるほどは引かない
    const floor = Math.max(0.5, width / ARENA.width, height / ARENA.height);
    this.cameras.main.setZoom(Phaser.Math.Clamp(Math.min(width / 1000, height / 700), floor, 1));
  }

  /** 切り札は予約する。硬直中なら明けしだい、届かなければ寄ってから出る */
  private useTrump(): void {
    const trump = this.player.trump;
    if (!trump) return;
    const def = resolveSkill(trump);
    this.world.queueSkill(this.player.id, trump, def && actionReach(def.action) !== undefined ? 6000 : 1500);
  }

  /** キャラは時間で育つ。数秒ごとに数え、増えたら覚えておく */
  private tickGrowth(time: number): void {
    if (time < this.nextGrowthCheck) return;
    this.nextGrowthCheck = time + 2000;
    const now = Date.now();
    let grown = 0;
    for (const c of this.buildState.characters) grown += growCharacter(c, now);
    if (grown > 0) {
      saveBuildState(this.buildState);
      if (this.buildScreen.visible) this.buildScreen.render();
    }
    this.hud.setUnspent(unspentPoints(currentCharacter(this.buildState)));
  }

  private openBuild(): void {
    this.breakdown.el.classList.add('hidden');
    this.buildScreen.open();
  }

  /** 支度が変わったら、すぐ戦いに反映して覚えておく */
  private onBuildChange(): void {
    applyBuild(this.world, this.player, currentBuild(this.buildState));
    if (this.player.queued && this.player.queued.skill !== this.player.trump) this.player.queued = undefined;
    this.hud.setTrump(this.player.trump);
    this.hud.setSlots(this.player.actives);
    saveBuildState(this.buildState);
  }

  private cycleSpeed(): void {
    this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]!;
    this.hud.setSpeed(this.speed);
  }

  private toggleBreakdown(): void {
    this.breakdown.toggle();
    this.lastBreakdown = -Infinity;
  }

  private setEnemyAttack(attack: EnemyAttack): void {
    this.scarecrows.forEach((s, i) => {
      if (!s.ai) return;
      s.ai.enabled = attack !== 'none';
      s.ai.skills = attack === 'barrage' ? ['strawSwipe', i % 2 === 0 ? 'strawScatter' : 'emberFan'] : ['strawSwipe'];
    });
  }

  /** 自動のとき:押してから引くと浮きスティック、すぐ離せばタップ */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.mode !== 'auto' || pointer.button !== 0 || this.stick) return;
    this.stick = { id: pointer.id, startX: pointer.x, startY: pointer.y, x: pointer.x, y: pointer.y, downAt: this.time.now, dragged: false };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const stick = this.stick;
    if (!stick || pointer.id !== stick.id || !pointer.isDown) return;
    stick.x = pointer.x;
    stick.y = pointer.y;
    const dx = stick.x - stick.startX;
    const dy = stick.y - stick.startY;
    const len = Math.hypot(dx, dy);
    if (len > STICK.deadzone) {
      stick.dragged = true;
      this.moveTo = null;
    }
    // 引きすぎたら、押した所ごとついてくる
    const max = STICK.full * 1.3;
    if (len > max) {
      stick.startX = stick.x - (dx / len) * max;
      stick.startY = stick.y - (dy / len) * max;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const stick = this.stick;
    if (!stick || pointer.id !== stick.id) return;
    this.stick = null;
    if (stick.dragged) {
      this.tapHoldUntil = this.world.time + TAP_HOLD;
      return;
    }
    if (this.time.now - stick.downAt <= STICK.tapMs * 2) this.onTap(pointer);
  }

  /** 敵をタップすると狙いを定め、地面をタップするとそこへ歩く */
  private onTap(pointer: Phaser.Input.Pointer): void {
    const at = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const enemy = this.scarecrows.find((s) => Math.hypot(s.x - at.x, s.y - 10 - at.y) <= s.radius + 22);
    if (enemy) {
      const same = this.player.focusId === enemy.id;
      this.player.focusId = same ? undefined : enemy.id;
      this.lockTarget = same ? null : enemy;
      return;
    }
    this.moveTo = { x: at.x, y: at.y };
    this.tapHoldUntil = Infinity;
    const fx = this.add.graphics().setDepth(28);
    fx.lineStyle(2, 0xc9b79c, 0.8).strokeCircle(at.x, at.y, 12);
    this.tweens.add({ targets: fx, alpha: 0, scale: 0.4, duration: 350, onComplete: () => fx.destroy() });
  }

  private setFloor(field: FieldId, on: boolean): void {
    // 切り札で撒いた床は残す
    this.world.floors = this.world.floors.filter((f) => f.field !== field || f.until !== undefined);
    if (on) for (const spot of FLOOR_SPOTS[field]) this.world.addFloor(field, spot.x, spot.y, spot.radius);
  }

  update(time: number, delta: number): void {
    this.tickGrowth(time);
    // 支度の間は戦いを止める
    if (this.buildScreen.visible) return;
    const dt = Math.min(delta, 50) * (time < this.slowUntil ? SLOWMO.scale : 1) * this.speed;
    const world = this.world;
    const input = this.input2;
    const player = this.player;

    if (this.mode === 'auto') this.updateAuto(dt);
    else this.updateManual(dt);

    if (input.consumePressed('breakdown')) this.toggleBreakdown();
    input.endFrame();

    // 案山子を歩かせる。出血は動くと効く。振りかぶり中と昏倒中は止まる
    if (this.walking) {
      for (const s of this.scarecrows) {
        if (world.isBusy(s) || world.isIncapacitated(s)) continue;
        const home = this.homes.get(s.id)!;
        world.moveUnit(s.id, home.x + Math.sin(world.time / 900 + home.phase) * 50, home.y + Math.cos(world.time / 1300 + home.phase) * 30);
      }
    }

    // 早送りでも当たり判定が抜けないよう、細かく刻んで進める
    for (let left = dt; left > 0; left -= 25) world.update(Math.min(25, left));
    for (const event of world.drainEvents()) this.showEvent(event);
    this.telegraphs = this.telegraphs.filter((t) => t.at > world.time);

    const cam = this.cameras.main;
    const focus = this.lockTarget
      ? { x: player.x + (this.lockTarget.x - player.x) * 0.35, y: player.y + (this.lockTarget.y - player.y) * 0.35 }
      : player;
    cam.scrollX += (focus.x - cam.width / 2 - cam.scrollX) * 0.12;
    cam.scrollY += (focus.y - cam.height / 2 - cam.scrollY) * 0.12;

    this.draw();
    this.drawStick();
    this.combo.update(this.time.now);
    this.hud.update(world, player, this.dodgeReadyAt, this.lockTarget, !!player.queued && player.queued.until >= world.time);
    if (this.breakdown.visible && world.time - this.lastBreakdown > 250) {
      this.lastBreakdown = world.time;
      this.breakdown.render(summarize(dealtBy(world.log, player.id), world.time));
    }
  }

  /** 自動:スキルは作戦が選ぶ。こちらは歩く先と狙う相手と切り札だけ */
  private updateAuto(dt: number): void {
    const world = this.world;
    const input = this.input2;
    const player = this.player;
    if (this.lockTarget && !world.units.has(this.lockTarget.id)) this.lockTarget = null;

    const target = world.tacticTarget(player);
    if (!world.isBusy(player) && !world.isIncapacitated(player)) {
      const look = target ?? this.moveTo;
      if (look) this.facing = Math.atan2(look.y - player.y, look.x - player.x);
      world.setFacing(player.id, this.facing);
    } else {
      this.facing = player.facing;
    }
    if (input.consumePressed('trump')) this.useTrump();

    let mx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    let my = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    let throttle = 1;
    if (this.stick?.dragged) {
      const dx = this.stick.x - this.stick.startX;
      const dy = this.stick.y - this.stick.startY;
      const len = Math.hypot(dx, dy);
      throttle = len <= STICK.deadzone ? 0 : Math.min(1, (len - STICK.deadzone) / (STICK.full - STICK.deadzone));
      mx = dx;
      my = dy;
      this.tapHoldUntil = world.time + TAP_HOLD;
    } else if (mx !== 0 || my !== 0) {
      this.moveTo = null;
      this.tapHoldUntil = world.time + TAP_HOLD;
    } else if (this.moveTo) {
      const dx = this.moveTo.x - player.x;
      const dy = this.moveTo.y - player.y;
      if (Math.hypot(dx, dy) < 6) {
        this.moveTo = null;
        this.tapHoldUntil = world.time + TAP_HOLD;
      } else {
        mx = dx;
        my = dy;
      }
    } else if (world.queuedGoal(player.id)) {
      const goal = world.queuedGoal(player.id)!;
      mx = goal.x - player.x;
      my = goal.y - player.y;
    } else if (world.time >= this.tapHoldUntil) {
      // 作戦のスキルが届かなければ寄っていく
      const goal = world.autoMoveGoal(player.id);
      if (goal && Math.hypot(goal.x - player.x, goal.y - player.y) > goal.stopAt) {
        mx = goal.x - player.x;
        my = goal.y - player.y;
      }
    }
    const len = Math.hypot(mx, my);
    // 自動では攻撃中も足を止めない
    const speed = world.isIncapacitated(player) ? 0 : AUTO_MOVE_SPEED * throttle * world.statOf(player, 'moveSpeed');
    const step = len > 0 ? Math.min((speed * dt) / 1000, this.moveTo ? Math.hypot(this.moveTo.x - player.x, this.moveTo.y - player.y) : Infinity) : 0;
    this.moveBy(len > 0 ? (mx / len) * step : 0, len > 0 ? (my / len) * step : 0);
  }

  /** 手動:WASD、マウス、6枠のスキル、回避とガード */
  private updateManual(dt: number): void {
    const world = this.world;
    const input = this.input2;
    const player = this.player;
    const mouse = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    // ターゲット固定
    if (this.lockTarget && Math.hypot(this.lockTarget.x - player.x, this.lockTarget.y - player.y) > LOCK_BREAK) this.lockTarget = null;
    if (input.consumePressed('lockOn')) this.lockTarget = this.lockTarget ? null : this.pickLockTarget(mouse);
    const aim = this.lockTarget ?? mouse;
    const incapacitated = world.isIncapacitated(player);
    const busy = world.isBusy(player);
    // 振りかぶり・硬直中は向きを変えない
    if (!busy && !incapacitated) {
      this.facing = Math.atan2(aim.y - player.y, aim.x - player.x);
      world.setFacing(player.id, this.facing);
    } else {
      this.facing = player.facing;
    }

    // ガード
    world.setGuard(player.id, input.isDown('guard') && !this.dodge);
    const guarding = player.guardSince !== null;

    // 移動と回避
    let mx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    let my = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    if (input.consumePressed('dodge') && world.time >= this.dodgeReadyAt && world.canDodge(player.id)) {
      world.setGuard(player.id, false);
      world.dodge(player.id);
      const dir = len > 0 ? { x: mx, y: my } : { x: -Math.cos(this.facing), y: -Math.sin(this.facing) };
      this.dodge = { vx: dir.x * DODGE.speed, vy: dir.y * DODGE.speed, until: world.time + DODGE.duration };
      this.dodgeReadyAt = world.time + DODGE.cooldown;
    }
    const speed = incapacitated ? 0 : MOVE_SPEED * (busy ? BUSY_MOVE : guarding ? GUARD_MOVE : 1) * world.statOf(player, 'moveSpeed');
    let vx = mx * speed;
    let vy = my * speed;
    if (this.dodge) {
      if (world.time < this.dodge.until) {
        vx = this.dodge.vx;
        vy = this.dodge.vy;
      } else this.dodge = null;
    }
    this.moveBy((vx * dt) / 1000, (vy * dt) / 1000);

    // アクティブスキル。押した瞬間だけ出す。硬直中に押した分は少しの間だけ覚えておく
    ACTIVE_SLOT_ACTIONS.forEach((action, i) => {
      // 手動のときは、ビルドのアクティブを順に6枠へ入れる
      const skill = this.player.actives[i];
      if (skill && input.consumePressed(action)) this.buffered = { skill, until: world.time + INPUT_BUFFER };
    });
    if (this.buffered && this.buffered.until < world.time) this.buffered = null;
    if (this.buffered && !this.dodge && world.useSkill(player.id, this.buffered.skill, aim, this.lockTarget?.id)) {
      this.buffered = null;
    }
  }

  /** 自分を動かす。案山子はすり抜けず、場の外へは出ない */
  private moveBy(dx: number, dy: number): void {
    const player = this.player;
    const r = player.radius;
    let nx = player.x + dx;
    let ny = player.y + dy;
    for (const s of this.scarecrows) {
      const ox = nx - s.x;
      const oy = ny - s.y;
      const d = Math.hypot(ox, oy);
      const min = r + s.radius;
      if (d < min && d > 0.001) {
        nx = s.x + (ox / d) * min;
        ny = s.y + (oy / d) * min;
      }
    }
    this.world.moveUnit(player.id, Phaser.Math.Clamp(nx, r, ARENA.width - r), Phaser.Math.Clamp(ny, r, ARENA.height - r));
  }

  /** カーソルに近い敵を選ぶ。届く範囲にいなければ固定しない */
  private pickLockTarget(cursor: { x: number; y: number }): Unit | null {
    return (
      this.enemiesInRange()
        .map((u) => ({ u, d: Math.hypot(u.x - cursor.x, u.y - cursor.y) }))
        .sort((a, b) => a.d - b.d)[0]?.u ?? null
    );
  }

  private enemiesInRange(): Unit[] {
    const p = this.player;
    return [...this.world.units.values()].filter((u) => u.team !== p.team && Math.hypot(u.x - p.x, u.y - p.y) <= LOCK_RANGE);
  }

  /** ホイールで固定先を切り替える。自分から見た角度の順に回る */
  private switchLock(direction: number): void {
    if (!this.lockTarget) return;
    const p = this.player;
    const angleOf = (u: Unit) => Math.atan2(u.y - p.y, u.x - p.x);
    const list = this.enemiesInRange().sort((a, b) => angleOf(a) - angleOf(b));
    if (list.length < 2) return;
    const i = list.indexOf(this.lockTarget);
    this.lockTarget = list[(i + direction + list.length) % list.length]!;
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

    // 振りかぶりの予兆。満ちたときに当たる
    for (const t of this.telegraphs) {
      const unit = world.units.get(t.unitId);
      const action = t.action;
      if (unit && action.type === 'barrage') {
        // 弾幕の予兆。満ちる輪で撃つ瞬間を知らせる
        const progress = Phaser.Math.Clamp((world.time - t.start) / (t.at - t.start), 0, 1);
        const color = ELEMENTS[t.element ?? 'slash'].color;
        g.lineStyle(2, 0xa83228, 0.5 + progress * 0.4).strokeCircle(unit.x, unit.y, 46 - progress * 22);
        g.fillStyle(color, 0.15 + progress * 0.25).fillCircle(unit.x, unit.y, 24);
        if (action.pattern === 'fan') {
          const half = Phaser.Math.DegToRad((action.spread ?? 0) / 2);
          g.lineStyle(1, 0xa83228, 0.5);
          for (const a of [t.angle - half, t.angle + half]) g.lineBetween(unit.x, unit.y, unit.x + Math.cos(a) * 160, unit.y + Math.sin(a) * 160);
        }
        continue;
      }
      if (!unit || action.type !== 'melee') continue;
      const half = Phaser.Math.DegToRad(action.arc / 2);
      const progress = Phaser.Math.Clamp((world.time - t.start) / (t.at - t.start), 0, 1);
      const enemy = unit.team !== this.player.team;
      const color = enemy ? 0xa83228 : 0x9c8f78;
      g.fillStyle(color, enemy ? 0.12 : 0.06);
      g.slice(unit.x, unit.y, action.range, t.angle - half, t.angle + half, false).fillPath();
      g.fillStyle(color, enemy ? 0.35 : 0.12);
      g.slice(unit.x, unit.y, action.range * progress, t.angle - half, t.angle + half, false).fillPath();
      if (enemy) {
        g.lineStyle(1, color, 0.8);
        g.beginPath().arc(unit.x, unit.y, action.range, t.angle - half, t.angle + half).strokePath();
      }
    }

    // 案山子
    for (const s of this.scarecrows) {
      g.fillStyle(0x4a3b2c).fillRect(s.x - 3, s.y - 26, 6, 46);
      g.fillRect(s.x - 20, s.y - 14, 40, 5);
      g.fillStyle(0x8a7454).fillCircle(s.x, s.y - 28, 9);
      g.lineStyle(1, 0x2a2018).strokeCircle(s.x, s.y - 28, 9);
      this.drawStatuses(s, s.y + 26);
      if (world.isIncapacitated(s)) {
        const a = world.time / 150;
        g.fillStyle(0xd8c25a, 0.9);
        for (let i = 0; i < 3; i++) g.fillCircle(s.x + Math.cos(a + i * 2.1) * 14, s.y - 44 + Math.sin(a + i * 2.1) * 4, 2.5);
      }
    }

    // ターゲット固定の印
    if (this.lockTarget) {
      const t = this.lockTarget;
      const a = world.time / 400;
      g.lineStyle(2, 0xc9b79c, 0.9);
      for (let i = 0; i < 4; i++) {
        const base = a + (i * Math.PI) / 2;
        g.beginPath().arc(t.x, t.y - 8, 34, base, base + 0.7).strokePath();
      }
      g.fillStyle(0xc9b79c, 0.9).fillCircle(t.x, t.y - 8, 3);
    }

    // 自分
    const p = this.player;
    const invulnerable = p.invulnerableUntil > world.time;
    g.fillStyle(0xcbbfa8, invulnerable ? 0.35 : 1).fillCircle(p.x, p.y, PLAYER_LOOK);
    g.lineStyle(2, 0x6b2b22, invulnerable ? 0.35 : 1).strokeCircle(p.x, p.y, PLAYER_LOOK);
    // 本当の当たり判定
    g.fillStyle(0x7a1f22, 1).fillCircle(p.x, p.y, p.radius * 0.6);
    g.lineStyle(1, 0xf2e6c8, 0.9).strokeCircle(p.x, p.y, p.radius);
    if (p.imbue && p.imbue.until > world.time) {
      g.lineStyle(2, ELEMENTS[skillElement(activeSkillDef(p.imbue.skill))].color, 0.7 + Math.sin(world.time / 80) * 0.3).strokeCircle(p.x, p.y, PLAYER_LOOK + 5);
    }
    if (p.guardSince !== null) {
      const fresh = p.guardIsFresh && world.time - p.guardSince <= DEFENSE.justGuardWindow;
      g.lineStyle(fresh ? 5 : 4, fresh ? 0xf2e6c8 : 0x8a7e6a, 0.95);
      const arc = Phaser.Math.DegToRad(DEFENSE.guardArc);
      g.beginPath().arc(p.x, p.y, PLAYER_LOOK + 9, this.facing - arc, this.facing + arc).strokePath();
    }
    const ax = p.x + Math.cos(this.facing) * (PLAYER_LOOK + 14);
    const ay = p.y + Math.sin(this.facing) * (PLAYER_LOOK + 14);
    g.lineStyle(3, 0x9c8f78).lineBetween(p.x + Math.cos(this.facing) * PLAYER_LOOK, p.y + Math.sin(this.facing) * PLAYER_LOOK, ax, ay);
    this.drawStatuses(p, p.y + PLAYER_LOOK + 8);

    for (const proj of world.projectiles) {
      const color = ELEMENTS[proj.element].color;
      if (world.units.get(proj.ownerId)?.team === this.player.team) {
        g.fillStyle(color, 0.3).fillCircle(proj.x, proj.y, proj.radius * 2.2);
        g.fillStyle(color).fillCircle(proj.x, proj.y, proj.radius);
      } else {
        // 敵の弾は縁取りを赤くして、暗い地面でも見分けやすくする
        g.fillStyle(color, 0.25).fillCircle(proj.x, proj.y, proj.radius * 1.9);
        g.lineStyle(2, 0xc23a2c, 0.95).strokeCircle(proj.x, proj.y, proj.radius + 1);
        g.fillStyle(0xfff2e0, 1).fillCircle(proj.x, proj.y, proj.radius * 0.55);
      }
    }

    this.drawRain();
  }

  private drawStick(): void {
    const g = this.stickGfx;
    g.clear();
    const stick = this.stick;
    if (!stick?.dragged) return;
    g.lineStyle(2, 0xc9b79c, 0.35).strokeCircle(stick.startX, stick.startY, STICK.full);
    const dx = stick.x - stick.startX;
    const dy = stick.y - stick.startY;
    const len = Math.hypot(dx, dy);
    const k = len > STICK.full ? STICK.full / len : 1;
    g.fillStyle(0xc9b79c, 0.45).fillCircle(stick.startX + dx * k, stick.startY + dy * k, 18);
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

  /** 自分の頭上に大きく出す一言 */
  private callout(unit: Unit, label: string, color: string): void {
    const text = this.add
      .text(unit.x, unit.y - 46, label, { fontFamily: FONT, fontSize: '26px', color, stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(45);
    this.tweens.add({ targets: text, y: text.y - 24, alpha: 0, delay: 350, duration: 600, onComplete: () => text.destroy() });
  }

  // ---- 戦闘の出来事 ----

  private showEvent(event: CombatEvent): void {
    switch (event.type) {
      case 'damage': {
        const { record } = event;
        if (record.attackerId === this.player.id && record.targetTeam !== this.player.team) this.combo.push(record, this.time.now);
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
      case 'nova': {
        const fx = this.add.graphics().setDepth(29);
        const color = ELEMENTS[event.element].color;
        fx.fillStyle(color, 0.18).fillCircle(event.x, event.y, event.radius);
        fx.lineStyle(3, color, 0.9).strokeCircle(event.x, event.y, event.radius);
        this.cameras.main.shake(140, 0.005);
        this.tweens.add({ targets: fx, alpha: 0, duration: 500, onComplete: () => fx.destroy() });
        break;
      }
      case 'projectileEnd': {
        if (event.cleared) {
          // 近攻撃でかき消した弾
          const fx = this.add.graphics().setDepth(29);
          fx.lineStyle(2, 0xe6dccb, 0.8).strokeCircle(event.x, event.y, 6);
          this.tweens.add({ targets: fx, alpha: 0, scale: 2, duration: 220, onComplete: () => fx.destroy() });
          return;
        }
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
      case 'windup': {
        this.telegraphs.push({
          unitId: event.unitId,
          skill: event.skill,
          angle: event.angle,
          start: this.world.time,
          at: event.at,
          action: event.action,
          element: event.element,
        });
        break;
      }
      case 'interrupted': {
        this.telegraphs = this.telegraphs.filter((t) => t.unitId !== event.unitId);
        break;
      }
      case 'justDodge': {
        // 自分の指で見切ったときだけ、時間を緩める
        if (!event.label) this.slowUntil = this.time.now + SLOWMO.duration;
        this.cameras.main.flash(120, 90, 110, 140);
        const unit = this.world.units.get(event.unitId) ?? this.player;
        this.callout(unit, event.label ? `見切り ‹${event.label}›` : '見切り', '#9fc4e8');
        break;
      }
      case 'justGuard': {
        if (!event.label) this.slowUntil = this.time.now + SLOWMO.duration;
        this.cameras.main.shake(120, 0.006);
        this.callout(this.world.units.get(event.unitId) ?? this.player, event.label ? `弾き ‹${event.label}›` : '弾き', '#f2e6c8');
        const fx = this.add.graphics().setDepth(41);
        const x = this.player.x + Math.cos(this.facing) * (this.player.radius + 10);
        const y = this.player.y + Math.sin(this.facing) * (this.player.radius + 10);
        fx.lineStyle(2, 0xfff2c8, 1);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          fx.lineBetween(x + Math.cos(a) * 4, y + Math.sin(a) * 4, x + Math.cos(a) * 18, y + Math.sin(a) * 18);
        }
        this.tweens.add({ targets: fx, alpha: 0, duration: 250, onComplete: () => fx.destroy() });
        break;
      }
      case 'guarded': {
        if (event.unitId === this.player.id) this.cameras.main.shake(80, 0.003);
        break;
      }
      case 'weatherCalled': {
        this.callout(this.player, `${FIELDS[event.field].name}を呼んだ`, '#8fb4d8');
        break;
      }
      case 'dodged':
      case 'statusEnded':
      case 'imbue':
        break;
    }
  }
}
