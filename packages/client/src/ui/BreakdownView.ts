import { ELEMENTS, type Breakdown, type BreakdownRow } from '@hakusura/core';
import { formatNumber, h, percent } from './dom';

/** Tab で開く与ダメージの内訳 */
export class BreakdownView {
  readonly el = h('div', { class: 'breakdown hidden' });

  get visible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
  }

  render(b: Breakdown): void {
    if (!this.visible) return;
    const elementColor = (key: string) => {
      const def = (ELEMENTS as Record<string, { name: string; color: number }>)[key];
      return def ? `#${def.color.toString(16).padStart(6, '0')}` : undefined;
    };
    this.el.replaceChildren(
      h('h2', {}, '傷の勘定'),
      h(
        'p',
        { class: 'totals' },
        `合計 ${formatNumber(b.total)}  /  DPS ${formatNumber(b.dps)}  /  ${b.hits} ヒット  /  ${b.duration.toFixed(1)} 秒`,
      ),
      b.hits === 0 ? h('p', { class: 'empty' }, 'まだ誰も傷ついていない。') : '',
      h(
        'div',
        { class: 'tables' },
        table('発動元', b.bySource),
        table('スキル', b.bySkill),
        table(
          '属性',
          b.byElement.map((r) => ({ ...r, key: ELEMENTS[r.element].name })),
          (_, i) => elementColor(b.byElement[i]!.element),
        ),
        table('条件文・パッシブ', b.byVia, undefined, '1ヒットに複数が関わると、それぞれに数える'),
      ),
      h('p', { class: 'hint' }, 'Tab で閉じる'),
    );
  }
}

function table(title: string, rows: BreakdownRow[], colorOf?: (r: BreakdownRow, i: number) => string | undefined, note?: string) {
  return h(
    'section',
    {},
    h('h3', {}, title),
    note ? h('small', {}, note) : null,
    h(
      'table',
      {},
      h('tr', {}, h('th', {}, '名前'), h('th', {}, '合計'), h('th', {}, '割合'), h('th', {}, 'DPS'), h('th', {}, '回数')),
      ...rows.map((r, i) => {
        const color = colorOf?.(r, i);
        return h(
          'tr',
          {},
          h('td', color ? { style: `color:${color}` } : {}, r.key),
          h('td', {}, formatNumber(r.damage)),
          h(
            'td',
            { class: 'share' },
            h('span', { class: 'bar', style: `width:${Math.min(100, r.share * 100)}%` }),
            h('span', {}, percent(r.share, 1)),
          ),
          h('td', {}, formatNumber(r.dps)),
          h('td', {}, String(r.hits)),
        );
      }),
    ),
  );
}
