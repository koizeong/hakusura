import Phaser from 'phaser';
import {
  ACTIVE_SKILLS,
  CombatWorld,
  DEFENSE,
  STEP,
  applyBuild,
  expeditionDone,
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
  type Point,
  type StatusDef,
  type StatusId,
  FLOOR_IDS,
  weaponDef,
  FORMS,
  learnedForms,
  ENEMIES,
  enemyDef,
  conditionDef,
  Encounter,
  claimEncounterReward,
  type EncounterId,
  type EnemyId,
} from '@hakusura/core';
import { EncounterView } from '../ui/EncounterView';
import { GRIP, SHIELD_SIZE, WEAPON_SIZE, createPilgrimTexture, enemyArtOrigin, enemyArtSize, enemyTexture, floorAlpha, floorTexture, frameIndex, groundTexture, PROJECTILE_CORE, PROJECTILE_CORE_RADIUS, PROJECTILE_SIZE, projectileTexture, statusIconTexture, preloadPilgrim, shieldTexture, weaponTexture, type Anim, type Dir } from '../art';
import { InputController } from '../input/InputController';
import { ACTIVE_SLOT_ACTIONS, loadKeybinds, type Keybinds } from '../input/keybinds';
import { BreakdownView } from '../ui/BreakdownView';
import { Hud } from '../ui/Hud';
import { createTrainingPanel, type BattleMode, type EnemyAttack } from '../ui/TrainingPanel';
import { ComboView } from '../ui/ComboView';
import { BuildScreen } from '../ui/BuildScreen';
import { UNLOCK_NAMES, currentBuild, currentCharacter, loadBuildState, resetBuildState, saveBuildState, unlock, type BuildState, type Unlock } from '../ui/buildStore';

const ARENA = { width: 1600, height: 1000 };
/** 霧と夜の暗がりの絵の大きさ。場のどこにいても場を覆える */
const VEIL_SIZE = 4000;
const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const MOVE_SPEED = 230;
/** 自動のときの移動。すいすい動いて弾を避ける */
const AUTO_MOVE_SPEED = 330;
/** 自分の見た目の大きさ。当たり判定(unit.radius)はこれより小さい */
const PLAYER_LOOK = 15;
/**
 * 自キャラのドット絵を何倍で見せるか。当たり判定が胴に来るよう、絵の胴の高さ(32コマの18段目)を立ち位置に合わせる。
 * feet は立ち位置から足元までの距離。足元の輪(付与・盾)はここに描く
 */
const PLAYER_ART = { scale: 2.25, originY: 18 / 32, feet: (29 - 18) * 2.25 } as const;
/** 向きごとの手の位置(立ち位置から)。behind なら体の後ろに隠れる */
const HAND_OFFSETS: Record<Dir, Record<'main' | 'off' | 'shield', { x: number; y: number; behind: boolean }>> = {
  down: { main: { x: 12, y: 6, behind: false }, off: { x: -12, y: 6, behind: false }, shield: { x: -11, y: 4, behind: false } },
  up: { main: { x: 12, y: 2, behind: true }, off: { x: -12, y: 2, behind: true }, shield: { x: -11, y: 0, behind: true } },
  // 横向きの盾は、隠れないよう体の前に構える
  side: { main: { x: 5, y: 8, behind: false }, off: { x: -3, y: 3, behind: true }, shield: { x: 9, y: 2, behind: false } },
};
/** 近攻撃で武器を振り抜く時間(ミリ秒) */
const SWING_MS = 170;
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


/** 案山子の配置。感電が飛び移れるよう寄せて立てる */
const SCARECROW_SPOTS = [
  { x: 1050, y: 500 },
  { x: 1140, y: 430 },
  { x: 1140, y: 570 },
  { x: 1230, y: 500 },
  { x: 1010, y: 640 },
];

/** 床の状態を敷く場所 */
/** 床を敷く場所。案山子の足元を床ごとに少しずらし、自分の近くにも1つ置く */
function floorSpots(field: FieldId): { x: number; y: number; radius: number }[] {
  const i = FLOOR_IDS.indexOf(field);
  const a = (i / Math.max(1, FLOOR_IDS.length)) * Math.PI * 2;
  return [
    { x: 1120 + Math.cos(a) * 60, y: 510 + Math.sin(a) * 60, radius: 120 },
    { x: 700 + Math.cos(a) * 140, y: 500 + Math.sin(a) * 140, radius: 60 },
  ];
}

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
  /** 霧と夜の暗がり。自分の周りだけ見える。毎回描くと重いので、一度作った絵を動かす */
  private veils!: Record<'fog' | 'night', Phaser.GameObjects.Image>;
  private hud!: Hud;
  private breakdown!: BreakdownView;
  private walking = false;
  private dodge: Dodge | null = null;
  private dodgeReadyAt = 0;
  /** ステップのボタンが押された(次の更新で踏む) */
  private stepRequested = false;
  private lastBreakdown = 0;
  private facing = 0;
  private lockTarget: Unit | null = null;
  private buffered: { skill: ActiveSkillId; until: number } | null = null;
  private slowUntil = 0;
  /** 振りかぶりの予兆。効果が出るか潰れるまで描く */
  private telegraphs: { unitId: string; skill: ActiveSkillId; angle: number; start: number; at: number; action: SkillAction; element?: ElementId; aim: Point }[] = [];
  /** 飛ぶ者の今の浮き上がり(画面の高さ)。飛び上がりと降下をなめらかにする */
  private lifts = new Map<string, number>();
  private numberStack = new Map<string, number>();
  private mode: BattleMode = 'auto';
  private speed = 1;
  /** タップで指した行き先 */
  private moveTo: { x: number; y: number } | null = null;
  private stick: { id: number; startX: number; startY: number; x: number; y: number; downAt: number; dragged: boolean } | null = null;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private combo!: ComboView;
  private buildState!: BuildState;
  private buildScreen!: BuildScreen;
  private nextGrowthCheck = 0;
  private lastReturned = 0;
  /** 一戦の最中なら、その進み具合 */
  private encounter: Encounter | null = null;
  private encounterView!: EncounterView;
  private enemySerial = 0;
  /** 最後に被弾した時刻(画面の時刻)。当たった瞬間に白く光らせる */
  private hurtAt = new Map<string, number>();
  /** 自キャラの絵と、絵の上に重ねる印(当たり判定・弾など) */
  private playerSprite!: Phaser.GameObjects.Sprite;
  private overGfx!: Phaser.GameObjects.Graphics;
  private lastPlayerPos = { x: 0, y: 0 };
  /** 敵と案山子の絵 */
  private unitSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private lastUnitPos = new Map<string, { x: number; y: number }>();
  private seenSprites = new Set<string>();
  /** 床の溜まりごとの絵。床が変われば絵を替え、消えれば片付ける */
  /** 状態の印の絵。毎回の描画で頭から使い、余りは隠す */
  private iconPool: Phaser.GameObjects.Image[] = [];
  private iconsUsed = 0;
  private projectileImages = new Map<number, Phaser.GameObjects.Image>();
  private floorImages = new Map<number, { img: Phaser.GameObjects.Image; key: string }>();
  /** 手に持つ武器と盾の絵。武器は狙う向きへ回し、近攻撃では扇に沿って振る */
  private held: { img: Phaser.GameObjects.Image; side: 1 | -1; kind: 'melee' | 'ranged' | 'shield' }[] = [];
  /** 直近の近攻撃の振り。いつ、どの向きへ、どれだけの扇で */
  private swing: { at: number; angle: number; arc: number } | null = null;
  /** 振りかぶっている攻撃の種類 */
  private pendingKind: 'melee' | 'other' = 'other';

  constructor() {
    super('TrainingGround');
  }

  preload(): void {
    preloadPilgrim(this);
  }

  create(): void {
    this.world = new CombatWorld({ seed: Math.floor(Math.random() * 1e9), bounds: ARENA });
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
    this.player.forms = learnedForms(this.buildState.learned);
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

    // 地面は升の大きさで1枚に描き、拡大して敷く
    const gw = Math.ceil(ARENA.width / PLAYER_ART.scale);
    const gh = Math.ceil(ARENA.height / PLAYER_ART.scale);
    this.add.image(0, 0, groundTexture(this, gw, gh)).setOrigin(0).setScale(PLAYER_ART.scale).setDepth(-2);
    this.gfx = this.add.graphics();
    createPilgrimTexture(this);
    this.playerSprite = this.add.sprite(this.player.x, this.player.y, 'pilgrim', 0).setScale(PLAYER_ART.scale).setOrigin(0.5, PLAYER_ART.originY).setDepth(1);
    this.overGfx = this.add.graphics().setDepth(2);
    this.refreshHeld();
    this.rainGfx = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.veils = { fog: this.makeVeil('veil-fog', [200, 204, 208], 0.72, 200), night: this.makeVeil('veil-night', [5, 5, 12], 0.8, 240) };
    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(60);
    this.combo = new ComboView();
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.keybinds = loadKeybinds();
    this.input2 = new InputController(this.keybinds, this.game.canvas);
    this.input2.onWheel = (dir) => this.switchLock(dir);
    this.hud = new Hud(this.player.actives, DODGE.cooldown, STEP.cooldown, this.player.trump!, {
      onTrump: () => this.useTrump(),
      onStep: () => (this.stepRequested = true),
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
      spawnEnemy: (kind: EnemyId) => this.spawnEnemy(kind),
      clearEnemies: () => this.clearEnemies(),
      startEncounter: (id: EncounterId) => this.startEncounter(id),
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
    this.encounterView = new EncounterView(() => this.endEncounter());
    ui.replaceChildren(panel, this.hud.el, this.combo.el, this.breakdown.el, this.encounterView.el, this.buildScreen.el);
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

  // ---- 敵と一戦 ----

  /** 場にいる敵。案山子も含む */
  private enemies(): Unit[] {
    return [...this.world.units.values()].filter((u) => u.team !== this.player.team);
  }

  /** 試しに敵を1体呼ぶ。少し離れた所に現れる */
  private spawnEnemy(kind: EnemyId): void {
    const a = Math.random() * Math.PI * 2;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * 380, 60, ARENA.width - 60);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * 380, 60, ARENA.height - 60);
    this.world.spawnEnemy(kind, `${kind}-t${++this.enemySerial}`, x, y);
  }

  /** 呼んだ敵を消す。案山子は残す */
  private clearEnemies(): void {
    for (const u of this.enemies()) if (u.kind) this.world.units.delete(u.id);
    this.world.projectiles = [];
  }

  /** 一戦を始める。案山子を片付け、場をまっさらにして群れを待つ */
  private startEncounter(id: EncounterId): void {
    if (this.encounter) return;
    this.clearEnemies();
    for (const s of this.scarecrows) this.world.units.delete(s.id);
    this.world.floors = [];
    this.world.weather = null;
    this.world.weatherCall = null;
    this.world.resetLog();
    const p = this.player;
    p.hp = p.maxHp;
    p.falls = 0;
    p.cooldowns = {};
    for (const st of Object.values(p.statuses)) (st.buildup = 0), (st.activeUntil = 0);
    this.world.moveUnit(p.id, ARENA.width / 2, ARENA.height / 2);
    this.lockTarget = null;
    p.focusId = undefined;
    this.encounter = new Encounter(this.world, id, p);
    this.callout(p, this.encounter.def.name, '#c9b79c');
  }

  /** 一戦をやめるか終えて、試し斬り場に戻す */
  private endEncounter(): void {
    if (!this.encounter) return;
    this.encounter = null;
    this.encounterView.hide();
    this.clearEnemies();
    this.world.floors = [];
    this.world.weather = null;
    this.world.weatherCall = null;
    for (const s of this.scarecrows) {
      s.hp = s.maxHp;
      this.world.units.set(s.id, s);
    }
    this.player.hp = this.player.maxHp;
    this.world.resetLog();
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

  /** 数秒ごとに、遠征から戻った者と振れる点数を見て、支度のボタンに知らせる */
  private tickGrowth(time: number): void {
    if (time < this.nextGrowthCheck) return;
    this.nextGrowthCheck = time + 2000;
    const now = Date.now();
    const returned = this.buildState.characters.filter((c) => expeditionDone(c, now)).length;
    if (returned !== this.lastReturned) {
      this.lastReturned = returned;
      if (this.buildScreen.visible) this.buildScreen.render();
    }
    this.hud.setNotice(unspentPoints(currentCharacter(this.buildState)), returned);
  }

  /** 伏せていた仕組みを開き、知らせる */
  private openUnlock(key: Unlock): void {
    if (!unlock(this.buildState, key)) return;
    this.callout(this.player, `${UNLOCK_NAMES[key]}が開いた(支度で見られる)`, '#e8d8a8');
    saveBuildState(this.buildState);
  }

  private openBuild(): void {
    this.breakdown.el.classList.add('hidden');
    this.buildScreen.open();
  }

  /** 支度が変わったら、すぐ戦いに反映して覚えておく */
  private onBuildChange(): void {
    applyBuild(this.world, this.player, currentBuild(this.buildState));
    this.player.forms = learnedForms(this.buildState.learned);
    if (this.player.queued && this.player.queued.skill !== this.player.trump) this.player.queued = undefined;
    this.hud.setTrump(this.player.trump);
    this.hud.setSlots(this.player.actives);
    this.refreshHeld();
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
    if (stick.dragged) return;
    if (this.time.now - stick.downAt <= STICK.tapMs * 2) this.onTap(pointer);
  }

  /** 敵をタップすると狙いを定め、地面をタップするとそこへ歩く */
  private onTap(pointer: Phaser.Input.Pointer): void {
    const at = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const enemy = this.enemies().find((s) => Math.hypot(s.x - at.x, s.y - (s.kind ? 0 : 10) - at.y) <= s.radius + 22);
    if (enemy) {
      const same = this.player.focusId === enemy.id;
      this.player.focusId = same ? undefined : enemy.id;
      this.lockTarget = same ? null : enemy;
      return;
    }
    this.moveTo = { x: at.x, y: at.y };
    const fx = this.add.graphics().setDepth(28);
    fx.lineStyle(2, 0xc9b79c, 0.8).strokeCircle(at.x, at.y, 12);
    this.tweens.add({ targets: fx, alpha: 0, scale: 0.4, duration: 350, onComplete: () => fx.destroy() });
  }

  private setFloor(field: FieldId, on: boolean): void {
    // 切り札で撒いた床は残す
    this.world.floors = this.world.floors.filter((f) => f.field !== field || f.until !== undefined);
    if (on) for (const spot of floorSpots(field)) this.world.addFloor(field, spot.x, spot.y, spot.radius);
  }

  update(time: number, delta: number): void {
    this.tickGrowth(time);
    // 支度の間と、一戦の知らせを見ている間は戦いを止める
    if (this.buildScreen.visible || this.encounter?.result) return;
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
        if (!world.units.has(s.id)) continue;
        if (world.isBusy(s) || world.isIncapacitated(s)) continue;
        const home = this.homes.get(s.id)!;
        world.moveUnit(s.id, home.x + Math.sin(world.time / 900 + home.phase) * 50, home.y + Math.cos(world.time / 1300 + home.phase) * 30);
      }
    }

    // 早送りでも当たり判定が抜けないよう、細かく刻んで進める
    for (let left = dt; left > 0; left -= 25) {
      this.encounter?.update();
      if (this.encounter?.result) break;
      world.update(Math.min(25, left));
    }
    if (this.encounter) {
      const e = this.encounter;
      if (e.result) {
        // 大物の一戦なら持ち帰りを受け取り、拾い物の山と覚えたものに足して覚えておく
        const spoils = claimEncounterReward(e, currentCharacter(this.buildState), this.buildState.learned, Math.random);
        if (spoils) {
          this.buildState.stash.unshift(...spoils.items);
          this.buildState.techniques.unshift(...spoils.variants);
          if (spoils.variants.length > 0) this.openUnlock('variants');
        }
        // 一戦を終えたら遠征が開く
        this.openUnlock('expedition');
        this.onBuildChange();
        this.encounterView.showResult(e, summarize(dealtBy(world.log, player.id), world.time), player.falls, () => this.endEncounter(), spoils);
      } else this.encounterView.update(e);
    }
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
      // 条件文がどの装備のものか
      const owners = new Map<string, string>();
      for (const item of Object.values(currentBuild(this.buildState).equipment)) {
        if (item?.condition) owners.set(conditionDef(item.condition).rule.label, item.name);
      }
      this.breakdown.render(summarize(dealtBy(world.log, player.id), world.time), owners);
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
    } else if (mx !== 0 || my !== 0) {
      this.moveTo = null;
    } else if (this.moveTo) {
      const dx = this.moveTo.x - player.x;
      const dy = this.moveTo.y - player.y;
      if (Math.hypot(dx, dy) < 6) {
        this.moveTo = null;
      } else {
        mx = dx;
        my = dy;
      }
    }
    // 足はプレイヤーのもの。作戦や切り札のために勝手に歩くことはしない(届かない技は届くまで待つ)
    const len = Math.hypot(mx, my);
    // 自動では攻撃中も足を止めない
    const speed = world.isIncapacitated(player) ? 0 : AUTO_MOVE_SPEED * throttle * world.statOf(player, 'moveSpeed');
    // ステップ。歩いている向きへ(止まっていれば一番近い敵から離れる向きへ)一瞬で跳ぶ。振りかぶりは潰れる
    const stepPressed = input.consumePressed('step') || this.stepRequested;
    this.stepRequested = false;
    if (stepPressed && world.time >= this.dodgeReadyAt && world.dodge(player.id, true)) {
      const away = target ? Math.atan2(player.y - target.y, player.x - target.x) : this.facing + Math.PI;
      const dir = len > 0 ? { x: mx / len, y: my / len } : { x: Math.cos(away), y: Math.sin(away) };
      this.dodge = { vx: dir.x * STEP.speed, vy: dir.y * STEP.speed, until: world.time + STEP.duration };
      this.dodgeReadyAt = world.time + STEP.cooldown;
      this.moveTo = null;
    }
    if (this.dodge) {
      if (world.time < this.dodge.until) {
        this.moveBy((this.dodge.vx * dt) / 1000, (this.dodge.vy * dt) / 1000);
        return;
      }
      this.dodge = null;
    }
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
    for (const s of this.enemies()) {
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

    // 地面の絵は敷いてあるので、縁だけ引く
    g.lineStyle(3, 0x3a2f28, 1).strokeRect(0, 0, ARENA.width, ARENA.height);

    this.drawFloors();

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
      if (unit && unit.team !== this.player.team && action.type === 'nova') {
        // 周りを払う技の予兆。満ちる輪
        const progress = Phaser.Math.Clamp((world.time - t.start) / (t.at - t.start), 0, 1);
        g.fillStyle(0xa83228, 0.1).fillCircle(unit.x, unit.y, action.radius);
        g.fillStyle(0xa83228, 0.28).fillCircle(unit.x, unit.y, action.radius * progress);
        g.lineStyle(2, 0xa83228, 0.8).strokeCircle(unit.x, unit.y, action.radius);
        continue;
      }
      if (unit && action.type === 'blink' && action.land) {
        // 急降下の予兆。降りる所に満ちる輪
        const progress = Phaser.Math.Clamp((world.time - t.start) / (t.at - t.start), 0, 1);
        const r = action.land.radius;
        g.fillStyle(0xa83228, 0.12).fillCircle(t.aim.x, t.aim.y, r);
        g.fillStyle(0xa83228, 0.3).fillCircle(t.aim.x, t.aim.y, r * progress);
        g.lineStyle(3, 0xc23a2c, 0.9).strokeCircle(t.aim.x, t.aim.y, r);
        g.lineBetween(t.aim.x - 14, t.aim.y - 14, t.aim.x + 14, t.aim.y + 14).lineBetween(t.aim.x - 14, t.aim.y + 14, t.aim.x + 14, t.aim.y - 14);
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

    // 敵と案山子。絵の上に重ねる印のため、先に重ねの層を消しておく
    this.overGfx.clear();
    this.iconsUsed = 0;
    for (const s of this.enemies()) this.drawUnitSprite(s, s.kind ?? 'scarecrow');
    this.sweepSprites();

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
    this.updatePlayerSprite();
    // 絵の上に重ねる印。弾も自分の絵に隠れないよう、ここに描く
    const o = this.overGfx;
    // 本当の当たり判定。胴の上に小さく
    o.fillStyle(0xe8dcc8, 0.75).fillCircle(p.x, p.y, 2.5);
    o.lineStyle(1, 0xf2e6c8, 0.25).strokeCircle(p.x, p.y, p.radius);
    // 付与と盾は、足元の輪で見せる(絵の下に描く)
    const fy = p.y + PLAYER_ART.feet;
    if (p.imbue && p.imbue.until > world.time) {
      g.lineStyle(3, ELEMENTS[skillElement(activeSkillDef(p.imbue.skill))].color, 0.55 + Math.sin(world.time / 80) * 0.25).strokeEllipse(p.x, fy, 46, 16);
    }
    if (p.shields.some((s) => s.ready)) {
      g.lineStyle(2, 0xc9d8e8, 0.5 + Math.sin(world.time / 260) * 0.15).strokeEllipse(p.x, fy, 56, 20);
    }
    if (p.guardSince !== null) {
      const fresh = p.guardIsFresh && world.time - p.guardSince <= DEFENSE.justGuardWindow;
      o.lineStyle(fresh ? 5 : 4, fresh ? 0xf2e6c8 : 0x8a7e6a, 0.95);
      const arc = Phaser.Math.DegToRad(DEFENSE.guardArc);
      o.beginPath().arc(p.x, p.y, PLAYER_LOOK + 11, this.facing - arc, this.facing + arc).strokePath();
    }
    this.drawStatuses(p, fy + 8);
    // 宿した儀式は、足元を巡る印で見せる
    const rites = p.rites.filter((r) => r.until > world.time);
    rites.forEach((_, i) => {
      const a = world.time / 600 + (i / rites.length) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 26;
      const y = fy + Math.sin(a) * 9;
      o.fillStyle(0xe8d8a8, 0.9).fillRect(x - 2.25, y - 4.5, 4.5, 9);
      o.fillStyle(0x6a4a20, 1).fillRect(x - 1, y - 2, 2, 4);
    });

    this.drawProjectiles();
    for (let i = this.iconsUsed; i < this.iconPool.length; i++) this.iconPool[i]!.setVisible(false);

    this.drawWeather();
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

  /** 着けている武器と盾の絵を作り直す。1本目は利き手(右)、2本目と盾は逆の手 */
  private refreshHeld(): void {
    for (const h of this.held) h.img.destroy();
    this.held = [];
    const p = this.player;
    const add = (key: string | undefined, side: 1 | -1, kind: 'melee' | 'ranged' | 'shield', size: { w: number; h: number }, origin: { x: number; y: number }) => {
      if (!key) return;
      const img = this.add.image(p.x, p.y, key).setScale(PLAYER_ART.scale).setOrigin(origin.x / size.w, origin.y / size.h);
      this.held.push({ img, side, kind });
    };
    p.weapons.forEach((w, i) => {
      const def = weaponDef(w);
      add(weaponTexture(this, w.type, def.element), i === 0 ? 1 : -1, def.kind, WEAPON_SIZE, GRIP);
    });
    const shield = p.shields[0];
    if (shield) {
      const half = SHIELD_SIZE / 2;
      add(shieldTexture(this, shield.type, shield.element), p.weapons.length >= 2 ? 1 : -1, 'shield', { w: SHIELD_SIZE, h: SHIELD_SIZE }, { x: half, y: half });
    }
  }

  /**
   * 武器と盾を手の位置に置く。武器は狙う向きへ回し、近攻撃の振りの間は扇の端から端へ振り抜く。
   * 上を向いているときは体の後ろに隠れる
   */
  private updateHeld(dir: Dir, left: boolean): void {
    const p = this.player;
    const a = this.facing;
    const now = this.time.now;
    const alpha = p.invulnerableUntil > this.world.time ? 0.45 : 1;
    const swinging = this.swing && now - this.swing.at < SWING_MS ? this.swing : null;
    const windingMelee = p.windupUntil > this.world.time && this.pendingKind === 'melee';
    for (const h of this.held) {
      const side = h.side;
      // 手の位置は絵の向きに合わせる。下向きは画面の右が利き手、横向きは利き手が手前
      const offset = HAND_OFFSETS[dir][h.kind === 'shield' ? 'shield' : side === 1 ? 'main' : 'off'];
      const hand = { x: p.x + (left ? -offset.x : offset.x), y: p.y + offset.y };
      const behind = offset.behind;
      let rot = a;
      if (h.kind === 'melee') {
        const half = Phaser.Math.DegToRad((swinging?.arc ?? 120) / 2);
        if (swinging) {
          const t = (now - swinging.at) / SWING_MS;
          rot = swinging.angle - half + 2 * half * (1 - (1 - t) ** 2);
        } else if (windingMelee) rot = a - half - 0.35;
        else rot = a + side * 0.55;
      } else if (h.kind === 'ranged') {
        // 撃った瞬間(振りかぶりが明けた直後)は少し跳ね上がる
        const since = this.world.time - p.windupUntil;
        const recoil = this.pendingKind === 'other' && since >= 0 && since < 160 ? 1 - since / 160 : 0;
        rot = a - recoil * 0.35;
      }
      // 体と同じ奥行きの、すぐ前か後ろに置く
      h.img.setPosition(hand.x, hand.y).setAlpha(alpha).setDepth(1 + p.y / 1e5 + (behind ? -1e-6 : 1e-6));
      if (h.kind === 'shield') {
        h.img.setRotation(0);
        continue;
      }
      h.img.setRotation(rot).setFlipY(Math.cos(rot) < 0);
    }
  }

  /**
   * 自キャラの絵のコマを選ぶ。向きは狙う向きから、動きは歩き・振りかぶり・被弾から決める。
   * 左向きは横向きの絵を裏返す
   */
  private updatePlayerSprite(): void {
    const p = this.player;
    const world = this.world;
    const sprite = this.playerSprite;
    const moved = Math.hypot(p.x - this.lastPlayerPos.x, p.y - this.lastPlayerPos.y);
    this.lastPlayerPos = { x: p.x, y: p.y };
    sprite.setPosition(p.x, p.y).setDepth(1 + p.y / 1e5);

    const deg = Phaser.Math.RadToDeg(this.facing);
    const dir: Dir = deg > -135 && deg < -45 ? 'up' : deg >= 45 && deg <= 135 ? 'down' : 'side';
    sprite.setFlipX(dir === 'side' && Math.abs(deg) > 90);

    const now = this.time.now;
    const hurt = this.hurtFlash(p.id);
    let anim: Anim = 'idle';
    let i = Math.floor(now / 520) % 2;
    if (hurt > 0) {
      anim = 'hurt';
      i = 0;
    } else if (p.windupUntil > world.time) {
      anim = 'attack';
      i = 0;
    } else if (p.busyUntil > world.time) {
      anim = 'attack';
      // 振り下ろした直後は伸びきった形を少し見せる
      i = world.time - p.windupUntil < 160 ? 1 : 2;
    } else if (moved > 0.4) {
      anim = 'walk';
      i = Math.floor(now / 120) % 4;
    }
    sprite.setFrame(frameIndex(dir, anim, i));
    this.updateHeld(dir, dir === 'side' && Math.abs(deg) > 90);
    sprite.setAlpha(p.invulnerableUntil > world.time ? 0.45 : 1);
    if (hurt > 0) sprite.setTint(0xff7060);
    else sprite.clearTint();
  }

  /** 被弾の光の強さ(0〜1)。当たった瞬間が1で、すぐ消える */
  private hurtFlash(id: string): number {
    const at = this.hurtAt.get(id);
    if (at === undefined) return 0;
    return Math.max(0, 1 - (this.time.now - at) / 140);
  }

  /**
   * 弾をドット絵で描き、飛ぶ向きへ回す。当たりの半径に合わせて拡大し、周りに淡い光を敷く。
   * 敵の弾は赤い縁と白い芯の丸で、暗い地面と弾幕の中でも見分けやすくする
   */
  private drawProjectiles(): void {
    const o = this.overGfx;
    const seen = new Set<number>();
    for (const proj of this.world.projectiles) {
      seen.add(proj.id);
      const hostile = this.world.units.get(proj.ownerId)?.team !== this.player.team;
      const color = ELEMENTS[proj.element].color;
      o.fillStyle(color, hostile ? 0.22 : 0.28).fillCircle(proj.x, proj.y, proj.radius * (hostile ? 1.9 : 2.2));
      const key = projectileTexture(this, proj.element, hostile);
      let img = this.projectileImages.get(proj.id);
      if (!img || img.texture.key !== key) {
        img?.destroy();
        img = this.add
          .image(proj.x, proj.y, key)
          .setOrigin(PROJECTILE_CORE.x / PROJECTILE_SIZE.w, PROJECTILE_CORE.y / PROJECTILE_SIZE.h)
          .setDepth(2.5);
        this.projectileImages.set(proj.id, img);
      }
      const scale = Math.max(PLAYER_ART.scale * 0.8, proj.radius / PROJECTILE_CORE_RADIUS);
      img.setPosition(proj.x, proj.y).setScale(scale).setRotation(Math.atan2(proj.vy, proj.vx));
    }
    for (const [id, img] of this.projectileImages) {
      if (seen.has(id)) continue;
      img.destroy();
      this.projectileImages.delete(id);
    }
  }

  /**
   * 床をドット絵で敷く。溜まりごとに絵を1枚持ち、床が変われば(水たまりが凍るなど)絵を替える。
   * 燃え跡の燻りだけは、揺らめくので毎回点で描く
   */
  private drawFloors(): void {
    const g = this.gfx;
    const t = this.world.time;
    const seen = new Set<number>();
    for (const patch of this.world.floors) {
      seen.add(patch.id);
      const { x, y, radius: r } = patch;
      const artRadius = r / PLAYER_ART.scale;
      const key = floorTexture(this, patch.field, artRadius, patch.id);
      let entry = this.floorImages.get(patch.id);
      if (!entry || entry.key !== key) {
        entry?.img.destroy();
        const img = this.add.image(x, y, key).setDepth(-1 + (patch.field === 'corpse' ? 0.5 : 0) + (patch.id % 1000) / 1e5);
        entry = { img, key };
        this.floorImages.set(patch.id, entry);
      }
      const img = entry.img;
      img.setPosition(x, y).setAlpha(floorAlpha(patch.field));
      if (patch.field === 'corpse') {
        img.setScale(PLAYER_ART.scale).setFlipX(patch.id % 2 === 1);
      } else {
        // 刻みに丸めた絵を、本当の半径に合うよう伸ばす
        const shown = (img.width - 3) / 2;
        img.setScale(r / shown);
      }
      // 消える間際は薄れていく
      if (patch.until !== undefined) img.setAlpha(img.alpha * Phaser.Math.Clamp((patch.until - t) / 1500, 0, 1));
      if (patch.field === 'scorch') {
        g.fillStyle(0xff7a2e, 0.75);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.1 + patch.id;
          if (Math.sin(t / 140 + i * 2 + patch.id) > 0.3) g.fillRect(Math.round(x + Math.cos(a) * r * 0.5), Math.round(y + Math.sin(a) * r * 0.5), 2.25, 2.25);
        }
      }
    }
    for (const [id, entry] of this.floorImages) {
      if (seen.has(id)) continue;
      entry.img.destroy();
      this.floorImages.delete(id);
    }
  }

  /**
   * 敵と案山子をドット絵で描く。コマは被弾・振りかぶり・動き(歩いていれば速く)から選び、左を向けば裏返す。
   * 振りかぶりの間は赤みを帯び、当たった瞬間は白く光る。体力と状態の印は絵の上に重ねる
   */
  private drawUnitSprite(u: Unit, art: EnemyId | 'scarecrow'): void {
    const world = this.world;
    const o = this.overGfx;
    let sprite = this.unitSprites.get(u.id);
    if (!sprite) {
      sprite = this.add.sprite(u.x, u.y, enemyTexture(this, art), 0).setScale(PLAYER_ART.scale).setOrigin(0.5, enemyArtOrigin(art));
      this.unitSprites.set(u.id, sprite);
    }
    this.seenSprites.add(u.id);
    const last = this.lastUnitPos.get(u.id) ?? { x: u.x, y: u.y };
    const moving = Math.hypot(u.x - last.x, u.y - last.y) > 0.3;
    this.lastUnitPos.set(u.id, { x: u.x, y: u.y });
    const now = this.time.now;
    const flash = this.hurtFlash(u.id);
    const winding = u.windupUntil > world.time;
    // 飛ぶ者は体だけが浮き、地面に影が残る。羽ばたきも速くなる
    const flying = world.isAirborne(u);
    const lift = Phaser.Math.Linear(this.lifts.get(u.id) ?? 0, flying ? 90 : 0, 0.08);
    this.lifts.set(u.id, lift);
    const phase = Math.floor((now + (u.x * 7) % 400) / (flying ? 140 : moving ? 200 : 520)) % 2;
    sprite.setPosition(u.x, u.y - lift).setDepth(1 + (u.y + (flying ? 1000 : 0)) / 1e5);
    const boss = !!u.kind && !!enemyDef(u.kind).boss;
    if (boss) {
      const feet = u.y + 50;
      const shrink = 1 - lift / 200;
      this.gfx.fillStyle(0x000000, 0.4 * shrink).fillEllipse(u.x, feet, 120 * shrink, 34 * shrink);
    }
    sprite.setFrame(flash > 0 ? 3 : winding ? 2 : phase);
    if (art !== 'scarecrow') sprite.setFlipX(Math.cos(u.facing) < 0);
    if (flash > 0.4) sprite.setTintFill(0xffffff);
    else if (winding) sprite.setTint(0xff9a8a);
    else if (u.enraged) sprite.setTint(0xffb0a0);
    else sprite.clearTint();
    // 影潜みは半ば透けている
    sprite.setAlpha(art === 'shadowStalker' ? 0.82 : 1);

    const size = enemyArtSize(art) * PLAYER_ART.scale;
    const top = u.y - lift - size * enemyArtOrigin(art) + (art === 'scarecrow' ? 8 : 10);
    const bottom = u.y + size * (1 - enemyArtOrigin(art)) - 4 - (boss ? 30 : 0);
    // 体力。減ってから見せる。大物は画面の上の棒で見せる
    if (u.mortal && u.hp < u.maxHp && !boss) {
      const w = Math.max(28, u.radius * 2.2);
      o.fillStyle(0x000000, 0.7).fillRect(u.x - w / 2, top - 6, w, 4);
      o.fillStyle(0xa83228, 1).fillRect(u.x - w / 2, top - 6, (w * Math.max(0, u.hp)) / u.maxHp, 4);
    }
    this.drawStatuses(u, bottom);
    if (world.isIncapacitated(u)) {
      const a = world.time / 150;
      o.fillStyle(0xd8c25a, 0.9);
      for (let i = 0; i < 3; i++) o.fillCircle(u.x + Math.cos(a + i * 2.1) * 14, top - 12 + Math.sin(a + i * 2.1) * 4, 2.5);
    }
  }

  /** この絵の中に、もう場にいない者の絵が残っていれば消す */
  private sweepSprites(): void {
    for (const [id, sprite] of this.unitSprites) {
      if (this.seenSprites.has(id)) continue;
      sprite.destroy();
      this.unitSprites.delete(id);
      this.lastUnitPos.delete(id);
      this.lifts.delete(id);
    }
    this.seenSprites.clear();
  }

  /** 状態の蓄積を細い棒、発動中を太い棒で出す */
  private drawStatuses(unit: Unit, top: number): void {
    const g = this.overGfx;
    const width = 40;
    let y = top;
    const icons: StatusId[] = [];
    for (const id of STATUS_IDS) {
      const st = unit.statuses[id];
      const def: StatusDef = STATUSES[id];
      // 瀕死・無傷のような様子で決まるものは、棒にしない
      if (def.derived) continue;
      const active = this.world.isActive(unit, id);
      if (!active && st.buildup <= 0.5) continue;
      g.fillStyle(0x000000, 0.6).fillRect(unit.x - width / 2, y, width, active ? 5 : 3);
      const ratio = active ? 1 : st.buildup / def.max;
      g.fillStyle(def.color, active ? 1 : 0.7).fillRect(unit.x - width / 2, y, width * ratio, active ? 5 : 3);
      if (active) icons.push(id);
      y += active ? 7 : 5;
    }
    // 発動中の状態は、棒の下に印を横に並べる
    const step = 13;
    icons.forEach((id, i) => this.placeIcon(statusIconTexture(this, id), unit.x + (i - (icons.length - 1) / 2) * step, y + 6));
  }

  /** 状態の印を1つ置く。絵は使い回す */
  private placeIcon(key: string, x: number, y: number): void {
    let img = this.iconPool[this.iconsUsed];
    if (!img) {
      img = this.add.image(0, 0, key).setScale(1.25).setDepth(2.6);
      this.iconPool.push(img);
    }
    this.iconsUsed++;
    if (img.texture.key !== key) img.setTexture(key);
    img.setPosition(x, y).setVisible(true);
  }

  /**
   * 自分の周りだけ明るい暗がりの絵を作る。中心から inner までは透け、外へ行くほど濃くなる。
   * 絵の端より外も覆えるよう、場の倍より大きく広げて置く
   */
  private makeVeil(key: string, rgb: [number, number, number], alpha: number, inner: number): Phaser.GameObjects.Image {
    const size = 512;
    const shown = VEIL_SIZE;
    const tex = this.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    const color = (a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    grad.addColorStop(0, color(0));
    grad.addColorStop(inner / (shown / 2), color(0));
    grad.addColorStop((inner + 240) / (shown / 2), color(alpha));
    grad.addColorStop(1, color(alpha));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    return this.add.image(0, 0, key).setDisplaySize(shown, shown).setDepth(48).setVisible(false);
  }

  /** 天候を描く。雨と砂嵐は画面に、霧と夜は自分の周りだけ見える暗がりにする */
  private drawWeather(): void {
    const g = this.rainGfx;
    g.clear();
    const weather = this.world.weather;
    for (const [id, veil] of Object.entries(this.veils)) {
      veil.setVisible(weather === id);
      if (weather === id) veil.setPosition(this.player.x, this.player.y);
    }
    if (!weather) return;
    const { width, height } = this.cameras.main;
    const t = this.world.time;
    // 引いた画面でも端まで覆えるよう、広めに塗る
    const tint = (color: number, alpha: number) => g.fillStyle(color, alpha).fillRect(-width, -height, width * 3, height * 3);
    // 雨と砂の粒。ドット絵に合わせ、升の大きさに揃えた点の連なりで描く
    const px = PLAYER_ART.scale;
    const snap = (v: number) => Math.round(v / px) * px;
    const streaks = (count: number, color: number, alpha: number, vx: number, vy: number, len: number) => {
      g.fillStyle(color, alpha);
      const falling = vy > 0.5;
      const cells = Math.max(2, Math.round(len / px));
      for (let i = 0; i < count; i++) {
        const seed = ((i * 9301 + 49297) % 233280) / 233280;
        // 横と縦で別の散らし方にして、粒が筋に並ばないようにする
        const x = snap((((seed * (width + 200) + t * vx) % (width + 200)) + width + 200) % (width + 200) - 100);
        const seedY = ((i * 7919 + 104729) % 6151) / 6151;
        const y = snap((((seedY * (height + 40) + t * vy) % (height + 40)) + height + 40) % (height + 40) - 20);
        if (falling) {
          // 少し斜めに落ちる滴。下へ行くほど1升ずつ左へずれる
          for (let k = 0; k < cells; k++) g.fillRect(x - Math.floor(k / 3) * px, y + k * px, px, px);
        } else {
          g.fillRect(x, y, cells * px, px);
        }
      }
    };
    switch (weather) {
      case 'rain':
        streaks(160, 0x8fa8c0, 0.35, 0.15, 0.9, 14);
        break;
      case 'sandstorm':
        tint(0xb8a070, 0.12);
        streaks(140, 0xd8c090, 0.4, 1.2, 0.08, 18);
        break;
      case 'miasma': {
        tint(0x4a5a20, 0.14);
        g.fillStyle(0x9aaa4a, 0.25);
        for (let i = 0; i < 40; i++) {
          const x = ((i * 131 + t * 0.02 * ((i % 3) + 1)) % (width + 40)) - 20;
          const y = ((i * 71 + Math.sin(t / 900 + i) * 30) % height + height) % height;
          g.fillCircle(x, y, 2 + (i % 3));
        }
        break;
      }
      case 'fog':
      case 'night':
      case 'calm':
        break;
    }
  }

  /**
   * 自分が被弾したとき。画面の縁を赤く滲ませ、重い一撃ほど揺らす。
   * 継続ダメージは揺らさず、滲みも薄くする
   */
  private onPlayerHurt(amount: number, dot: boolean): void {
    const ratio = amount / Math.max(1, this.player.maxHp);
    this.hud.hurt(dot ? ratio * 0.3 : ratio);
    if (dot) return;
    this.cameras.main.shake(120, Math.min(0.014, 0.003 + ratio * 0.06));
    // 足元に赤い飛沫
    const p = this.player;
    const fx = this.add.graphics().setDepth(41);
    fx.fillStyle(0xb02a30, 0.85);
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 10 + Math.random() * 16;
      fx.fillCircle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2 + Math.random() * 2.5);
    }
    this.tweens.add({ targets: fx, alpha: 0, duration: 380, onComplete: () => fx.destroy() });
  }

  /** 小さな文字を浮かべて消す */
  private floatText(x: number, y: number, label: string, color: string): void {
    const text = this.add.text(x, y, label, { fontFamily: FONT, fontSize: '16px', color, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(44);
    this.tweens.add({ targets: text, y: y - 20, alpha: 0, duration: 700, onComplete: () => text.destroy() });
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
        if (record.amount > 0) this.hurtAt.set(record.targetId, this.time.now);
        if (record.targetId === this.player.id && record.amount > 0) this.onPlayerHurt(record.amount, record.tags.includes('dot'));
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
        if (event.unitId === this.player.id) this.swing = { at: this.time.now, angle: event.angle, arc: event.arc };
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
      case 'explosion': {
        const fx = this.add.graphics().setDepth(29);
        const color = ELEMENTS[event.element].color;
        fx.fillStyle(color, 0.25).fillCircle(event.x, event.y, event.radius);
        fx.lineStyle(2, color, 0.9).strokeCircle(event.x, event.y, event.radius);
        this.tweens.add({ targets: fx, alpha: 0, scale: 1.15, duration: 350, onComplete: () => fx.destroy() });
        break;
      }
      case 'shieldBroke': {
        const unit = this.world.units.get(event.unitId);
        if (!unit) break;
        if (unit === this.player) {
          this.callout(unit, `${event.name}が砕けた`, '#c9d8e8');
          this.cameras.main.shake(100, 0.004);
        }
        const fx = this.add.graphics().setDepth(41);
        fx.lineStyle(3, 0xc9d8e8, 1);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          fx.lineBetween(unit.x + Math.cos(a) * 20, unit.y + Math.sin(a) * 20, unit.x + Math.cos(a) * 34, unit.y + Math.sin(a) * 34);
        }
        this.tweens.add({ targets: fx, alpha: 0, duration: 400, onComplete: () => fx.destroy() });
        break;
      }
      case 'shieldReady': {
        if (event.unitId === this.player.id) this.callout(this.player, '盾を張り直した', '#9fb7c9');
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
      case 'died': {
        if (this.lockTarget?.id === event.unitId) this.lockTarget = null;
        const fx = this.add.graphics().setDepth(29);
        const color = event.kind ? ENEMIES[event.kind].look.color : 0x8a7454;
        fx.fillStyle(color, 0.7).fillCircle(event.x, event.y, 18);
        this.tweens.add({ targets: fx, alpha: 0, scale: 2.2, duration: 400, onComplete: () => fx.destroy() });
        if (event.kind === 'oilBloat') this.cameras.main.shake(140, 0.005);
        if (event.kind && enemyDef(event.kind).boss) {
          // 大物が倒れた。大きく揺らし、灰が舞う
          this.cameras.main.shake(600, 0.016);
          this.cameras.main.flash(400, 200, 160, 120);
          fx.fillStyle(0xc8bca0, 0.5).fillCircle(event.x, event.y, 60);
          this.callout(this.player, `${event.name}を討ち果たした`, '#e8d8a8');
        }
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
        if (event.unitId === this.player.id) this.pendingKind = event.action.type === 'melee' ? 'melee' : 'other';
        this.telegraphs.push({
          unitId: event.unitId,
          skill: event.skill,
          angle: event.angle,
          start: this.world.time,
          at: event.at,
          action: event.action,
          element: event.element,
          aim: event.aim,
        });
        break;
      }
      case 'takeOff': {
        const unit = this.world.units.get(event.unitId);
        if (unit) this.callout(unit, '飛び上がった', '#e0a070');
        this.cameras.main.shake(200, 0.004);
        break;
      }
      case 'landed': {
        // 降りた所に土煙
        const fx = this.add.graphics().setDepth(29);
        fx.fillStyle(0x8a7a62, 0.35).fillEllipse(event.x, event.y + 30, 220, 70);
        this.tweens.add({ targets: fx, alpha: 0, scaleX: 1.4, duration: 600, onComplete: () => fx.destroy() });
        this.cameras.main.shake(260, 0.012);
        break;
      }
      case 'rite': {
        const unit = this.world.units.get(event.unitId);
        if (unit) this.callout(unit, `${event.name}(儀式 ${event.count})`, '#e8d8a8');
        break;
      }
      case 'riteReleased': {
        const unit = this.world.units.get(event.unitId);
        if (!unit) break;
        // 重ねた儀式を一度に放つ。多いほど大きく
        this.callout(unit, `儀式 ×${event.names.length} ‹${event.names.join('・')}›`, '#f0d890');
        if (event.names.length >= 3) this.cameras.main.flash(180, 140, 120, 60);
        const fx = this.add.graphics().setDepth(29);
        fx.lineStyle(3, 0xe8d8a8, 0.9).strokeCircle(unit.x, unit.y, 30 + event.names.length * 10);
        this.tweens.add({ targets: fx, alpha: 0, scale: 1.6, duration: 450, onComplete: () => fx.destroy() });
        break;
      }
      case 'enraged': {
        const unit = this.world.units.get(event.unitId);
        if (unit) this.callout(unit, event.label, '#ff5a3a');
        this.cameras.main.flash(260, 120, 30, 20);
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
      case 'blink': {
        // 影の跡を残して移る
        const fx = this.add.graphics().setDepth(29);
        fx.fillStyle(0x2a1a3a, 0.6).fillCircle(event.from.x, event.from.y, 16);
        fx.lineStyle(2, 0x6a5a8a, 0.5).lineBetween(event.from.x, event.from.y, event.to.x, event.to.y);
        this.tweens.add({ targets: fx, alpha: 0, duration: 450, onComplete: () => fx.destroy() });
        break;
      }
      case 'summoned': {
        const fx = this.add.graphics().setDepth(29);
        fx.lineStyle(2, 0x8a9a5a, 0.9).strokeCircle(event.x, event.y, 22);
        this.tweens.add({ targets: fx, alpha: 0, scale: 1.6, duration: 500, onComplete: () => fx.destroy() });
        break;
      }
      case 'form': {
        if (event.unitId !== this.player.id) break;
        this.callout(this.player, event.name, `#${FORMS[event.form].color.toString(16).padStart(6, '0')}`);
        this.openUnlock('forms');
        break;
      }
      case 'fervor': {
        if (event.unitId !== this.player.id) break;
        this.callout(this.player, '昂り', '#f0c060');
        this.cameras.main.flash(160, 120, 90, 30);
        break;
      }
      case 'floorChanged': {
        this.floatText(event.x, event.y, `${FIELDS[event.to].name}になった`, '#c9b79c');
        break;
      }
      case 'missed': {
        const unit = this.world.units.get(event.unitId);
        if (unit) this.floatText(unit.x, unit.y - 30, '外れ', '#8a7aaa');
        break;
      }
      case 'warded': {
        const unit = this.world.units.get(event.unitId);
        if (unit) this.callout(unit, `${event.label}が護った`, '#f0e0a0');
        break;
      }
      case 'healed': {
        const unit = this.world.units.get(event.unitId);
        if (unit && event.amount >= 1) this.floatText(unit.x, unit.y - 30, `+${Math.round(event.amount)}`, '#8ad07a');
        break;
      }
      case 'dodged': {
        // 踏んだ所に土埃と残像
        const unit = this.world.units.get(event.unitId);
        if (!unit || unit !== this.player) break;
        const fx = this.add.graphics().setDepth(0.5);
        fx.fillStyle(0x8a7a62, 0.35).fillEllipse(unit.x, unit.y + PLAYER_ART.feet, 40, 12);
        this.tweens.add({ targets: fx, alpha: 0, duration: 350, onComplete: () => fx.destroy() });
        const ghost = this.add
          .image(this.playerSprite.x, this.playerSprite.y, this.playerSprite.texture.key, this.playerSprite.frame.name)
          .setScale(PLAYER_ART.scale)
          .setOrigin(0.5, PLAYER_ART.originY)
          .setFlipX(this.playerSprite.flipX)
          .setTint(0x9fc4e8)
          .setAlpha(0.5)
          .setDepth(this.playerSprite.depth - 0.001);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 260, onComplete: () => ghost.destroy() });
        break;
      }
      case 'statusEnded':
      case 'imbue':
        break;
    }
  }
}
