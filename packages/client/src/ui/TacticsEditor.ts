import { ACTIVE_SKILLS, DEFAULT_TACTICS, TACTIC_CONDITIONS, TACTIC_CONDITION_IDS, type ActiveSkillId, type Tactic, type TacticConditionId } from '@hakusura/core';
import { h } from './dom';

export interface TacticsEditorOptions {
  /** 作戦に入れられるスキル。ビルドに入れたアクティブ */
  skills(): readonly ActiveSkillId[];
  onChange(): void;
}

/** 作戦の編集。tactics をその場で書き換える */
export function createTacticsEditor(tactics: Tactic[], options: TacticsEditorOptions): { el: HTMLElement; render(): void } {
  const root = h('div', { class: 'tactics' });

  const changed = () => {
    options.onChange();
    render();
  };

  const swap = (a: number, b: number) => {
    const tmp = tactics[a]!;
    tactics[a] = tactics[b]!;
    tactics[b] = tmp;
  };

  const render = () => {
    const skills = options.skills();
    root.replaceChildren(
      ...tactics.map((t, i) => {
        const missing = !skills.includes(t.skill);
        return h(
          'div',
          { class: `tactic${t.enabled ? '' : ' off'}${missing ? ' missing' : ''}` },
          h('span', { class: 'order' }, String(i + 1)),
          h(
            'div',
            { class: 'fields' },
            h(
              'select',
              {
                onchange: (e: Event) => {
                  t.condition = (e.target as HTMLSelectElement).value as TacticConditionId;
                  changed();
                },
              },
              ...TACTIC_CONDITION_IDS.map((id) => h('option', { value: id, selected: id === t.condition }, TACTIC_CONDITIONS[id].label)),
            ),
            h('span', { class: 'then' }, missing ? 'なら(このスキルはビルドに入っていない)' : 'なら'),
            h(
              'select',
              {
                onchange: (e: Event) => {
                  t.skill = (e.target as HTMLSelectElement).value as ActiveSkillId;
                  changed();
                },
              },
              ...[...new Set([...skills, t.skill])].map((id) => h('option', { value: id, selected: id === t.skill }, ACTIVE_SKILLS[id].name)),
            ),
          ),
          h(
            'div',
            { class: 'ops' },
            h('button', { title: '上へ', disabled: i === 0, onclick: () => (swap(i, i - 1), changed()) }, '▲'),
            h('button', { title: '下へ', disabled: i === tactics.length - 1, onclick: () => (swap(i, i + 1), changed()) }, '▼'),
            h('button', { title: t.enabled ? '止める' : '使う', onclick: () => ((t.enabled = !t.enabled), changed()) }, t.enabled ? '●' : '○'),
            h('button', { title: '消す', onclick: () => (tactics.splice(i, 1), changed()) }, '✕'),
          ),
        );
      }),
      h(
        'div',
        { class: 'tactic-actions' },
        h(
          'button',
          {
            disabled: skills.length === 0,
            onclick: () => (tactics.push({ skill: skills[0]!, condition: 'always', enabled: true }), changed()),
          },
          '作戦を足す',
        ),
        h(
          'button',
          {
            onclick: () => {
              tactics.splice(0, tactics.length, ...DEFAULT_TACTICS.map((t) => ({ ...t })));
              changed();
            },
          },
          '元に戻す',
        ),
      ),
      h('small', {}, '上から順に見て、条件に合い、使えるものを1つ使う。届かなければ寄っていく'),
    );
  };

  render();
  return { el: root, render };
}
