import {
  ACTIVE_SKILLS,
  ACTIVE_SKILL_IDS,
  DEFAULT_TACTICS,
  TACTIC_CONDITIONS,
  TACTIC_CONDITION_IDS,
  type ActiveSkillId,
  type Tactic,
  type TacticConditionId,
} from '@hakusura/core';
import { h } from './dom';

const STORAGE_KEY = 'hakusura.tactics';

/** 作戦に入れられるスキル。切り札と敵のスキルは除く */
const TACTIC_SKILLS = ACTIVE_SKILL_IDS.filter((id) => {
  const tags: readonly string[] = ACTIVE_SKILLS[id].tags;
  return !tags.includes('trump') && !tags.includes('enemy');
});

export function loadTactics(): Tactic[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Tactic[] | null;
    if (Array.isArray(saved) && saved.every((t) => t.skill in ACTIVE_SKILLS && t.condition in TACTIC_CONDITIONS)) return saved;
  } catch {
    // 読めなければ既定の作戦にする
  }
  return DEFAULT_TACTICS.map((t) => ({ ...t }));
}

function saveTactics(tactics: Tactic[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tactics));
  } catch {
    // 保存できなくても、この場では効く
  }
}

/** 作戦の編集。tactics をその場で書き換える */
export function createTacticsEditor(tactics: Tactic[]): HTMLElement {
  const root = h('div', { class: 'tactics' });

  const changed = () => {
    saveTactics(tactics);
    render();
  };

  const render = () => {
    root.replaceChildren(
      ...tactics.map((t, i) =>
        h(
          'div',
          { class: `tactic${t.enabled ? '' : ' off'}` },
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
            h('span', { class: 'then' }, 'なら'),
            h(
              'select',
              {
                onchange: (e: Event) => {
                  t.skill = (e.target as HTMLSelectElement).value as ActiveSkillId;
                  changed();
                },
              },
              ...TACTIC_SKILLS.map((id) => h('option', { value: id, selected: id === t.skill }, ACTIVE_SKILLS[id].name)),
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
        ),
      ),
      h(
        'div',
        { class: 'tactic-actions' },
        h('button', { onclick: () => (tactics.push({ skill: TACTIC_SKILLS[0]!, condition: 'always', enabled: true }), changed()) }, '作戦を足す'),
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

  const swap = (a: number, b: number) => {
    const tmp = tactics[a]!;
    tactics[a] = tactics[b]!;
    tactics[b] = tmp;
  };

  render();
  return root;
}
