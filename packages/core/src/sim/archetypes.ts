import type { Build } from '../build';
import type { Attributes } from '../data/attributes';
import type { Item } from '../data/equipment';
import type { WeaponSpec } from '../data/weapons';
import type { ShieldTypeId } from '../data/shields';
import { DEFAULT_TACTICS, RITE_TACTICS, type Tactic } from '../data/tactics';

/**
 * 調整用の型どおりのビルド。どれも Lv30(能力値32点)で、武器だけを持つ。
 * 防具と装飾品は、シミュレーターが同じ数の拾い物からそれぞれ選ぶ
 */
export interface Archetype {
  name: string;
  /** 何で強くなるつもりのビルドか */
  idea: string;
  build: Build;
}

const attrs = (a: Partial<Attributes>): Attributes => ({ str: 8, dex: 8, int: 8, fai: 8, vit: 8, ...a });

const weapon = (id: string, spec: WeaponSpec): Item => ({ id: `w-${id}`, name: id, kind: 'weapon', weaponType: spec.type, element: spec.element, affixes: [] });
const shield = (id: string, type: ShieldTypeId): Item => ({ id: `s-${id}`, name: id, kind: 'weapon', shieldType: type, affixes: [] });

const always = (skill: Build['actives'][number], then?: Tactic['then']): Tactic => ({ skill, condition: 'always', enabled: true, ...(then ? { then } : {}) });

export const ARCHETYPES: Record<string, Archetype> = {
  starter: {
    name: '最初の巡礼者',
    idea: '剣と雷の短銃、燠火の塗油、雨乞い。いまの初期ビルド',
    build: {
      attributes: attrs({ str: 14, dex: 14, int: 16, fai: 12, vit: 16 }),
      actives: ['slash', 'shoot', 'emberOil'],
      passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
      equipment: { weapon1: weapon('sword', { type: 'ironSword' }), weapon2: weapon('gun', { type: 'capGun' }) },
      trump: 'rainBell',
      tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
    },
  },
  greatsword: {
    name: '大剣の両手持ち',
    idea: '筋力に振り、叩き割りの一撃で押す。近攻撃の火力',
    build: {
      attributes: attrs({ str: 28, vit: 20 }),
      actives: ['cleave', 'sweep', 'slash'],
      passives: ['heavyHand', 'whetstone', 'closeQuarters', 'thickSkin'],
      equipment: { weapon1: weapon('greatsword', { type: 'rustGreatsword' }) },
      trump: 'frenzyDraught',
      tactics: [always('cleave'), always('sweep'), always('slash')],
    },
  },
  bleedDual: {
    name: '二刀の短剣・出血',
    idea: '連撃と抉りで出血を溜め、瀉血・血の昂りで回す。手数と状態',
    build: {
      attributes: attrs({ dex: 26, str: 14, vit: 16 }),
      actives: ['gouge', 'flurry', 'bloodCut', 'slash'],
      passives: ['bloodletter', 'bloodRush', 'whetstone', 'closeQuarters'],
      equipment: { weapon1: weapon('dagger1', { type: 'dagger' }), weapon2: weapon('dagger2', { type: 'dagger' }) },
      trump: 'frenzyDraught',
      tactics: [{ skill: 'gouge', condition: 'targetNot:bleed', enabled: true }, always('bloodCut'), always('flurry'), always('slash')],
    },
  },
  archer: {
    name: '骨の短弓',
    idea: '技量に振り、狙い撃ちと三連射を離れて撃つ。燠火を塗った矢で燃やす。遠攻撃',
    build: {
      attributes: attrs({ dex: 30, vit: 18 }),
      // 守りのパッシブだけだったので、燠火の塗油と火に魅入られた者で攻めの手を持たせる
      actives: ['emberOil', 'boneVolley', 'aimedShot', 'volley', 'pierceShot', 'quickShot'],
      passives: ['fleetFoot', 'readTheBlow', 'pyromaniac'],
      equipment: { weapon1: weapon('bow', { type: 'boneBow' }) },
      trump: 'oilFlask',
      tactics: [{ skill: 'emberOil', condition: 'imbueOff', enabled: true }, always('boneVolley'), always('aimedShot'), always('volley'), always('pierceShot'), always('quickShot')],
    },
  },
  stormStaff: {
    name: '雷雨の術師',
    idea: '雷の杖で雨を呼び、濡れた敵に雷を重ねて連鎖させる。状態の相互作用',
    build: {
      attributes: attrs({ int: 30, vit: 18 }),
      actives: ['burstBolt', 'soulOrbs', 'discharge', 'shoot'],
      passives: ['stormCaller', 'stormFinger', 'sootPrayer'],
      equipment: { weapon1: weapon('staff', { type: 'staff', element: 'lightning' }) },
      trump: 'rainBell',
      tactics: [always('discharge'), always('burstBolt'), always('soulOrbs'), always('shoot')],
    },
  },
  oilFire: {
    name: '油火の斧',
    idea: '火の斧と火の投石紐で、油まみれを燃やす。床と炎上',
    build: {
      attributes: attrs({ fai: 24, str: 16, vit: 16 }),
      actives: ['emberOil', 'scorch', 'slash', 'shoot'],
      passives: ['oilSoaked', 'pyromaniac', 'emberHeart', 'sootPrayer'],
      equipment: { weapon1: weapon('axe', { type: 'cinderAxe', element: 'fire' }), weapon2: weapon('sling', { type: 'emberSling', element: 'fire' }) },
      trump: 'oilFlask',
      tactics: [{ skill: 'emberOil', condition: 'imbueOff', enabled: true }, always('scorch'), always('slash'), always('shoot')],
    },
  },
  rites: {
    name: '儀式の剣士',
    idea: '儀式を三つ重ねてから技で放つ。儀式の掛け算',
    build: {
      attributes: attrs({ str: 16, dex: 16, vit: 16, fai: 8, int: 8 }),
      actives: ['stillPrayer', 'whetRite', 'bloodOath', 'pyreOffering', 'slash', 'shoot'],
      passives: ['whetstone', 'bloodletter', 'closeQuarters', 'readTheBlow'],
      equipment: { weapon1: weapon('sword', { type: 'ironSword' }), weapon2: weapon('gun', { type: 'capGun' }) },
      trump: 'blessedPrayer',
      tactics: RITE_TACTICS.map((t) => ({ ...t })),
    },
  },
  shieldWall: {
    name: '大盾と弾き',
    idea: '体力に振り、盾と弾き・見切りで受けて返す。守り',
    build: {
      attributes: attrs({ str: 18, vit: 30 }),
      actives: ['lunge', 'breaker', 'slash'],
      passives: ['parryStance', 'readTheBlow', 'shatterRage', 'thickSkin'],
      equipment: { weapon1: weapon('sword', { type: 'ironSword' }), weapon2: shield('tower', 'towerShield') },
      trump: 'blessedPrayer',
      tactics: [{ skill: 'breaker', condition: 'targetNot:stun', enabled: true }, always('lunge'), always('slash')],
    },
  },
  hammer: {
    name: '戦槌の昏倒',
    idea: '地鳴りと崩しで昏倒させ、崩し打ちで叩く。打と昏倒',
    build: {
      attributes: attrs({ str: 30, vit: 18 }),
      actives: ['quake', 'breaker', 'slash'],
      passives: ['heavyHand', 'closeQuarters', 'thickSkin'],
      equipment: { weapon1: weapon('hammer', { type: 'warHammer' }) },
      trump: 'frenzyDraught',
      tactics: [always('quake'), { skill: 'breaker', condition: 'targetNot:stun', enabled: true }, always('slash')],
    },
  },
  riteLunge: {
    name: '儀式の踏み込み',
    idea: '儀式を重ねて穿ちの剣で踏み込む。繋ぎ(儀式→近攻撃)と満ちた祭壇で掛け算を重ねる(遊んだ人のビルドから)',
    build: {
      attributes: attrs({ str: 14, dex: 14, int: 16, fai: 16, vit: 12 }),
      actives: ['emberOil', 'stillPrayer', 'lunge', 'pyreOffering', 'bloodOath', 'whetRite'],
      passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance', 'pyromaniac', 'heavyHand'],
      equipment: { weapon1: weapon('sword', { type: 'ironSword', element: 'pierce' }) },
      trump: 'rainBell',
      tactics: [
        { skill: 'stillPrayer', condition: 'noRites', enabled: true, then: ['pyreOffering', 'bloodOath'] },
        { skill: 'whetRite', condition: 'last:bloodOath', enabled: true, then: ['lunge'] },
      ],
    },
  },
  gunRapid: {
    name: '雷の二丁銃',
    idea: '雷の短銃を両手に持ち、速射と散弾で手数を稼ぐ。遠距離の手数',
    build: {
      attributes: attrs({ dex: 22, int: 18, vit: 16 }),
      actives: ['quickShot', 'scatterShot', 'shoot', 'stormOil'],
      passives: ['stormFinger', 'sootPrayer', 'readTheBlow'],
      equipment: { weapon1: weapon('gun1', { type: 'capGun', element: 'lightning' }), weapon2: weapon('gun2', { type: 'capGun', element: 'lightning' }) },
      trump: 'rainBell',
      tactics: [{ skill: 'stormOil', condition: 'imbueOff', enabled: true }, always('scatterShot'), always('quickShot'), always('shoot')],
    },
  },
  spearStorm: {
    name: '雷の槍',
    idea: '雷の槍の突きと旋風。長い間合いの近接と感電',
    build: {
      attributes: attrs({ str: 20, dex: 20, vit: 16 }),
      actives: ['thrust', 'whirlwind', 'sweep', 'slash'],
      passives: ['heavyHand', 'closeQuarters', 'stormFinger'],
      equipment: { weapon1: weapon('spear', { type: 'stormSpear', element: 'lightning' }) },
      trump: 'rainBell',
      tactics: [always('thrust'), always('whirlwind'), always('sweep'), always('slash')],
    },
  },
  faithFire: {
    name: '火の祈祷師',
    idea: '信仰に振り、火の杖で祈りの奔流と炸裂弾。術と炎上',
    build: {
      attributes: attrs({ fai: 30, vit: 18 }),
      actives: ['prayerTorrent', 'burstBolt', 'soulOrbs', 'shoot'],
      passives: ['emberHeart', 'pyromaniac', 'sootPrayer'],
      equipment: { weapon1: weapon('staff', { type: 'staff', element: 'fire' }) },
      trump: 'oilFlask',
      tactics: [always('prayerTorrent'), always('burstBolt'), always('soulOrbs'), always('shoot')],
    },
  },
};
