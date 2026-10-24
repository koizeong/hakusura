import { ACTIVE_SKILLS, SKILL_CATEGORIES, STATUSES, STATUS_IDS, type ActiveSkillId, type CombatWorld, type Unit } from '@hakusura/core';
import { ACTIVE_SLOT_ACTIONS, bindingLabel, type Keybinds } from '../input/keybinds';
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
}

/** 画面下の体力・状態・スキル枠と、自動のときの切り札・早送り */
export class Hud {
  readonly el: HTMLElement;
  private hpFill: HTMLElement;
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
  private autoSkills = new Map<ActiveSkillId, HTMLElement>();
  private autoBar: HTMLElement;
  private trumpButton: HTMLButtonElement;
  private trumpShade: HTMLElement;
  private trumpKey: HTMLElement;
  private trumpName: HTMLElement;
  private trumpLabel: HTMLElement;
  private speedButton: HTMLButtonElement;
  private hint: HTMLElement;
  private activeSlots: HTMLElement;
  private binds?: Keybinds;

  constructor(
    private slotSkills: readonly (ActiveSkillId | null)[],
    private dodgeCooldown: number,
    private trump: ActiveSkillId | undefined,
    actions: HudActions,
  ) {
    this.hpFill = h('div', { class: 'hp-fill' });
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
    this.speedButton = h('button', { class: 'speed', onclick: (e: Event) => (actions.onSpeed(), (e.currentTarget as HTMLElement).blur()) }, '×1');
    const breakdownButton = h(
      'button',
      { class: 'breakdown-button', onclick: (e: Event) => (actions.onBreakdown(), (e.currentTarget as HTMLElement).blur()) },
      '勘定',
    );
    const buildButton = h('button', { class: 'build-button', onclick: (e: Event) => (actions.onBuild(), (e.currentTarget as HTMLElement).blur()) }, '支度');
    this.hint = h('p', { class: 'hint' });
    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'corner' }, buildButton, this.speedButton, breakdownButton),
      h(
        'div',
        { class: 'bottom' },
        this.lock,
        this.statuses,
        h('div', { class: 'hp' }, this.hpFill, this.hpText),
        h(
          'div',
          { class: 'slots manual-only' },
          this.activeSlots,
          h('div', { class: 'slot dodge' }, this.dodge.shade, this.dodge.key, h('span', { class: 'name' }, '回避'), h('span', { class: 'cat' }, '見切り')),
          h('div', { class: 'slot' }, this.guard.shade, this.guard.key, h('span', { class: 'name' }, 'ガード'), h('span', { class: 'cat' }, '弾き')),
        ),
        h('div', { class: 'auto-row auto-only' }, this.autoBar, this.trumpButton),
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

  setSpeed(speed: number): void {
    this.speedButton.textContent = `×${speed}`;
  }

  /** 手動のときの6枠。ビルドのアクティブを順に入れる */
  setSlots(skills: readonly (ActiveSkillId | null)[]): void {
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
          h('span', { class: 'name' }, def?.name ?? '—'),
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

    this.hpFill.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    const cooldownLeft = (skill: ActiveSkillId) => Math.max(0, (player.cooldowns[skill] ?? 0) - world.time) / (player.cooldownSpans[skill] ?? 1);

    if (this.mode === 'manual') {
      this.slotSkills.forEach((skill, i) => {
        if (skill) this.slots[i]!.shade.style.height = `${cooldownLeft(skill) * 100}%`;
      });
      this.dodge.shade.style.height = `${(Math.max(0, dodgeReadyAt - world.time) / this.dodgeCooldown) * 100}%`;
      this.guard.shade.parentElement!.classList.toggle('active', player.guardSince !== null);
    } else {
      this.updateAutoSkills(player, cooldownLeft);
      const trumpLeft = this.trump ? cooldownLeft(this.trump) : 1;
      this.trumpShade.style.height = `${trumpLeft * 100}%`;
      this.trumpButton.disabled = !this.trump || trumpLeft > 0;
      this.trumpButton.classList.toggle('queued', trumpQueued);
      this.trumpLabel.textContent = trumpQueued ? '構え中' : '切り札';
    }

    const parts: string[] = [];
    for (const id of STATUS_IDS) {
      const st = player.statuses[id];
      if (world.isActive(player, id)) parts.push(`<b style="color:#${STATUSES[id].color.toString(16).padStart(6, '0')}">${STATUSES[id].name}</b>`);
      else if (st.buildup > 1) parts.push(`<span>${STATUSES[id].name} ${Math.round((st.buildup / STATUSES[id].max) * 100)}%</span>`);
    }
    for (const buff of player.buffs) {
      if (buff.until > world.time && buff.charges > 0) parts.push(`<b class="buff">${buff.label}</b>`);
    }
    if (player.imbue && player.imbue.until > world.time) {
      parts.push(`<b class="imbue">${ACTIVE_SKILLS[player.imbue.skill].name} ${((player.imbue.until - world.time) / 1000).toFixed(1)}秒</b>`);
    }
    if (world.weatherCall) {
      parts.push(`<b class="weather">雨 ${((world.weatherCall.until - world.time) / 1000).toFixed(1)}秒</b>`);
    }
    const html = parts.join('');
    if (html !== this.lastStatusHtml) {
      this.lastStatusHtml = html;
      this.statuses.innerHTML = html;
    }
  }

  /** 作戦に入っているスキルを1つずつ並べ、クールダウンを見せる */
  private updateAutoSkills(player: Unit, cooldownLeft: (skill: ActiveSkillId) => number): void {
    const skills = [...new Set(player.tactics.filter((t) => t.enabled && player.actives.includes(t.skill)).map((t) => t.skill))];
    if (skills.join() !== [...this.autoSkills.keys()].join()) {
      this.autoSkills.clear();
      this.autoBar.replaceChildren(
        ...skills.map((skill) => {
          const shade = h('div', { class: 'shade' });
          this.autoSkills.set(skill, shade);
          return h('div', { class: 'chip' }, shade, h('span', { class: 'name' }, ACTIVE_SKILLS[skill].name));
        }),
      );
    }
    for (const [skill, shade] of this.autoSkills) shade.style.height = `${cooldownLeft(skill) * 100}%`;
  }
}
