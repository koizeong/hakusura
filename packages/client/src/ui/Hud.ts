import { ACTIVE_SKILLS, SKILL_CATEGORIES, STATUSES, STATUS_IDS, type ActiveSkillId, type CombatWorld, type Unit } from '@hakusura/core';
import { ACTIVE_SLOT_ACTIONS, bindingLabel, type Keybinds } from '../input/keybinds';
import { h } from './dom';

interface SlotView {
  key: HTMLElement;
  shade: HTMLElement;
}

/** 画面下の体力・状態・スキル枠 */
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

  constructor(
    private slotSkills: readonly (ActiveSkillId | null)[],
    private dodgeCooldown: number,
  ) {
    this.hpFill = h('div', { class: 'hp-fill' });
    this.hpText = h('span', { class: 'hp-text' });
    this.statuses = h('div', { class: 'own-statuses' });
    const slotEls = slotSkills.map((skill) => {
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
    });
    this.dodge = { key: h('span', { class: 'key' }), shade: h('div', { class: 'shade' }) };
    this.guard = { key: h('span', { class: 'key' }), shade: h('div', { class: 'shade' }) };
    this.lock = h('div', { class: 'lock' });
    this.el = h(
      'div',
      { class: 'hud' },
      this.lock,
      this.statuses,
      h('div', { class: 'hp' }, this.hpFill, this.hpText),
      h(
        'div',
        { class: 'slots' },
        ...slotEls,
        h('div', { class: 'slot dodge' }, this.dodge.shade, this.dodge.key, h('span', { class: 'name' }, '回避'), h('span', { class: 'cat' }, '見切り')),
        h('div', { class: 'slot' }, this.guard.shade, this.guard.key, h('span', { class: 'name' }, 'ガード'), h('span', { class: 'cat' }, '弾き')),
      ),
      h('p', { class: 'hint' }, 'WASD 移動 / マウスで狙う / 敵の予兆が満ちる直前に回避かガード / Tab 傷の勘定'),
    );
  }

  setKeybinds(binds: Keybinds): void {
    ACTIVE_SLOT_ACTIONS.forEach((action, i) => (this.slots[i]!.key.textContent = bindingLabel(binds[action])));
    this.dodge.key.textContent = bindingLabel(binds.dodge);
    this.guard.key.textContent = bindingLabel(binds.guard);
    this.lockKey = bindingLabel(binds.lockOn);
  }

  update(world: CombatWorld, player: Unit, dodgeReadyAt: number, lockTarget: Unit | null): void {
    const lockText = lockTarget ? `捕捉:${lockTarget.name}(ホイールで切り替え)` : `${this.lockKey} でターゲット固定`;
    if (this.lock.textContent !== lockText) this.lock.textContent = lockText;
    this.lock.classList.toggle('on', !!lockTarget);
    this.guard.shade.style.height = player.guardSince !== null ? '0%' : '';
    this.guard.shade.parentElement!.classList.toggle('active', player.guardSince !== null);
    this.hpFill.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.slotSkills.forEach((skill, i) => {
      if (!skill) return;
      const readyAt = player.cooldowns[skill] ?? 0;
      const left = Math.max(0, readyAt - world.time) / ACTIVE_SKILLS[skill].cooldown;
      this.slots[i]!.shade.style.height = `${left * 100}%`;
    });
    this.dodge.shade.style.height = `${(Math.max(0, dodgeReadyAt - world.time) / this.dodgeCooldown) * 100}%`;

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
    const html = parts.join('');
    if (html !== this.lastStatusHtml) {
      this.lastStatusHtml = html;
      this.statuses.innerHTML = html;
    }
  }
}
