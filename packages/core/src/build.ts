import { ACTIVE_SKILLS, TRUMP_SKILL_IDS, activeSkillDef, isTechnique, techniqueFits, type ActiveSkillDef, type ActiveSkillId } from './data/skills';
import { variantProblem, type SkillVariant } from './data/variations';
import { PASSIVES, type PassiveId } from './data/passives';
import { CONDITIONS } from './data/conditions';
import { ARTIFACTS } from './data/artifacts';
import { AFFIXES, ARMOR_MATERIALS, EQUIP_SLOTS, EQUIP_SLOT_IDS, itemShield, itemTotal, itemWeapon, type EquipSlotId, type Item } from './data/equipment';
import { SHIELD_TYPES, type ShieldSpec } from './data/shields';
import { ELEMENTS } from './data/elements';
import { gripOf } from './data/grips';
import { ATTRIBUTE_IDS, ATTRIBUTE_RULES, baseAttributes, expToNext, pointsAtLevel, spentPoints, type Attributes } from './data/attributes';
import type { ExpeditionId } from './data/expeditions';
import { WEAPON_TEMPERS, WEAPON_TYPES, type WeaponSpec } from './data/weapons';
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
  /** 能力値。キャラが持ち、振り直しはできない。なければ全て基礎値 */
  attributes?: Attributes;
  /** 技の型。拾った変化つきの技で、元の技を差し替える */
  variants?: Partial<Record<ActiveSkillId, SkillVariant>>;
}

/**
 * キャラ。1キャラ1ビルドで、遠征で経験値を得てレベルが上がり、能力値の点数が増える。
 * 作り分けはキャラを増やして行う。拾い物の山と覚えたスキルは全キャラで共有する
 */
export interface Character {
  id: string;
  name: string;
  createdAt: number;
  level: number;
  /** 今のレベルで貯めた経験値 */
  exp: number;
  build: Build;
  /** 遠征に出ている間だけある。この間は戦えない */
  expedition?: Expedition;
  /** 負傷して戻ったなら、治る時刻。それまで戦えず、遠征にも出せない */
  injuredUntil?: number;
}

/** 遠征の行き先と、出た・戻る時刻 */
export interface Expedition {
  destination: ExpeditionId;
  startedAt: number;
  endsAt: number;
  /** 持ち帰る物を決める乱数の種 */
  seed: number;
  /** 送り出したときのビルド。強さはこれで測る */
  build?: Build;
}

/** 新しいキャラ。Lv1、能力値は基礎のまま */
export function newCharacter(id: string, name: string, now: number, build: Omit<Build, 'attributes'>): Character {
  return { id, name, createdAt: now, level: 1, exp: 0, build: { ...build, attributes: baseAttributes() } };
}

/** 経験値を足す。上がったレベルの数を返す。上限のレベルでは経験値は貯まらない */
export function addExp(c: Character, exp: number): number {
  const before = c.level;
  c.exp += Math.max(0, Math.round(exp));
  while (c.level < ATTRIBUTE_RULES.maxLevel && c.exp >= expToNext(c.level)) {
    c.exp -= expToNext(c.level);
    c.level++;
  }
  if (c.level >= ATTRIBUTE_RULES.maxLevel) c.exp = 0;
  return c.level - before;
}

/** キャラが振れる点数の合計 */
export function characterPoints(c: Character): number {
  return pointsAtLevel(c.level);
}

/** まだ振っていない点数 */
export function unspentPoints(c: Character): number {
  return characterPoints(c) - spentPoints(c.build.attributes ?? baseAttributes());
}

/** 振った点数に足りるレベル(前の保存を引き継ぐとき用) */
export function levelForPoints(points: number): number {
  let level = 1;
  while (level < ATTRIBUTE_RULES.maxLevel && pointsAtLevel(level) < points) level++;
  return level;
}

/** 作戦に入れられるアクティブ。切り札と敵のスキルは除く */
export const BUILD_ACTIVE_IDS = (Object.keys(ACTIVE_SKILLS) as ActiveSkillId[]).filter((id) => {
  const tags: readonly string[] = ACTIVE_SKILLS[id].tags;
  return !tags.includes('trump') && !tags.includes('enemy');
});

/** 決まりに合わない点を並べる。空なら組める */
export function buildProblems(build: Build, points: number = ATTRIBUTE_RULES.startPoints): string[] {
  const out: string[] = [];
  if (build.actives.length > BUILD_LIMITS.actives) out.push(`アクティブは${BUILD_LIMITS.actives}個まで`);
  if (build.actives.length + build.passives.length > BUILD_LIMITS.skills) out.push(`スキルは合わせて${BUILD_LIMITS.skills}個まで`);
  for (const [slot, item] of Object.entries(build.equipment) as [EquipSlotId, Item][]) {
    if (!canEquip(item, slot)) out.push(`${item.name}は${EQUIP_SLOTS[slot].name}に着けられない`);
  }
  const attrs = build.attributes ?? baseAttributes();
  if (spentPoints(attrs) > points) out.push(`能力値は${points}点まで振れる`);
  if (ATTRIBUTE_IDS.some((id) => attrs[id] < ATTRIBUTE_RULES.base)) out.push(`能力値は${ATTRIBUTE_RULES.base}より下げられない`);
  return out;
}

/** ビルドで着けている武器(枠の順)。なければ素手 */
export function buildWeapons(build: Build): WeaponSpec[] {
  const weapons = (['weapon1', 'weapon2'] as const).flatMap((slot) => {
    const item = build.equipment[slot];
    const w = item && !item.artifact ? itemWeapon(item) : undefined;
    return w ? [w] : [];
  });
  return weapons.length > 0 ? weapons : [{ type: 'fists' }];
}

/** 重さの決まり。担える重さは base に筋力1点ごとに perStr を足したもの */
export const WEIGHT_RULES = { base: 15, perStr: 1 } as const;

/** 着けている物の重さの合計 */
export function buildWeight(build: Build): number {
  return Object.values(build.equipment).reduce((sum, item) => sum + (item ? itemWeight(item) : 0), 0);
}

/** 1つの装備の重さ。装飾品とアーティファクトは重さがない */
export function itemWeight(item: Item): number {
  if (item.artifact) return 0;
  if (item.weaponType) return WEAPON_TYPES[item.weaponType].weight;
  if (item.shieldType) return SHIELD_TYPES[item.shieldType].weight;
  if (item.material) return ARMOR_MATERIALS[item.material].weight;
  return item.kind === 'armor' ? 3 : 0;
}

/** 担える重さ。超えると鈍重になる */
export function weightCapacity(attrs: Attributes): number {
  return WEIGHT_RULES.base + attrs.str * WEIGHT_RULES.perStr;
}

/** ビルドで着けている盾(枠の順) */
export function buildShields(build: Build): ShieldSpec[] {
  return (['weapon1', 'weapon2'] as const).flatMap((slot) => {
    const item = build.equipment[slot];
    const s = item && !item.artifact ? itemShield(item) : undefined;
    return s ? [s] : [];
  });
}

/** 今の武器では使えない技。作戦に入れても出ない */
export function unusableActives(build: Build): ActiveSkillId[] {
  const weapons = buildWeapons(build);
  return build.actives.filter((id) => {
    const def = activeSkillDef(id);
    return isTechnique(def) && !weapons.some((w) => techniqueFits(def, w));
  });
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
  unit.attributes = { ...(build.attributes ?? baseAttributes()) };
  unit.variants = { ...(build.variants ?? {}) };
  // 武器と盾の数で持ち方が決まる。二刀流で左右の補正値の合計が同じなら、そのタグも付く
  const weapons = (['weapon1', 'weapon2'] as const).map((s) => build.equipment[s]).filter((i): i is Item => !!i && !i.artifact && !!i.weaponType);
  unit.weapons = weapons.map((i) => itemWeapon(i)!);
  unit.hand = 0;
  // 盾は、同じ盾を着け直しただけなら張り直しの残りを保つ
  const before = unit.shields;
  unit.shields = buildShields(build).map((spec, i) => {
    const old = before[i];
    return old && old.type === spec.type && old.element === spec.element ? old : { ...spec, readyAt: 0, ready: true };
  });
  unit.grip = gripOf(weapons.length, unit.shields.length);
  unit.tags = [unit.grip];
  // 重さが担える重さを超えると鈍重になる
  if (buildWeight(build) > weightCapacity(unit.attributes)) unit.tags.push('overweight');
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
  if (b.attributes !== undefined) {
    const a = b.attributes as Record<string, unknown>;
    if (!a || typeof a !== 'object' || !ATTRIBUTE_IDS.every((id) => typeof a[id] === 'number' && Number.isFinite(a[id]))) return '能力値が壊れている';
  }
  if (b.variants !== undefined) {
    if (!b.variants || typeof b.variants !== 'object') return '技の型が壊れている';
    for (const [id, v] of Object.entries(b.variants as Record<string, SkillVariant>)) {
      const def = (ACTIVE_SKILLS as Record<string, ActiveSkillDef>)[id];
      if (!def || !isTechnique(def) || !v || v.base !== id || typeof v.id !== 'string') return '技の型が壊れている';
      const problem = variantProblem(v, def.technique);
      if (problem) return `技の型:${problem}`;
    }
  }
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
    if (item.weaponType !== undefined && !(item.weaponType in WEAPON_TYPES)) return '知らない武器がある';
    if (item.element !== undefined && !(item.element in ELEMENTS)) return '知らない属性がある';
    if (item.tempers !== undefined && (!Array.isArray(item.tempers) || !item.tempers.every((t) => t in WEAPON_TEMPERS))) return '知らない性質がある';
    if (item.shieldType !== undefined && !(item.shieldType in SHIELD_TYPES)) return '知らない盾がある';
    if (item.material !== undefined && !(item.material in ARMOR_MATERIALS)) return '知らない素材がある';
  }
  return null;
}
