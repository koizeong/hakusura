import { ACTIVE_SKILLS, FERVOR, FIELDS, MARKS, MARK_IDS, SKILL_CATEGORIES, STATUSES, STATUS_IDS, type ActiveSkillId, type CombatWorld, type Unit } from '@hakusura/core';
import { ACTIVE_SLOT_ACTIONS, bindingLabel, type Keybinds } from '../input/keybinds';
import { ART_SLOT_NAMES, HAND_ART_SLOTS, blessingTier, isHandArt, type ArtSlot } from '@hakusura/core';
import { statusIconUrl } from '../art/icons';
import { h } from './dom';
import type { BattleMode } from './TrainingPanel';

interface SlotView {
  key: HTMLElement;
  shade: HTMLElement;
}

export interface HudActions {
  onTrump(): void;
  onSpeed(): void;
  onBreakdown(): void;
  onBuild(): void;
  onStep(): void;
  /** 手で撃つ印の技(壱・弐) */
  onArt(slot: ArtSlot): void;
}

/** 画面下の体力・状態・スキル枠と、自動のときの切り札・早送り */
export class Hud {
  readonly el: HTMLElement;
  private hpFill: HTMLElement;
  /** 減った分を遅れて縮める白い帯。どれだけ削られたかが見える */
  private hpLag: HTMLElement;
  private lagRatio = 1;
  private vignette: HTMLElement;
  private fervorFill: HTMLElement;
  private hpText: HTMLElement;
  private statuses: HTMLElement;
  private slots: SlotView[] = [];
  private dodge: SlotView;
  private guard: SlotView;
  private lock: HTMLElement;
  private lastStatusHtml = '';
  private lockKey = '';
  private mode: BattleMode = 'auto';
  /** 自動のときに並べる、作戦のスキルのクールダウン */
  private autoSkills = new Map<ActiveSkillId, { shade: HTMLElement; marks: HTMLElement; chip: HTMLElement }>();
  private autoKey = '';
  private autoBar: HTMLElement;
  private trumpButton: HTMLButtonElement;
  /** 手で撃つ印の技のボタン(壱・弐) */
  private artButtons = new Map<ArtSlot, { button: HTMLButtonElement; shade: HTMLElement; key: HTMLElement; name: HTMLElement; need: HTMLElement; shown: string }>();
  /** 自動のときのステップ。切り札の隣に置く */
  private stepButton: HTMLButtonElement;
  private stepShade: HTMLElement;
  private stepKey: HTMLElement;
  private trumpShade: HTMLElement;
  private trumpKey: HTMLElement;
  private trumpName: HTMLElement;
  private trumpLabel: HTMLElement;
  private speedButton: HTMLButtonElement;
  private hint: HTMLElement;
  private activeSlots: HTMLElement;
  private buildButton!: HTMLButtonElement;
  private binds?: Keybinds;

  constructor(
    private slotSkills: readonly (ActiveSkillId | null)[],
    private dodgeCooldown: number,
    private stepCooldown: number,
    private trump: ActiveSkillId | undefined,
    actions: HudActions,
  ) {
    this.hpFill = h('div', { class: 'hp-fill' });
    this.hpLag = h('div', { class: 'hp-lag' });
    this.vignette = h('div', { class: 'hurt-vignette' });
    this.fervorFill = h('div', { class: 'fervor-fill' });
    this.hpText = h('span', { class: 'hp-text' });
    this.statuses = h('div', { class: 'own-statuses' });
    this.activeSlots = h('div', { class: 'active-slots' });
    this.setSlots(slotSkills);
    this.dodge = { key: h('span', { class: 'key' }), shade: h('div', { class: 'shade' }) };
    this.guard = { key: h('span', { class: 'key' }), shade: h('div', { class: 'shade' }) };
    this.lock = h('div', { class: 'lock' });
    this.autoBar = h('div', { class: 'auto-skills' });
    this.trumpShade = h('div', { class: 'shade' });
    this.trumpKey = h('span', { class: 'key' });
    this.trumpName = h('span', { class: 'name' }, trump ? ACTIVE_SKILLS[trump].name : 'なし');
    this.trumpLabel = h('span', { class: 'label' }, '切り札');
    this.trumpButton = h(
      'button',
      { class: 'trump', onclick: (e: Event) => (actions.onTrump(), (e.currentTarget as HTMLElement).blur()) },
      this.trumpShade,
      this.trumpKey,
      this.trumpLabel,
      this.trumpName,
    );
    this.stepShade = h('div', { class: 'shade' });
    this.stepKey = h('span', { class: 'key' });
    this.stepButton = h(
      'button',
      { class: 'step', onclick: (e: Event) => (actions.onStep(), (e.currentTarget as HTMLElement).blur()) },
      this.stepShade,
      this.stepKey,
      h('span', { class: 'label' }, '見切り'),
      h('span', { class: 'name' }, 'ステップ'),
    );
    for (const slot of HAND_ART_SLOTS) {
      const view = { shade: h('div', { class: 'shade' }), key: h('span', { class: 'key' }), name: h('span', { class: 'name' }, '—'), need: h('span', { class: 'need' }), shown: '' };
      const button = h(
        'button',
        { class: 'hand-art', onclick: (e: Event) => (actions.onArt(slot), (e.currentTarget as HTMLElement).blur()) },
        view.shade,
        view.key,
        view.need,
        view.name,
      ) as HTMLButtonElement;
      this.artButtons.set(slot, { ...view, button });
    }
    this.speedButton = h('button', { class: 'speed', onclick: (e: Event) => (actions.onSpeed(), (e.currentTarget as HTMLElement).blur()) }, '×1');
    const breakdownButton = h(
      'button',
      { class: 'breakdown-button', onclick: (e: Event) => (actions.onBreakdown(), (e.currentTarget as HTMLElement).blur()) },
      '勘定',
    );
    const buildButton = (this.buildButton = h('button', { class: 'build-button', onclick: (e: Event) => (actions.onBuild(), (e.currentTarget as HTMLElement).blur()) }, '支度'));
    this.hint = h('p', { class: 'hint' });
    this.el = h(
      'div',
      { class: 'hud' },
      this.vignette,
      h('div', { class: 'corner' }, buildButton, this.speedButton, breakdownButton),
      h(
        'div',
        { class: 'bottom' },
        this.lock,
        this.statuses,
        h('div', { class: 'hp' }, this.hpLag, this.hpFill, this.hpText),
        // 昂り。コンボと型で溜まり、満ちると切り札が早く戻る
        h('div', { class: 'fervor', title: '昂り' }, this.fervorFill),
        h(
          'div',
          { class: 'slots manual-only' },
          this.activeSlots,
          h('div', { class: 'slot dodge' }, this.dodge.shade, this.dodge.key, h('span', { class: 'name' }, '回避'), h('span', { class: 'cat' }, '見切り')),
          h('div', { class: 'slot' }, this.guard.shade, this.guard.key, h('span', { class: 'name' }, 'ガード'), h('span', { class: 'cat' }, '弾き')),
        ),
        h('div', { class: 'auto-row auto-only' }, this.autoBar, ...[...this.artButtons.values()].map((v) => v.button), this.stepButton, this.trumpButton),
        this.hint,
      ),
    );
  }

  setMode(mode: BattleMode): void {
    this.mode = mode;
    this.el.classList.toggle('auto', mode === 'auto');
    this.el.classList.toggle('manual', mode === 'manual');
    this.hint.textContent =
      mode === 'auto'
        ? 'スキルは作戦どおりに出る / 地面をタップで歩く / 敵をタップで狙いを定める'
        : 'WASD 移動 / マウスで狙う / 敵の予兆が満ちる直前に回避かガード / Tab 傷の勘定';
  }

  setTrump(skill: ActiveSkillId | undefined): void {
    this.trump = skill;
    this.trumpName.textContent = skill ? ACTIVE_SKILLS[skill].name : 'なし';
  }

  /** まだ振っていない点数や、遠征から戻った者がいれば、支度のボタンに出す */
  setNotice(points: number, returned: number): void {
    const marks = [returned > 0 ? `帰還${returned}` : '', points > 0 ? `点${points}` : ''].filter(Boolean);
    const text = marks.length > 0 ? `支度・${marks.join('・')}` : '支度';
    if (this.buildButton.textContent !== text) this.buildButton.textContent = text;
    this.buildButton.classList.toggle('notice', marks.length > 0);
  }

  setSpeed(speed: number): void {
    this.speedButton.textContent = `×${speed}`;
  }

  /** 手動のときの6枠。ビルドのアクティブを順に入れる */
  setSlots(skills: readonly (ActiveSkillId | null)[], nameOf?: (skill: ActiveSkillId) => string): void {
    this.slotSkills = ACTIVE_SLOT_ACTIONS.map((_, i) => skills[i] ?? null);
    this.slots = [];
    this.activeSlots.replaceChildren(
      ...this.slotSkills.map((skill) => {
        const view = { key: h('span', { class: 'key' }), shade: h('div', { class: 'shade' }) };
        this.slots.push(view);
        const def = skill ? ACTIVE_SKILLS[skill] : null;
        return h(
          'div',
          { class: `slot${def ? '' : ' empty'}` },
          view.shade,
          view.key,
          h('span', { class: 'name' }, skill && nameOf ? nameOf(skill) : (def?.name ?? '—')),
          h('span', { class: 'cat' }, def ? SKILL_CATEGORIES[def.category] : ''),
        );
      }),
    );
    if (this.binds) this.setKeybinds(this.binds);
  }

  setKeybinds(binds: Keybinds): void {
    this.binds = binds;
    ACTIVE_SLOT_ACTIONS.forEach((action, i) => (this.slots[i]!.key.textContent = bindingLabel(binds[action])));
    this.dodge.key.textContent = bindingLabel(binds.dodge);
    this.guard.key.textContent = bindingLabel(binds.guard);
    this.trumpKey.textContent = bindingLabel(binds.trump);
    this.stepKey.textContent = bindingLabel(binds.step);
    for (const [slot, view] of this.artButtons) view.key.textContent = bindingLabel(binds[slot as 'art1' | 'art2']);
    this.lockKey = bindingLabel(binds.lockOn);
  }

  update(world: CombatWorld, player: Unit, dodgeReadyAt: number, lockTarget: Unit | null, trumpQueued = false): void {
    const lockText =
      this.mode === 'auto'
        ? lockTarget
          ? `狙い:${lockTarget.name}(もう一度タップで外す)`
          : '狙い:一番近い敵'
        : lockTarget
          ? `捕捉:${lockTarget.name}(ホイールで切り替え)`
          : `${this.lockKey} でターゲット固定`;
    if (this.lock.textContent !== lockText) this.lock.textContent = lockText;
    this.lock.classList.toggle('on', !!lockTarget);

    this.fervorFill.style.width = `${Math.min(100, (player.fervor / FERVOR.max) * 100)}%`;
    const ratio = Math.max(0, player.hp / player.maxHp);
    this.hpFill.style.width = `${ratio * 100}%`;
    // 削られた分は少し残してから縮める。回復したらすぐ追いつく
    this.lagRatio = ratio >= this.lagRatio ? ratio : this.lagRatio + (ratio - this.lagRatio) * 0.06;
    this.hpLag.style.width = `${this.lagRatio * 100}%`;
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    const cooldownLeft = (skill: ActiveSkillId) => Math.max(0, (player.cooldowns[skill] ?? 0) - world.time) / (player.cooldownSpans[skill] ?? 1);

    if (this.mode === 'manual') {
      this.slotSkills.forEach((skill, i) => {
        if (skill) this.slots[i]!.shade.style.height = `${cooldownLeft(skill) * 100}%`;
      });
      this.dodge.shade.style.height = `${(Math.max(0, dodgeReadyAt - world.time) / this.dodgeCooldown) * 100}%`;
      this.guard.shade.parentElement!.classList.toggle('active', player.guardSince !== null);
    } else {
      this.updateAutoSkills(world, player, cooldownLeft);
      const trumpLeft = this.trump ? cooldownLeft(this.trump) : 1;
      this.trumpShade.style.height = `${trumpLeft * 100}%`;
      this.trumpButton.disabled = !this.trump || trumpLeft > 0;
      this.trumpButton.classList.toggle('queued', trumpQueued);
      this.trumpLabel.textContent = trumpQueued ? '構え中' : '切り札';
      // ステップの戻り
      const stepLeft = Math.max(0, dodgeReadyAt - world.time) / this.stepCooldown;
      this.stepShade.style.height = `${Math.min(1, stepLeft) * 100}%`;
      this.stepButton.disabled = stepLeft > 0;
      this.updateHandArts(world, player, cooldownLeft);
    }

    const parts: string[] = [];
    for (const id of STATUS_IDS) {
      const st = player.statuses[id];
      const icon = `<img class="st-icon" src="${statusIconUrl(id)}" alt="">`;
      if (world.isActive(player, id)) parts.push(`<b style="color:#${STATUSES[id].color.toString(16).padStart(6, '0')}">${icon}${STATUSES[id].name}</b>`);
      else if (st.buildup > 1) parts.push(`<span>${icon}${STATUSES[id].name} ${Math.round((st.buildup / STATUSES[id].max) * 100)}%</span>`);
    }
    // 杖の魔力の高まり。コンボが続くほど溜まる
    const growth = world.comboGrowthOf(player);
    const stacks = world.comboStacksOf(player);
    if (growth && stacks > 0) parts.push(`<b class="rite">${growth.label} ${stacks}(+${Math.round(stacks * growth.perStack * 100)}%)</b>`);
    // 弓・銃・投石紐の狙いの締まり。同じ相手に当て続けるほど溜まる
    const focus = world.focusGrowthOf(player);
    const focusStacks = world.focusStacksOf(player);
    if (focus && focusStacks > 1) parts.push(`<b class="rite">${focus.label} ${focusStacks}(+${Math.round(focusStacks * focus.perStack * 100)}%)</b>`);
    // 印。生む札で溜まり、使う札で効く
    for (const id of MARK_IDS) {
      const n = world.marksOf(player, id);
      // 生成力(溜まっている量で、札から得る印が何倍になるか)
      const growth = world.markGrowthOf(player, id);
      // 抱えの恩恵の段(10・100・1000・10000で1段ずつ)
      const tier = blessingTier(n);
      if (n > 0) parts.push(`<b style="color:#${MARKS[id].color.toString(16).padStart(6, '0')}">〈${MARKS[id].name}〉${n}${tier > 0 ? `<small> 恩恵${'◆'.repeat(tier)}</small>` : ''}${growth >= 1.1 ? `<small> 生成×${growth.toFixed(1)}</small>` : ''}</b>`);
    }
    const rites = player.rites.filter((r) => r.until > world.time);
    if (rites.length > 0) parts.push(`<b class="rite">儀式 ${rites.length}:${rites.map((r) => r.name).join('・')}</b>`);
    for (const buff of player.buffs) {
      if (buff.until > world.time && buff.charges > 0) parts.push(`<b class="buff">${buff.label}</b>`);
    }
    if (player.imbue && player.imbue.until > world.time) {
      parts.push(`<b class="imbue">${ACTIVE_SKILLS[player.imbue.skill].name} ${((player.imbue.until - world.time) / 1000).toFixed(1)}秒</b>`);
    }
    // 盾。張られていれば名前、砕けていれば張り直すまでの秒数
    for (const s of player.shields) {
      parts.push(s.ready ? `<b class="shield">盾</b>` : `<span class="shield-down">盾 ${Math.ceil((s.readyAt - world.time) / 1000)}秒</span>`);
    }
    if (world.weatherCall) {
      parts.push(`<b class="weather">${FIELDS[world.weatherCall.field].name} ${((world.weatherCall.until - world.time) / 1000).toFixed(1)}秒</b>`);
    } else if (world.weather) {
      parts.push(`<b class="weather">${FIELDS[world.weather].name}</b>`);
    }
    // 立っている床
    for (const name of new Set(world.floorsUnder(player).map((f) => FIELDS[f.field].name))) parts.push(`<span class="floor">${name}の上</span>`);
    const html = parts.join('');
    if (html !== this.lastStatusHtml) {
      this.lastStatusHtml = html;
      this.statuses.innerHTML = html;
    }
  }

  /** 被弾したとき、画面の縁を赤く滲ませる。重い一撃ほど濃い */
  hurt(ratio: number): void {
    const v = this.vignette;
    v.style.transition = 'none';
    v.style.opacity = String(Math.min(0.9, 0.3 + ratio * 4));
    void v.offsetWidth;
    v.style.transition = 'opacity 0.45s ease-out';
    v.style.opacity = '0';
  }

  /** 手で撃つ印の技。印があといくつ要るかを出し、足りたら光る */
  private updateHandArts(world: CombatWorld, player: Unit, cooldownLeft: (skill: ActiveSkillId) => number): void {
    for (const [slot, view] of this.artButtons) {
      const art = player.actives.includes(slot) ? player.arts[slot] : undefined;
      if (!art) {
        if (view.shown !== '') {
          view.shown = '';
          view.name.textContent = '—';
          view.need.textContent = ART_SLOT_NAMES[slot].replace('印の技・', '');
          view.button.style.borderColor = '';
        }
        view.button.disabled = true;
        view.button.classList.remove('ready');
        view.shade.style.height = '0%';
        continue;
      }
      const have = world.marksOf(player, art.mark);
      const need = `${MARKS[art.mark].name} ${Math.min(have, art.cost)}/${art.cost}`;
      if (view.shown !== art.id + need) {
        view.shown = art.id + need;
        view.name.textContent = art.name;
        view.need.textContent = need;
        const color = `#${MARKS[art.mark].color.toString(16).padStart(6, '0')}`;
        view.need.style.color = color;
        view.button.style.borderColor = color;
      }
      const left = cooldownLeft(slot);
      view.shade.style.height = `${(have >= art.cost ? left : 1 - have / art.cost) * 100}%`;
      const ready = have >= art.cost && left <= 0;
      view.button.disabled = !ready;
      view.button.classList.toggle('ready', ready);
    }
  }

  /** 作戦に入っているスキルを1つずつ並べ、クールダウンを見せる */
  private updateAutoSkills(world: CombatWorld, player: Unit, cooldownLeft: (skill: ActiveSkillId) => number): void {
    // 手で撃つ枠は、下のボタンに出す
    const skills = [...new Set(player.tactics.filter((t) => t.enabled && player.actives.includes(t.skill) && !isHandArt(t.skill)).map((t) => t.skill))];
    // 印の技の枠は、入れた技が替われば作り直す
    const key = skills.map((s) => world.skillName(player, s)).join();
    if (key !== this.autoKey) {
      this.autoKey = key;
      this.autoSkills.clear();
      this.autoBar.replaceChildren(
        ...skills.map((skill) => {
          const shade = h('div', { class: 'shade' });
          const marks = h('span', { class: 'mark-need' });
          const chip = h('div', { class: 'chip' }, shade, h('span', { class: 'name' }, world.skillName(player, skill)), marks);
          this.autoSkills.set(skill, { shade, marks, chip });
          return chip;
        }),
      );
    }
    for (const [skill, view] of this.autoSkills) {
      view.shade.style.height = `${cooldownLeft(skill) * 100}%`;
      // 印の技は、印があといくつ要るかを出す。足りない間は暗く、溜まったら光る
      // 印を保つ技は「研ぎ 3/5以上」、使う技は「研ぎ 3/10」
      const spend = world.markCostOf(player, skill);
      const hold = world.markHoldOf(skill);
      const cost = spend ?? (hold ? { mark: hold.mark, amount: hold.min } : undefined);
      if (cost) {
        const have = world.marksOf(player, cost.mark);
        const text = `${MARKS[cost.mark].name} ${Math.min(have, cost.amount)}/${cost.amount}${spend ? '' : '以上'}`;
        if (view.marks.textContent !== text) view.marks.textContent = text;
        view.marks.style.color = `#${MARKS[cost.mark].color.toString(16).padStart(6, '0')}`;
        view.chip.classList.toggle('starved', have < cost.amount);
        view.chip.classList.toggle('charged', have >= cost.amount);
      }
    }
  }
}
