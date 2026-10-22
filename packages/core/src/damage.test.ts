import { describe, expect, it } from 'vitest';
import { computeDamage } from './damage';

const tags = new Set(['fire', 'melee']);

describe('computeDamage', () => {
  it('補正がなければ威力そのまま', () => {
    expect(computeDamage({ power: 10, hitTags: tags, modifiers: [], ruleBonuses: [], resist: 0 })).toBe(10);
  });

  it('同じ種類の補正は加算する', () => {
    const modifiers = [
      { tags: ['fire'], value: 0.3 },
      { tags: ['fire'], value: 0.2 },
    ];
    expect(computeDamage({ power: 10, hitTags: tags, modifiers, ruleBonuses: [], resist: 0 })).toBeCloseTo(15);
  });

  it('違う種類の補正は乗算する', () => {
    const modifiers = [
      { tags: ['fire'], value: 0.3 },
      { tags: ['melee'], value: 0.2 },
    ];
    expect(computeDamage({ power: 10, hitTags: tags, modifiers, ruleBonuses: [], resist: 0 })).toBeCloseTo(15.6);
  });

  it('タグが合わない補正は効かない', () => {
    const modifiers = [{ tags: ['lightning'], value: 1 }];
    expect(computeDamage({ power: 10, hitTags: tags, modifiers, ruleBonuses: [], resist: 0 })).toBe(10);
  });

  it('ルールの補正は別の種類として乗算する', () => {
    const damage = computeDamage({
      power: 10,
      hitTags: tags,
      modifiers: [{ tags: ['fire'], value: 1 }],
      ruleBonuses: [{ label: '濡れで倍', add: 1 }],
      resist: 0,
    });
    expect(damage).toBeCloseTo(40);
  });

  it('耐性で減り、弱点で増える', () => {
    expect(computeDamage({ power: 10, hitTags: tags, modifiers: [], ruleBonuses: [], resist: 0.5 })).toBeCloseTo(5);
    expect(computeDamage({ power: 10, hitTags: tags, modifiers: [], ruleBonuses: [], resist: -0.5 })).toBeCloseTo(15);
  });

  it('負にはならない', () => {
    expect(computeDamage({ power: 10, hitTags: tags, modifiers: [], ruleBonuses: [], resist: 2 })).toBe(0);
  });
});
