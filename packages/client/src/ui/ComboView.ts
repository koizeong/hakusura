import { COMBOS, type ComboId, type DamageRecord } from '@hakusura/core';
import { formatNumber, h } from './dom';

/** 連鎖や条件が絡んだヒットが途切れずに続くと数える。この間あくと途切れる */
const STREAK_GAP = 2000;
/** コンボの名前を出しておく時間 */
const COMBO_SHOW = 1800;

interface ComboLine {
  el: HTMLElement;
  count: HTMLElement;
  hits: number;
  until: number;
}

/** 画面右に、続いている連の数と成立したコンボの名前を出す */
export class ComboView {
  readonly el = h('div', { class: 'combo' });
  private streakEl = h('div', { class: 'streak' });
  private streakCount = h('b', {});
  private streakDamage = h('small', {});
  private list = h('div', { class: 'combo-list' });
  private streak = 0;
  private streakTotal = 0;
  private lastStreakAt = -Infinity;
  private lines = new Map<ComboId, ComboLine>();

  constructor() {
    this.streakEl.append(this.streakCount, h('span', {}, '連'), this.streakDamage);
    this.el.append(this.streakEl, this.list);
  }

  /** 自分の与ダメージを1件ずつ渡す */
  push(record: DamageRecord, now: number): void {
    const counts = record.depth > 0 || record.combos.length > 0;
    if (!counts) return;
    if (now - this.lastStreakAt > STREAK_GAP) {
      this.streak = 0;
      this.streakTotal = 0;
    }
    this.streak += 1;
    this.streakTotal += record.amount;
    this.lastStreakAt = now;
    this.streakCount.textContent = String(this.streak);
    this.streakDamage.textContent = formatNumber(this.streakTotal);
    this.streakEl.classList.remove('pop');
    void this.streakEl.offsetWidth;
    this.streakEl.classList.add('pop');

    for (const id of record.combos) {
      let line = this.lines.get(id);
      if (!line) {
        const count = h('span', { class: 'count' });
        const color = `#${COMBOS[id].color.toString(16).padStart(6, '0')}`;
        line = { el: h('div', { class: 'combo-line', style: `color:${color}` }, h('span', { class: 'name' }, COMBOS[id].name), count), count, hits: 0, until: 0 };
        this.lines.set(id, line);
        this.list.prepend(line.el);
      }
      line.hits += 1;
      line.until = now + COMBO_SHOW;
      line.count.textContent = line.hits > 1 ? `×${line.hits}` : '';
      line.el.classList.remove('pop');
      void line.el.offsetWidth;
      line.el.classList.add('pop');
    }
  }

  update(now: number): void {
    this.streakEl.classList.toggle('shown', this.streak >= 2 && now - this.lastStreakAt <= STREAK_GAP);
    for (const [id, line] of this.lines) {
      if (line.until > now) continue;
      line.el.remove();
      this.lines.delete(id);
    }
  }
}
