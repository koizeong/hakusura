import { ACTIVE_SKILLS, TRUMP_SKILL_IDS, type ActiveSkillId } from './data/skills';
import { PASSIVES, type PassiveId } from './data/passives';
import { CONDITIONS } from './data/conditions';
import { ARTIFACTS } from './data/artifacts';
import { AFFIXES, EQUIP_SLOTS, EQUIP_SLOT_IDS, itemTotal, type EquipSlotId, type Item } from './data/equipment';
import { gripOf } from './data/grips';
import { TACTIC_CONDITIONS, type Tactic } from './data/tactics';
import type { CombatWorld, Unit } from './world';

/** ビルドの枠。docs/plan.md の「ビルド枠の構成」 */
export const BUILD_LIMITS = {
  /** スキル枠の合計(パッシブ専用6 + 兼用9) */
  skills: 15,
  /** アクティブの上限 */
  actives: 6,
  /** 兼用枠の残りは必ずパッシブになる */
  passiveOnly: 6,
} as const;

/** 1人分のビルド。これを書き出したものがビルドコード */
export interface Build {
  actives: ActiveSkillId[];
  passives: PassiveId[];
  equipment: Partial<Record<EquipSlotId, Item>>;
  trump?: ActiveSkillId;
  tactics: Tactic[];
}

/** 作戦に入れられるアクティブ。切り札と敵のスキルは除く */
export const BUILD_ACTIVE_IDS = (Object.keys(ACTIVE_SKILLS) as ActiveSkillId[]).filter((id) => {
  const tags: readonly string[] = ACTIVE_SKILLS[id].tags;
  return !tags.includes('trump') && !tags.includes('enemy');
});

/** 決まりに合わない点を並べる。空なら組める */
export function buildProblems(build: Build): string[] {
  const out: string[] = [];
  if (build.actives.length > BUILD_LIMITS.actives) out.push(`アクティブは${BUILD_LIMITS.actives}個まで`);
  if (build.actives.length + build.passives.length > BUILD_LIMITS.skills) out.push(`スキルは合わせて${BUILD_LIMITS.skills}個まで`);
  for (const [slot, item] of Object.entries(build.equipment) as [EquipSlotId, Item][]) {
    if (!canEquip(item, slot)) out.push(`${item.name}は${EQUIP_SLOTS[slot].name}に着けられない`);
  }
  return out;
}

/**
 * その部位に着けられるか。防具は決まった部位、武器は武器の枠、装飾品は装飾品の枠。
 * アーティファクトは、着けられる部位が決まるまで装飾品の枠に着ける
 */
export function canEquip(item: Item, slot: EquipSlotId): boolean {
  const kind = EQUIP_SLOTS[slot].kind;
  if (item.artifact) return kind === 'accessory';
  if (item.kind === 'armor') return item.slot === slot;
  return item.kind === kind;
}

/** ビルドを戦う者に反映する。最大HPは基礎値に補正をかけ直し、減っていた割合を保つ */
export function applyBuild(world: CombatWorld, unit: Unit, build: Build): void {
  const items = EQUIP_SLOT_IDS.map((s) => build.equipment[s]).filter((i): i is Item => !!i);
  unit.actives = [...build.actives];
  unit.passives = [...build.passives];
  unit.equipment = items.filter((i) => !i.artifact);
  unit.artifacts = items.flatMap((i) => (i.artifact ? [i.artifact] : []));
  unit.conditions = items.flatMap((i) => (i.condition ? [i.condition] : []));
  unit.trump = build.trump;
  // 武器の数で持ち方が決まる。二刀流で左右の補正値の合計が同じなら、そのタグも付く
  const weapons = (['weapon1', 'weapon2'] as const).map((s) => build.equipment[s]).filter((i): i is Item => !!i && !i.artifact);
  unit.grip = gripOf(weapons.length);
  unit.tags = [unit.grip];
  if (weapons.length === 2 && itemTotal(weapons[0]!) === itemTotal(weapons[1]!)) unit.tags.push('dualTotalsEqual');
  unit.tactics = build.tactics.map((t) => ({ ...t }));
  const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
  unit.maxHp = Math.max(1, Math.round(unit.baseMaxHp * world.statOf(unit, 'maxHp')));
  unit.hp = Math.max(1, Math.min(unit.maxHp, Math.round(unit.maxHp * ratio)));
}

const CODE_PREFIX = 'HKB1.';

/** ビルドコードに書き出す。仲間と見せ合える文字列 */
export function encodeBuild(build: Build): string {
  return CODE_PREFIX + toBase64Url(utf8Encode(JSON.stringify(build)));
}

/** ビルドコードを読み込む。知らない部品が入っていれば理由を添えて失敗する */
export function decodeBuild(code: string): { build: Build } | { error: string } {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return { error: 'ビルドコードではない' };
  let raw: unknown;
  try {
    raw = JSON.parse(utf8Decode(fromBase64Url(trimmed.slice(CODE_PREFIX.length))));
  } catch {
    return { error: 'ビルドコードが壊れている' };
  }
  const error = validateBuild(raw);
  return error ? { error } : { build: raw as Build };
}

// core はブラウザにもサーバーにも依存しないので、Base64 と UTF-8 の変換を自前で持つ
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(text: string): number[] {
  return encodeURIComponent(text)
    .split(/(%[0-9A-F]{2})/i)
    .filter(Boolean)
    .flatMap((part) => (part.startsWith('%') ? [parseInt(part.slice(1), 16)] : [...part].map((c) => c.charCodeAt(0))));
}

function utf8Decode(bytes: number[]): string {
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
}

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((v) => B64[v]);
    out += chars.slice(0, Math.ceil(((Math.min(3, bytes.length - i)) * 8) / 6)).join('');
  }
  return out;
}

function fromBase64Url(text: string): number[] {
  const values = [...text].map((c) => {
    const v = B64.indexOf(c);
    if (v < 0) throw new Error('Base64 ではない');
    return v;
  });
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const n = (values[i]! << 18) | ((values[i + 1] ?? 0) << 12) | ((values[i + 2] ?? 0) << 6) | (values[i + 3] ?? 0);
    const len = Math.min(4, values.length - i);
    out.push((n >> 16) & 255);
    if (len > 2) out.push((n >> 8) & 255);
    if (len > 3) out.push(n & 255);
  }
  return out;
}

function validateBuild(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return '中身がない';
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.actives) || !b.actives.every((id) => id in ACTIVE_SKILLS)) return '知らないアクティブがある';
  if (!Array.isArray(b.passives) || !b.passives.every((id) => id in PASSIVES)) return '知らないパッシブがある';
  if (b.trump !== undefined && !(TRUMP_SKILL_IDS as unknown[]).includes(b.trump)) return '知らない切り札がある';
  if (!Array.isArray(b.tactics)) return '作戦がない';
  for (const t of b.tactics as Tactic[]) {
    if (!(t?.skill in ACTIVE_SKILLS) || !(t?.condition in TACTIC_CONDITIONS)) return '作戦に知らない部品がある';
  }
  if (!b.equipment || typeof b.equipment !== 'object') return '装備がない';
  for (const [slot, item] of Object.entries(b.equipment as Record<string, Item>)) {
    if (!(slot in EQUIP_SLOTS)) return '知らない部位がある';
    if (!item || typeof item.name !== 'string' || !Array.isArray(item.affixes)) return '装備が壊れている';
    if (!item.affixes.every((a) => a.affix in AFFIXES && typeof a.value === 'number' && Number.isFinite(a.value))) return '知らない補正値がある';
    if (item.condition !== undefined && !(item.condition in CONDITIONS)) return '知らない条件文がある';
    if (item.artifact !== undefined && !(item.artifact in ARTIFACTS)) return '知らないアーティファクトがある';
  }
  return null;
}
