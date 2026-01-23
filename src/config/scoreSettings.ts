// 기본 점수 가중치 설정
import type { SeasonScoreConfig, Role, RoleScoreWeights } from '../types';
import { ZONE_DATA } from '../api/warcraftLogs';

// 역할별 기본 가중치 (합계 100)
const defaultRoleWeights: Record<Role, RoleScoreWeights> = {
  Tank: { primary: 50, secondary: 50 },     // DPS: 50%, HPS: 50%
  Healer: { primary: 70, secondary: 30 },   // HPS: 70%, Tactics: 30%
  DPS: { primary: 80, secondary: 20 },      // DPS: 80%, Tactics: 20%
};

// 택틱이 있는 보스 목록 (수동 설정)
const bossesWithTactics: number[] = [
  // Nerub-ar Palace
  2917, // The Bloodbound Horror
  2919, // Broodtwister Ovi'nax
  2921, // The Silken Court
  2922, // Queen Ansurek
  // Liberation of Undermine
  3010, // Cauldron of Carnage
  3015, // Mug'Zee
  3016, // Chrome King Gallywix
  // Manaforge Omega
  3122, // The Soul Hunters
  3133, // Fractillus
  3135, // Dimensius
];

// ============== First Kill 색상 설정 ==============
// 주차별 색상 등급 (gold > pink > orange > purple > blue > green > gray)
export type FirstKillColor = 'gold' | 'pink' | 'orange' | 'purple' | 'blue' | 'green' | 'gray';

// 보스별 First Kill 색상 기준 (주차 범위)
// [maxWeek for gold, maxWeek for pink, maxWeek for orange, maxWeek for purple, maxWeek for blue, maxWeek for green]
// 예: [1, 2, 3, 5, 8, 10] = 1주차 금색, 2주차 핑크, 3주차 주황, 4~5주차 보라, 6~8주차 파랑, 9~10주차 초록, 11주차+ 회색
export interface FirstKillColorConfig {
  encounterId: number;
  // 각 색상의 최대 주차 (포함)
  goldMaxWeek: number;
  pinkMaxWeek: number;
  orangeMaxWeek: number;
  purpleMaxWeek: number;
  blueMaxWeek: number;
  greenMaxWeek: number;
}

// 시즌 1: 네룹아르 궁전 First Kill 색상 기준
const SEASON1_FIRST_KILL_COLORS: FirstKillColorConfig[] = [
  // 1~3번 보스 (쉬움)
  { encounterId: 2902, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 5, blueMaxWeek: 8, greenMaxWeek: 11 }, // Ulgrax
  { encounterId: 2917, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 5, blueMaxWeek: 8, greenMaxWeek: 11 }, // Bloodbound Horror
  { encounterId: 2898, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 5, blueMaxWeek: 8, greenMaxWeek: 11 }, // Sikran
  // 4~5번 보스 (중간)
  { encounterId: 2918, goldMaxWeek: 2, pinkMaxWeek: 3, orangeMaxWeek: 4, purpleMaxWeek: 7, blueMaxWeek: 9, greenMaxWeek: 13 }, // Rasha'nan
  { encounterId: 2919, goldMaxWeek: 4, pinkMaxWeek: 5, orangeMaxWeek: 6, purpleMaxWeek: 10, blueMaxWeek: 13, greenMaxWeek: 16 }, // Broodtwister
  // 6~7번 보스 (어려움)
  { encounterId: 2920, goldMaxWeek: 4, pinkMaxWeek: 5, orangeMaxWeek: 6, purpleMaxWeek: 10, blueMaxWeek: 13, greenMaxWeek: 16 }, // Nexus-Princess
  { encounterId: 2921, goldMaxWeek: 6, pinkMaxWeek: 7, orangeMaxWeek: 8, purpleMaxWeek: 12, blueMaxWeek: 15, greenMaxWeek: 20 }, // Silken Court
  // 8번 보스 (막넴)
  { encounterId: 2922, goldMaxWeek: 7, pinkMaxWeek: 9, orangeMaxWeek: 10, purpleMaxWeek: 13, blueMaxWeek: 16, greenMaxWeek: 21 }, // Queen Ansurek
];

// 시즌 2: 언더마인 First Kill 색상 기준
const SEASON2_FIRST_KILL_COLORS: FirstKillColorConfig[] = [
  // 1~3번 보스 (쉬움)
  { encounterId: 3009, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 5, blueMaxWeek: 8, greenMaxWeek: 11 }, // Vexie
  { encounterId: 3010, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 5, blueMaxWeek: 8, greenMaxWeek: 11 }, // Cauldron
  { encounterId: 3011, goldMaxWeek: 2, pinkMaxWeek: 3, orangeMaxWeek: 4, purpleMaxWeek: 5, blueMaxWeek: 8, greenMaxWeek: 11 }, // Rik Reverb
  // 4~5번 보스 (중간)
  { encounterId: 3012, goldMaxWeek: 2, pinkMaxWeek: 3, orangeMaxWeek: 4, purpleMaxWeek: 7, blueMaxWeek: 10, greenMaxWeek: 13 }, // Stix
  { encounterId: 3013, goldMaxWeek: 3, pinkMaxWeek: 4, orangeMaxWeek: 5, purpleMaxWeek: 8, blueMaxWeek: 11, greenMaxWeek: 14 }, // Sprocketmonger
  // 6~7번 보스 (어려움)
  { encounterId: 3014, goldMaxWeek: 4, pinkMaxWeek: 5, orangeMaxWeek: 6, purpleMaxWeek: 9, blueMaxWeek: 13, greenMaxWeek: 16 }, // One-Armed Bandit
  { encounterId: 3015, goldMaxWeek: 5, pinkMaxWeek: 6, orangeMaxWeek: 7, purpleMaxWeek: 10, blueMaxWeek: 15, greenMaxWeek: 18 }, // Mug'Zee
  // 8번 보스 (막넴)
  { encounterId: 3016, goldMaxWeek: 6, pinkMaxWeek: 7, orangeMaxWeek: 8, purpleMaxWeek: 11, blueMaxWeek: 16, greenMaxWeek: 19 }, // Gallywix
];

// 시즌 3: 마나포지 오메가 First Kill 색상 기준
const SEASON3_FIRST_KILL_COLORS: FirstKillColorConfig[] = [
  // 1~3번 보스 (쉬움)
  { encounterId: 3129, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 4, blueMaxWeek: 8, greenMaxWeek: 10 }, // Plexus Sentinel
  { encounterId: 3131, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 5, blueMaxWeek: 9, greenMaxWeek: 10 }, // Loom'ithar
  { encounterId: 3130, goldMaxWeek: 1, pinkMaxWeek: 2, orangeMaxWeek: 3, purpleMaxWeek: 4, blueMaxWeek: 8, greenMaxWeek: 10 }, // Soulbinder
  // 4~5번 보스 (중간)
  { encounterId: 3132, goldMaxWeek: 2, pinkMaxWeek: 3, orangeMaxWeek: 4, purpleMaxWeek: 6, blueMaxWeek: 9, greenMaxWeek: 12 }, // Forgeweaver
  { encounterId: 3122, goldMaxWeek: 3, pinkMaxWeek: 4, orangeMaxWeek: 5, purpleMaxWeek: 7, blueMaxWeek: 10, greenMaxWeek: 13 }, // Soul Hunters
  // 6~7번 보스 (어려움)
  { encounterId: 3133, goldMaxWeek: 2, pinkMaxWeek: 3, orangeMaxWeek: 4, purpleMaxWeek: 6, blueMaxWeek: 9, greenMaxWeek: 12 }, // Fractillus
  { encounterId: 3134, goldMaxWeek: 4, pinkMaxWeek: 5, orangeMaxWeek: 6, purpleMaxWeek: 9, blueMaxWeek: 12, greenMaxWeek: 15 }, // Nexus-King
  // 8번 보스 (막넴)
  { encounterId: 3135, goldMaxWeek: 4, pinkMaxWeek: 6, orangeMaxWeek: 8, purpleMaxWeek: 11, blueMaxWeek: 14, greenMaxWeek: 17 }, // Dimensius
];

// 시즌별 First Kill 색상 설정 맵
export const FIRST_KILL_COLOR_CONFIGS: Record<number, FirstKillColorConfig[]> = {
  38: SEASON1_FIRST_KILL_COLORS,  // 네룹아르 궁전
  42: SEASON2_FIRST_KILL_COLORS,  // 언더마인
  44: SEASON3_FIRST_KILL_COLORS,  // 마나포지 오메가
};

// 주차로 First Kill 색상 결정
export function getFirstKillColor(week: number, encounterId: number, zoneId: number): FirstKillColor {
  const configs = FIRST_KILL_COLOR_CONFIGS[zoneId];
  if (!configs) return 'gray';
  
  const config = configs.find(c => c.encounterId === encounterId);
  if (!config) return 'gray';
  
  if (week <= config.goldMaxWeek) return 'gold';
  if (week <= config.pinkMaxWeek) return 'pink';
  if (week <= config.orangeMaxWeek) return 'orange';
  if (week <= config.purpleMaxWeek) return 'purple';
  if (week <= config.blueMaxWeek) return 'blue';
  if (week <= config.greenMaxWeek) return 'green';
  return 'gray';
}

// First Kill 색상 → CSS 클래스
export function getFirstKillColorClass(color: FirstKillColor): string {
  switch (color) {
    case 'gold': return 'text-amber-300';
    case 'pink': return 'text-pink-400';
    case 'orange': return 'text-orange-400';
    case 'purple': return 'text-purple-400';
    case 'blue': return 'text-blue-400';
    case 'green': return 'text-green-400';
    case 'gray': return 'text-gray-400';
  }
}

// 시즌별 기본 설정 생성
export function createDefaultScoreConfig(): SeasonScoreConfig[] {
  return ZONE_DATA.map(zone => {
    const bossCount = zone.encounters.length;
    const defaultWeight = Math.round(100 / bossCount);
    const lastBossExtraWeight = 100 - (defaultWeight * bossCount);

    return {
      zoneId: zone.id,
      bossWeights: zone.encounters.map((enc, index) => ({
        encounterId: enc.id,
        encounterName: enc.name,
        weight: index === bossCount - 1 
          ? defaultWeight + lastBossExtraWeight 
          : defaultWeight,
        hasTactics: bossesWithTactics.includes(enc.id),
        tacticsScore: undefined,
      })),
      roleWeights: { ...defaultRoleWeights },
    };
  });
}

// 가중 평균 점수 계산
export function calculateWeightedScore(
  values: Array<{ score: number; weight: number }>
): number {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return 0;
  
  const weightedSum = values.reduce((sum, v) => sum + (v.score * v.weight), 0);
  return weightedSum / totalWeight;
}

// 역할별 종합 점수 계산
export function calculateRoleTotalScore(
  primaryScore: number,
  secondaryScore: number,
  weights: RoleScoreWeights
): number {
  const totalWeight = weights.primary + weights.secondary;
  if (totalWeight === 0) return 0;
  
  return (primaryScore * weights.primary + secondaryScore * weights.secondary) / totalWeight;
}

// ============== 추가평가 셀별 가중치 설정 ==============
export interface AnalysisCellWeight {
  cellId: string;
  weight: number;
}

import { HEALER_PHASE_DAMAGE_THRESHOLDS } from './classSpecs';

// Season 2 추가평가 셀 가중치
export const SEASON_2_ANALYSIS_WEIGHTS: AnalysisCellWeight[] = [
  { cellId: 'boss1_debuff', weight: 20 },
  { cellId: 'consistency', weight: 15 },
  { cellId: 'mechanics', weight: 20 },
  { cellId: 'survival', weight: 15 },
  { cellId: 'improvement', weight: 15 },
  { cellId: 'teamwork', weight: 15 },
];

// Season 3 추가평가 셀 가중치 (막넴 딜량 등)
// 여기서 가중치를 조절하면 종합점수에 반영되는 비중은 calculateAnalysisScore 내부 비율에 따름
export const SEASON_3_ANALYSIS_WEIGHTS: AnalysisCellWeight[] = [
  { cellId: 'boss8_phase_damage', weight: 50 }, // 딜량
  { cellId: 'boss8_kill_week', weight: 50 },    // 퍼킬 주차
];

// 주차별 점수 (1주차 100점 만점 ...)
export const KILL_WEEK_SCORES: Record<number, number> = {
  1: 100, 2: 99, 3: 98, 4: 97, 5: 96,
  6: 95, 7: 90, 8: 85, 9: 80, 10: 75,
};

/**
 * 1넴 디버프 수치를 점수로 변환
 * 0.0 = 0점, 0.1마다 2점, 5.0 이상 = 100점
 */
export function calculateDebuffScore(avgDebuff: number | undefined): number {
  if (avgDebuff === undefined || avgDebuff <= 0) return 0;
  if (avgDebuff >= 5.0) return 100;
  // 0.1 = 2점, 5.0 = 100점
  return Math.min(100, avgDebuff * 20);
}

/**
 * 시즌 3 막넴 딜량 점수 계산 (0~100)
 */
export function calculatePhaseDamageScore(damage: number, classID: number | undefined, specName?: string): number {
  if (!classID || !HEALER_PHASE_DAMAGE_THRESHOLDS[classID]) return 0;
  
  const config = HEALER_PHASE_DAMAGE_THRESHOLDS[classID];
  let high = config.high;

  // Spec override
  if (specName && config.specs) {
    const specKey = Object.keys(config.specs).find(s => specName.includes(s));
    if (specKey) {
      high = config.specs[specKey].high;
    }
  }
  
  // High 기준 이상이면 100점 만점
  if (damage >= high) return 100;
  
  // 0점 ~ 100점 선형 비례
  return Math.min(100, (damage / high) * 100);
}

export function calculateKillWeekScore(week: number): number {
  if (week < 1) return 0;
  return KILL_WEEK_SCORES[week] ?? 50; // 설정 없으면 50점
}

/**
 * 추가평가 총점 계산 (가중 평균)
 */
export function calculateAnalysisScore(
  cellScores: Map<string, number>,
  weights: AnalysisCellWeight[]
): number {
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const { cellId, weight } of weights) {
    const score = cellScores.get(cellId);
    // score가 undefined가 아닐 때만 반영 (해당 항목 데이터 존재 시)
    if (score !== undefined) {
       weightedSum += score * weight;
       totalWeight += weight;
    }
  }
  
  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

// ============== BEST % 보스별 가중치 ==============
export interface BossPercentWeight {
  encounterId: number;
  weight: number;
}

// Season 1 BEST % 보스별 가중치 (네룹아르 궁전)
export const SEASON_1_BOSS_PERCENT_WEIGHTS: BossPercentWeight[] = [
  { encounterId: 2902, weight: 5 },   // 1넴 Ulgrax
  { encounterId: 2917, weight: 12 },  // 2넴 Bloodbound Horror
  { encounterId: 2898, weight: 12 },  // 3넴 Sikran
  { encounterId: 2918, weight: 8 },  // 4넴 Rasha'nan
  { encounterId: 2919, weight: 10 },  // 5넴 Broodtwister
  { encounterId: 2920, weight: 15 },  // 6넴 Nexus-Princess
  { encounterId: 2921, weight: 18 },  // 7넴 Silken Court
  { encounterId: 2922, weight: 20 },  // 8넴 Queen Ansurek
];

// Season 2 BEST % 보스별 가중치 (언더마인)
export const SEASON_2_BOSS_PERCENT_WEIGHTS: BossPercentWeight[] = [
  { encounterId: 3009, weight: 5 },   // 1넴 Vexie
  { encounterId: 3010, weight: 13 },  // 2넴 Cauldron
  { encounterId: 3011, weight: 6 },  // 3넴 Rik Reverb
  { encounterId: 3012, weight: 8 },  // 4넴 Stix Bunkjunker
  { encounterId: 3013, weight: 15 },  // 5넴 Sprocketmonger
  { encounterId: 3014, weight: 13 },  // 6넴 One-Armed Bandit
  { encounterId: 3015, weight: 20 },  // 7넴 Mug'Zee
  { encounterId: 3016, weight: 20 },  // 8넴 Gallywix
];

// Season 3 BEST % 보스별 가중치 (마나포지 오메가)
export const SEASON_3_BOSS_PERCENT_WEIGHTS: BossPercentWeight[] = [
  { encounterId: 3129, weight: 10 },   // 1넴
  { encounterId: 3131, weight: 8 },  // 2넴
  { encounterId: 3132, weight: 5 },  // 3넴
  { encounterId: 3122, weight: 10 },  // 4넴
  { encounterId: 3133, weight: 12 },  // 5넴
  { encounterId: 3134, weight: 15 },  // 6넴
  { encounterId: 3135, weight: 20 },  // 7넴
  { encounterId: 3136, weight: 20 },  // 8넴
];

/**
 * 보스별 가중치 가져오기
 */
export function getBossPercentWeights(zoneId: number): BossPercentWeight[] {
  switch (zoneId) {
    case 38: return SEASON_1_BOSS_PERCENT_WEIGHTS;
    case 42: return SEASON_2_BOSS_PERCENT_WEIGHTS;
    case 44: return SEASON_3_BOSS_PERCENT_WEIGHTS;
    default: return [];
  }
}

// ============== 권장 힐러 수 설정 ==============
export interface RecommendedHealerConfig {
  encounterId: number;
  minHealers: number;   // 최소 힐러 수 (이하면 주작 경고)
  description: string;  // 팝업에 표시할 설명
}

// Season 1: 네룹아르 궁전 권장 힐러 수
export const SEASON_1_RECOMMENDED_HEALERS: RecommendedHealerConfig[] = [
  { encounterId: 2902, minHealers: 3, description: "시즌초 4힐\n그후 3힐" },
  { encounterId: 2917, minHealers: 3, description: "4힐\n(3힐의 이점 적음)" },
  { encounterId: 2898, minHealers: 3, description: "3~4힐" },
  { encounterId: 2918, minHealers: 4, description: "4~5힐" },
  { encounterId: 2919, minHealers: 3, description: "4힐\n(3힐의 이점 적음)" },
  { encounterId: 2920, minHealers: 4, description: "4~5힐" },
  { encounterId: 2921, minHealers: 4, description: "4힐\n(3힐의 이점 적음)" },
  { encounterId: 2922, minHealers: 4, description: "4힐\n(3힐의 이점 적음)" },
];

// Season 2: 언더마인 권장 힐러 수
export const SEASON_2_RECOMMENDED_HEALERS: RecommendedHealerConfig[] = [
  { encounterId: 3009, minHealers: 3, description: "시즌초 4힐\n그후 3힐" },
  { encounterId: 3010, minHealers: 3, description: "4힐\n(3힐의 이점 없음)" },
  { encounterId: 3011, minHealers: 3, description: "3힐\n(4힐의 이점 적음)" },
  { encounterId: 3012, minHealers: 3, description: "4힐\n(3힐의 이점 적음)" },
  { encounterId: 3013, minHealers: 3, description: "3~4힐" },
  { encounterId: 3014, minHealers: 3, description: "3힐\n(4힐의 이점 적음)" },
  { encounterId: 3015, minHealers: 3, description: "너프 후 3힐\n(시즌 극초반만 5힐)" },
  { encounterId: 3016, minHealers: 4, description: "4힐\n(3힐의 이점 적음)" },
];

// Season 3: 마나포지 오메가 권장 힐러 수
export const SEASON_3_RECOMMENDED_HEALERS: RecommendedHealerConfig[] = [
  { encounterId: 3129, minHealers: 3, description: "시즌초 4힐\n그후 3힐" },
  { encounterId: 3131, minHealers: 3, description: "시즌초 4힐\n그후 3힐" },
  { encounterId: 3130, minHealers: 3, description: "시즌초 4힐\n그후 3힐" },
  { encounterId: 3132, minHealers: 3, description: "3힐\n(4힐의 이점 적음)" },
  { encounterId: 3122, minHealers: 4, description: "5힐\n(4힐의 이점 적음)" },
  { encounterId: 3133, minHealers: 3, description: "3~4힐" },
  { encounterId: 3134, minHealers: 3, description: "3힐\n" },
  { encounterId: 3135, minHealers: 3, description: "4힐\n" },
];

/**
 * 권장 힐러 수 가져오기
 */
export function getRecommendedHealers(zoneId: number): RecommendedHealerConfig[] {
  switch (zoneId) {
    case 38: return SEASON_1_RECOMMENDED_HEALERS;
    case 42: return SEASON_2_RECOMMENDED_HEALERS;
    case 44: return SEASON_3_RECOMMENDED_HEALERS;
    default: return [];
  }
}

