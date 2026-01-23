// WoW 직업 및 전문화 이미지 매핑
// 이미지는 public/images/specs/ 폴더에 넣어주세요
// 파일명 형식: {class}-{spec}.webp (예: priest-holy.webp)

// 직업 ID (Warcraft Logs API classID 기준)
// 1=Death Knight, 2=Druid, 3=Hunter, 4=Mage, 5=Monk, 
// 6=Paladin, 7=Priest, 8=Rogue, 9=Shaman, 10=Warlock, 
// 11=Warrior, 12=Demon Hunter, 13=Evoker
export const CLASS_INFO: Record<number, { name: string; slug: string; color: string }> = {
  1: { name: 'Death Knight', slug: 'deathknight', color: '#C41F3B' },
  2: { name: 'Druid', slug: 'druid', color: '#FF7D0A' },
  3: { name: 'Hunter', slug: 'hunter', color: '#ABD473' },
  4: { name: 'Mage', slug: 'mage', color: '#69CCF0' },
  5: { name: 'Monk', slug: 'monk', color: '#00FF96' },
  6: { name: 'Paladin', slug: 'paladin', color: '#F58CBA' },
  7: { name: 'Priest', slug: 'priest', color: '#FFFFFF' },
  8: { name: 'Rogue', slug: 'rogue', color: '#FFF569' },
  9: { name: 'Shaman', slug: 'shaman', color: '#0070DE' },
  10: { name: 'Warlock', slug: 'warlock', color: '#9482C9' },
  11: { name: 'Warrior', slug: 'warrior', color: '#C79C6E' },
  12: { name: 'Demon Hunter', slug: 'demonhunter', color: '#A330C9' },
  13: { name: 'Evoker', slug: 'evoker', color: '#33937F' },
};

// 전문화 이름 -> slug 변환
const SPEC_SLUG_MAP: Record<string, string> = {
  // Death Knight
  'Blood': 'blood',
  'Frost': 'frost',
  'Unholy': 'unholy',
  // Druid
  'Balance': 'balance',
  'Feral': 'feral',
  'Guardian': 'guardian',
  'Restoration': 'restoration',
  // Hunter
  'BeastMastery': 'beastmastery',
  'Marksmanship': 'marksmanship',
  'Survival': 'survival',
  // Mage
  'Arcane': 'arcane',
  'Fire': 'fire',
  // Monk
  'Brewmaster': 'brewmaster',
  'Mistweaver': 'mistweaver',
  'Windwalker': 'windwalker',
  // Paladin
  'Holy': 'holy',
  'Protection': 'protection',
  'Retribution': 'retribution',
  // Priest
  'Discipline': 'discipline',
  'Shadow': 'shadow',
  // Rogue
  'Assassination': 'assassination',
  'Outlaw': 'outlaw',
  'Subtlety': 'subtlety',
  // Shaman
  'Elemental': 'elemental',
  'Enhancement': 'enhancement',
  // Warlock
  'Affliction': 'affliction',
  'Demonology': 'demonology',
  'Destruction': 'destruction',
  // Warrior
  'Arms': 'arms',
  'Fury': 'fury',
  // Demon Hunter
  'Havoc': 'havoc',
  'Vengeance': 'vengeance',
  // Evoker
  'Devastation': 'devastation',
  'Preservation': 'preservation',
  'Augmentation': 'augmentation',
};

/**
 * 전문화 이미지 경로 가져오기
 * @param classID - Warcraft Logs API classID
 * @param specName - 전문화 이름 (예: "Holy", "Frost")
 * @returns 이미지 경로 (예: "/images/specs/priest-holy.webp")
 */
export function getSpecImage(classID: number, specName: string): string | null {
  const classInfo = CLASS_INFO[classID];
  if (!classInfo) return null;
  
  // 전문화 이름에서 첫 단어만 추출 (예: "Frost Death Knight" -> "Frost")
  const specKey = specName.split(' ')[0];
  const specSlug = SPEC_SLUG_MAP[specKey];
  
  if (!specSlug) {
    console.warn(`알 수 없는 전문화: ${specName}`);
    return null;
  }
  
  // 이미지 경로 생성: /images/specs/{class}-{spec}.webp
  return `/images/specs/${classInfo.slug}-${specSlug}.webp`;
}

/**
 * 직업 이름 가져오기
 */
export function getClassName(classID: number): string {
  return CLASS_INFO[classID]?.name || 'Unknown';
}

/**
 * 직업 색상 가져오기
 */
export function getClassColor(classID: number): string {
  return CLASS_INFO[classID]?.color || '#888888';
}

/**
 * 특정 분석 항목 숨김 설정
 * 키: 분석 항목 ID (예: 'starFragment')
 * 값: 숨길 직업 및 전문화 목록
 */
export const HIDDEN_ANALYSIS_CONFIG: Record<string, Array<{ classID: number; specs: string[] }>> = {
  starFragment: [
    { classID: 1, specs: ['Frost', 'Unholy'] }, // Death Knight
    { classID: 2, specs: ['Feral']},
    { classID: 5, specs: ['Windwalker']},
    { classID: 6, specs: ['Retribution']},
    { classID: 8, specs: ['Assassination','Outlaw','Subtlety']},
    { classID: 11, specs: ['Arms','Fury']},
    { classID: 12, specs: ['Havoc']},
  ],
};

// 힐러 스펙 목록 (판별용)
export const HEALER_SPECS = [
  'Restoration', 'Holy', 'Discipline', 'Mistweaver', 'Preservation'
];

// 탱커 스펙 목록
export const TANK_SPECS = [
  'Blood', 'Guardian', 'Brewmaster', 'Protection', 'Vengeance'
];

// 힐러 직업별 8넴 항성핵 딜량 평가 기준 (단위: Damage)
// [상] >= high
// [중] >= medium
// [하] < medium
export const HEALER_PHASE_DAMAGE_THRESHOLDS: Record<number, { 
  high: number; 
  medium: number;
  specs?: Record<string, { high: number; medium: number }>;
}> = {
  2: { high: 12800000, medium: 8000000 }, // Druid
  5: { high: 16000000, medium: 10500000 }, // Monk
  6: { high: 18600000, medium: 11800000 }, // Paladin
  7: { 
    high: 5000000, medium: 3000000,
    specs: {
      'Discipline': { high: 18500000, medium: 14000000 },
      'Holy': { high: 29000000, medium: 21000000 }
    }
  }, // Priest
  9: { high: 27500000, medium: 17000000 }, // Shaman
  13: { high: 17100000, medium: 12900000 }, // Evoker
};
