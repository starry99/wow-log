// Warcraft Logs API Service
// OAuth2 Client Credentials Flow를 사용하여 GraphQL API에 접근

import type { ZoneData, SeasonData, BossRanking, Role } from '../types';
import { HEALER_SPECS, TANK_SPECS } from '../config/classSpecs';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * OAuth2 Access Token 가져오기
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  /* 
   * Vercel Serverless Function을 통해 토큰 발급
   * 클라이언트 측에서 Secret Key를 노출하지 않기 위함
   */
  const response = await fetch('/api/token', {
    method: 'GET', // Serverless Function은 GET으로 호출해도 됨 (내부적으로 처리)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

  return data.access_token;
}

/**
 * GraphQL 쿼리 실행
 */
export async function queryWarcraftLogs<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GraphQL request failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

/**
 * Zone(레이드) 정보와 보스 목록 - 상수로 저장 (API 호출 불필요)
 */
export const ZONE_DATA: ZoneData[] = [
  {
    id: 38,
    name: "내부전쟁 1시즌: Nerub-ar Palace",
    encounters: [
      { id: 2902, name: "Ulgrax the Devourer" },
      { id: 2917, name: "The Bloodbound Horror" },
      { id: 2898, name: "Sikran, Captain of the Sureki" },
      { id: 2918, name: "Rasha'nan" },
      { id: 2919, name: "Broodtwister Ovi'nax" },
      { id: 2920, name: "Nexus-Princess Ky'veza" },
      { id: 2921, name: "The Silken Court" },
      { id: 2922, name: "Queen Ansurek" },
    ],
  },
  {
    id: 42,
    name: "내부전쟁 2시즌: Liberation of Undermine",
    encounters: [
      { id: 3009, name: "Vexie and the Geargrinders" },
      { id: 3010, name: "Cauldron of Carnage" },
      { id: 3011, name: "Rik Reverb" },
      { id: 3012, name: "Stix Bunkjunker" },
      { id: 3013, name: "Sprocketmonger Lockenstock" },
      { id: 3014, name: "One-Armed Bandit" },
      { id: 3015, name: "Mug'Zee, Heads of Security" },
      { id: 3016, name: "Chrome King Gallywix" },
    ],
  },
  {
    id: 44,
    name: "내부전쟁 3시즌: Manaforge Omega",
    encounters: [
      { id: 3129, name: "Plexus Sentinel" },
      { id: 3131, name: "Loom'ithar" },
      { id: 3130, name: "Soulbinder Naazindhri" },
      { id: 3132, name: "Forgeweaver Araz" },
      { id: 3122, name: "The Soul Hunters" },
      { id: 3133, name: "Fractillus" },
      { id: 3134, name: "Nexus-King Salhadaar" },
      { id: 3135, name: "Dimensius, the All-Devouring" },
    ],
  },
];

/**
 * Zone 데이터 가져오기 (상수 반환)
 */
export function getZoneData(): ZoneData[] {
  return ZONE_DATA;
}

/**
 * 시즌별 8/8M 여부만 빠르게 확인 (최소 cost)
 * DPS metric만 사용 (spec과 무관하게 totalKills 확인)
 */
export async function checkSeasonClearStatus(
  name: string,
  serverSlug: string,
  serverRegion: string,
  zones: ZoneData[]
): Promise<{
  playerName: string;
  classID: number;
  seasonStatus: Array<{
    zoneId: number;
    zoneName: string;
    killedBossCount: number;
    isFullClear: boolean;
  }>;
} | null> {
  // 각 Zone에 대해 DPS metric만 조회 (spec 무관)
  const zoneQueries = zones.map(zone => `
    zone${zone.id}: zoneRankings(zoneID: ${zone.id}, metric: dps, difficulty: 5)
  `).join('\n');

  const query = `
    query GetSeasonClearStatus($name: String!, $serverSlug: String!, $serverRegion: String!) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          name
          classID
          ${zoneQueries}
        }
      }
    }
  `;

  const result = await queryWarcraftLogs<{
    characterData: { character: Record<string, unknown> | null };
  }>(query, { name, serverSlug, serverRegion });

  const character = result.characterData.character;
  if (!character) return null;

  const seasonStatus = zones.map(zone => {
    const zoneData = character[`zone${zone.id}`] as { 
      rankings?: Array<{ totalKills: number }> 
    } | null;
    
    // totalKills > 0인 보스만 카운트
    const killedBossCount = zoneData?.rankings?.filter(r => r.totalKills > 0).length ?? 0;
    
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      killedBossCount,
      isFullClear: killedBossCount >= 8,
    };
  });

  return {
    playerName: character.name as string,
    classID: character.classID as number,
    seasonStatus,
  };
}

/**
 * 특정 시즌의 상세 랭킹 데이터 가져오기 (버튼 클릭 시 호출)
 */
export async function getCharacterRankings(
  name: string,
  serverSlug: string,
  serverRegion: string,
  zones: ZoneData[]
): Promise<{
  playerName: string;
  classID: number;
  seasons: SeasonData[];
  _ranksData?: {
    dpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>;
    hpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>;
  };
} | null> {
  // encounter 매핑 생성
  const encounterMapping: Array<{ zoneId: number; encounterId: number; encounterName: string }> = [];

  zones.forEach(zone => {
    zone.encounters.forEach(encounter => {
      encounterMapping.push({
        zoneId: zone.id,
        encounterId: encounter.id,
        encounterName: encounter.name,
      });
    });
  });

  // 쿼리 생성 함수
  const buildQuery = (metric: 'dps' | 'hps') => {
    const encounterQueries = encounterMapping.map(({ encounterId }) => {
      const alias = `boss_${encounterId}_${metric}`;
      return `${alias}: encounterRankings(encounterID: ${encounterId}, difficulty: 5, partition: -1, metric: ${metric})`;
    });

    return `
      query GetCharacterRankings($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            name
            classID
            ${encounterQueries.join('\n            ')}
          }
        }
      }
    `;
  };

  // DPS metric 쿼리 실행
  const dpsQuery = buildQuery('dps');
  const dpsResult = await queryWarcraftLogs<{
    characterData: { character: Record<string, unknown> | null };
  }>(dpsQuery, { name, serverSlug, serverRegion });

  if (!dpsResult.characterData.character) {
    return null;
  }

  // HPS metric 쿼리 실행
  const hpsQuery = buildQuery('hps');
  const hpsResult = await queryWarcraftLogs<{
    characterData: { character: Record<string, unknown> | null };
  }>(hpsQuery, { name, serverSlug, serverRegion });

  const dpsCharacter = dpsResult.characterData.character;
  const hpsCharacter = hpsResult.characterData.character;

  // 데이터를 SeasonData 형식으로 변환
  const seasonMap = new Map<number, SeasonData>();

  // 각 Zone에 대해 SeasonData 초기화
  zones.forEach(zone => {
    seasonMap.set(zone.id, {
      zoneId: zone.id,
      zoneName: zone.name,
      activeRoles: { Tank: false, Healer: false, DPS: false },
      bossRankings: [],
    });
  });

  // Rank 데이터 타입
  type RankData = {
    spec: string;
    rankPercent: number;
    amount: number;
    startTime: number;  // Unix timestamp (ms)
    report?: { code: string; fightID: number };  // 리포트 정보
    lockedIn: boolean;
    name?: string; // 랭킹 당시 닉네임
  };

  type BossRankingData = {
    totalKills?: number;
    ranks?: RankData[];
  } | null;

  // 추가 분석용 ranks 데이터 저장
  const dpsRanksMap = new Map<number, RankData[]>();
  const hpsRanksMap = new Map<number, RankData[]>();

  // 각 보스 랭킹 데이터 처리
  encounterMapping.forEach(({ zoneId, encounterId, encounterName }) => {
    const dpsAlias = `boss_${encounterId}_dps`;
    const hpsAlias = `boss_${encounterId}_hps`;
    
    const dpsBossData = dpsCharacter[dpsAlias] as BossRankingData;
    const hpsBossData = hpsCharacter?.[hpsAlias] as BossRankingData;

    const season = seasonMap.get(zoneId)!;
    
    const bossRanking: BossRanking = {
      encounterId,
      encounterName,
      roles: {},
    };

    const dpsRanks = dpsBossData?.ranks || [];
    const hpsRanks = hpsBossData?.ranks || [];

    // 추가 분석용 ranks 저장
    if (dpsRanks.length > 0) dpsRanksMap.set(encounterId, dpsRanks);
    if (hpsRanks.length > 0) hpsRanksMap.set(encounterId, hpsRanks);


    // 역할별 spec 데이터 수집
    const roleDataMap = new Map<Role, {
      specs: Set<string>;
      specKills: Record<string, number>;
      totalKills: number;
      bestDpsRankPercent: number;
      bestDpsAmount: number;  // DPS 값 (tiebreaker용)
      bestHpsRankPercent: number;
      bestHpsAmount: number;  // HPS 값 (tiebreaker용)
      bestRankReportCode?: string;
      bestRankFightID?: number;
      firstKillTimestamp: number;
      firstKillReportCode?: string;
      firstKillFightID?: number;
    }>();

    // DPS metric에서 데이터 수집 (Tank, DPS용 dpsRankPercent + kills + firstKill)
    dpsRanks.forEach(rank => {
      const role = getSpecRole(rank.spec);
      if (!role) return;

      const existing = roleDataMap.get(role) || {
        specs: new Set<string>(),
        specKills: {},
        totalKills: 0,
        bestDpsRankPercent: 0,
        bestDpsAmount: 0,
        bestHpsRankPercent: 0,
        bestHpsAmount: 0,
        bestRankReportCode: undefined as string | undefined,
        bestRankFightID: undefined as number | undefined,
        firstKillTimestamp: Infinity,
        firstKillReportCode: undefined,
        firstKillFightID: undefined,
      };

      existing.specs.add(rank.spec);
      // 스펙별 킬 수 증가 (Tank/DPS만, Healer는 HPS metric에서 카운트)
      if (role !== 'Healer') {
        existing.specKills[rank.spec] = (existing.specKills[rank.spec] || 0) + 1;
        existing.totalKills += 1;
      }
      
      // Best DPS rank 업데이트 (동일 랭킹이면 amount가 높은 것 선택)
      const isBetterDps = rank.rankPercent > existing.bestDpsRankPercent ||
        (rank.rankPercent === existing.bestDpsRankPercent && rank.amount > existing.bestDpsAmount);
      
      if (isBetterDps) {
        existing.bestDpsRankPercent = rank.rankPercent;
        existing.bestDpsAmount = rank.amount;
        // DPS 역할의 경우 best rank 리포트 정보 저장
        if (role === 'DPS' && rank.report) {
          existing.bestRankReportCode = rank.report.code;
          existing.bestRankFightID = rank.report.fightID;
        }
      }
      
      // 가장 빠른 킬 시간 추적 (리포트 정보 포함)
      if (rank.startTime && rank.startTime < existing.firstKillTimestamp) {
        existing.firstKillTimestamp = rank.startTime;
        existing.firstKillReportCode = rank.report?.code;
        existing.firstKillFightID = rank.report?.fightID;
      }

      roleDataMap.set(role, existing);
    });

    // HPS metric에서 데이터 수집 (Healer용 hpsRankPercent + firstKill 업데이트)
    // 표시값 기준으로 비교 (소숫점 1자리, 99.95 이상 100 미만은 99.9)
    const getDisplayPercent = (value: number): number => {
      if (value === 100) return 100;
      if (value >= 99.95 && value < 100) return 99.9;
      return Math.round(value * 10) / 10;
    };
    
    hpsRanks.forEach(rank => {
      const role = getSpecRole(rank.spec);
      if (!role) return;

      const existing = roleDataMap.get(role) || {
        specs: new Set<string>(),
        specKills: {},
        totalKills: 0,
        bestDpsRankPercent: 0,
        bestDpsAmount: 0,
        bestHpsRankPercent: 0,
        bestHpsAmount: 0,
        bestRankReportCode: undefined as string | undefined,
        bestRankFightID: undefined as number | undefined,
        firstKillTimestamp: Infinity,
        firstKillReportCode: undefined,
        firstKillFightID: undefined,
      };

      existing.specs.add(rank.spec);
      // Healer의 경우 HPS metric에서 킬 수 추적
      if (role === 'Healer') {
        existing.specKills[rank.spec] = (existing.specKills[rank.spec] || 0) + 1;
        existing.totalKills += 1;
      }
      
      // Healer와 Tank는 HPS 랭킹 추적
      if (role === 'Healer' || role === 'Tank') {
        // 표시값 기준으로 비교 (동률시 HPS amount가 높은 것 선택)
        const currentDisplayPercent = getDisplayPercent(rank.rankPercent);
        const existingDisplayPercent = getDisplayPercent(existing.bestHpsRankPercent);
        
        const isBetterHps = currentDisplayPercent > existingDisplayPercent ||
          (currentDisplayPercent === existingDisplayPercent && rank.amount > existing.bestHpsAmount);
        
        if (isBetterHps) {
          existing.bestHpsRankPercent = rank.rankPercent;
          existing.bestHpsAmount = rank.amount;
          if (role === 'Healer' && rank.report) {
            existing.bestRankReportCode = rank.report.code;
            existing.bestRankFightID = rank.report.fightID;
          }
        }
      }
      
      // HPS 데이터에서도 firstKill 체크 (리포트 정보 포함)
      if (rank.startTime && rank.startTime < existing.firstKillTimestamp) {
        existing.firstKillTimestamp = rank.startTime;
        existing.firstKillReportCode = rank.report?.code;
        existing.firstKillFightID = rank.report?.fightID;
      }

      roleDataMap.set(role, existing);
    });

    // 역할별 최종 데이터 생성
    roleDataMap.forEach((data, role) => {
      const specList = Array.from(data.specs).join(', ');
      
      bossRanking.roles[role] = {
        spec: specList,
        totalKills: data.totalKills,
        specKills: data.specKills,
        dpsRankPercent: data.bestDpsRankPercent > 0 ? data.bestDpsRankPercent : undefined,
        hpsRankPercent: data.bestHpsRankPercent > 0 ? data.bestHpsRankPercent : undefined,
        bestRankReportCode: data.bestRankReportCode,
        bestRankFightID: data.bestRankFightID,
        firstKillTimestamp: data.firstKillTimestamp !== Infinity ? data.firstKillTimestamp : undefined,
        firstKillReportCode: data.firstKillReportCode,
        firstKillFightID: data.firstKillFightID,
      };
      
      season.activeRoles[role] = true;
    });

    season.bossRankings.push(bossRanking);
  });

  const seasons = Array.from(seasonMap.values());


  
  const playerName = dpsCharacter.name as string;
  
  // 상세 분석은 나중에 호출 - 여기서는 기본 데이터만 반환
  // dpsRanksMap, hpsRanksMap은 상세 분석 시 필요하므로 저장
  return {
    playerName,
    classID: dpsCharacter.classID as number,
    seasons,
    // 상세 분석용 데이터 - 나중에 fetchDetailedAnalysis에서 사용
    _ranksData: { dpsRanksMap, hpsRanksMap },
  };
}

/**
 * 상세 분석 데이터 조회 (버튼 클릭 시 호출)
 * 8/8 시즌에 대해서만 호출됨
 */
export async function fetchDetailedAnalysis(
  season: SeasonData, 
  playerName: string,
  dpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>,
  hpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>
): Promise<void> {
  // 모든 분석 함수를 병렬로 실행
  await Promise.all([
    // Healer Best % 전투에서 힐러 수 조회 (Batch)
    fetchHealerCountsForSeason(season),
    
    // DPS Best % 98 이상일 때 주작 체크
    fetchDpsCheatCheckForSeason(season),
    
    // DPS Best % 전투에서 Power Infusion 체크 (Batch)
    fetchPowerInfusionCheckBatch(season, playerName),
    
    // 시즌별 추가 분석 데이터 조회 (Season 2)
    fetchSeasonAnalysis(season, playerName, dpsRanksMap, hpsRanksMap),
    
    // Season 1 추가 분석
    fetchSeason1Analysis(season, playerName, dpsRanksMap, hpsRanksMap),
  
    // Season 3 추가 분석
    fetchSeason3Analysis(season, playerName, dpsRanksMap, hpsRanksMap)
  ]);
}

/**
 * 8/8 클리어 여부 확인 (export for use in SeasonTable)
 */
export function checkFullClear(season: SeasonData): boolean {
  const killedBossIds = new Set<number>();
  season.bossRankings.forEach(boss => {
    const hasKill = Object.values(boss.roles).some(roleData => 
      roleData && roleData.totalKills > 0
    );
    if (hasKill) {
      killedBossIds.add(boss.encounterId);
    }
  });
  return killedBossIds.size >= 8;
}

/**
 * Healer Best % 전투에서 힐러 수 조회 (단일 시즌)
 * HPS 90% 이상인 경우에만 조회 (cost 절감)
 * rankings API를 사용하여 힐러 수와 사실상 힐러 수 (3% 미만 제외) 함께 계산
 */
async function fetchHealerCountsForSeason(season: SeasonData): Promise<void> {
  // 조회할 보스 목록 필터링
  const bossesToFetch = season.bossRankings
    .map((boss, index) => ({ boss, index }))
    .filter(({ boss }) => {
      const healerData = boss.roles.Healer;
      return healerData?.bestRankReportCode && healerData?.bestRankFightID;
    });

  if (bossesToFetch.length === 0) return;

  try {
    // Batch Query 생성
    const reportQueries = bossesToFetch.map(({ boss, index }) => {
      const healerData = boss.roles.Healer!;
      return `report_${index}: report(code: "${healerData.bestRankReportCode}") {
        rankings(fightIDs: [${healerData.bestRankFightID}], playerMetric: hps)
      }`;
    }).join('\n');

    const query = `
      query GetHealerCountsBatch {
        reportData {
          ${reportQueries}
        }
      }
    `;

    const result = await queryWarcraftLogs<any>(query, {});

    // 결과 처리
    bossesToFetch.forEach(({ boss, index }) => {
      const reportData = result.reportData?.[`report_${index}`];
      if (!reportData) return;

      const rankings = reportData.rankings as {
        data?: Array<{
          roles?: {
            healers?: {
              characters?: Array<{
                name: string;
                rankPercent: number; // API response might allow null/undefined, safe to access
              }>;
            };
          };
        }>;
      };

      const fightRanking = rankings?.data?.[0];
      const healerCharacters = fightRanking?.roles?.healers?.characters || [];
      
      const healerData = boss.roles.Healer!;
      
      // 전체 힐러 수
      healerData.healerCount = healerCharacters.length;
      
      // 사실상 힐러 수 (3% 이하 또는 0/undefined인 힐러 제외)
      const lowRankHealerCount = healerCharacters.filter(h => 
        h.rankPercent === undefined || h.rankPercent === null || h.rankPercent <= 3
      ).length;
      healerData.effectiveHealerCount = healerCharacters.length - lowRankHealerCount;
    });

  } catch (e) {
    // console.warn('Batch fetch for healer counts failed:', e);
    // 실패 시 개별 처리는 구현하지 않음 (비필수 정보)
  }
}

// DPS 주작 체크 대상 보스 (시즌별)
// 시즌1: 1넴, 시즌2: 3넴, 시즌3: 3넴
const DPS_CHEAT_CHECK_BOSSES: Record<number, number> = {
  38: 2902,  // Season 1: Ulgrax (1넴)
  42: 3011,  // Season 2: 3넴
  44: 3130,  // Season 3: 3넴 
};

/**
 * DPS Best % 99 이상일 때 주작 체크 (단일 시즌)
 * 특정 보스에서만 실행 (cost 절감)
 * 19% 이하 DPS가 6명 이상이면 경고
 */
async function fetchDpsCheatCheckForSeason(season: SeasonData): Promise<void> {
  const targetBossId = DPS_CHEAT_CHECK_BOSSES[season.zoneId];
  if (!targetBossId) return;  // 체크 대상 보스가 없으면 스킵

  for (const boss of season.bossRankings) {
    // 지정된 보스만 체크
    if (boss.encounterId !== targetBossId) continue;

    const dpsData = boss.roles.DPS;
    // 98% 이상이고 리포트 정보가 있을 때만 체크
    if (!dpsData?.dpsRankPercent || dpsData.dpsRankPercent < 98) continue;
    if (!dpsData?.bestRankReportCode || !dpsData?.bestRankFightID) continue;

    try {
      // rankings API로 해당 fight의 모든 랭킹 조회
      const query = `
        query GetReportRankings($code: String!, $fightIDs: [Int]) {
          reportData {
            report(code: $code) {
              rankings(fightIDs: $fightIDs)
            }
          }
        }
      `;

      const result = await queryWarcraftLogs<{
        reportData: {
          report: {
            rankings: unknown;
          };
        };
      }>(query, { 
        code: dpsData.bestRankReportCode, 
        fightIDs: [dpsData.bestRankFightID] 
      });

      // rankings 데이터에서 19% 이하 DPS 수 계산
      const rankings = result.reportData.report.rankings as {
        data?: Array<{
          roles?: {
            dps?: {
              characters?: Array<{
                name: string;
                rankPercent: number;
              }>;
            };
          };
        }>;
      };

      const fightRanking = rankings?.data?.[0];
      const dpsCharacters = fightRanking?.roles?.dps?.characters || [];
      
      // 19% 이하 DPS 수 카운트
      const lowDpsCount = dpsCharacters.filter(c => c.rankPercent <= 19).length;
      dpsData.lowDpsCount = lowDpsCount;
    } catch {
      // DPS cheat check 실패 시 무시
    }
  }
}

/**
 * Spec 이름으로 역할 판단
 */
function getSpecRole(spec: string): Role | null {
  const tankSpecs = [
    'Blood', 'Protection', 'Guardian', 'Brewmaster', 'Vengeance',
    '피', '방어', '수호', '양조', '복수',
  ];
  const healerSpecs = [
    'Holy', 'Discipline', 'Restoration', 'Mistweaver', 'Preservation',
    '신성', '수양', '회복', '운무', '보존',
  ];
  
  if (tankSpecs.some(s => spec.includes(s))) return 'Tank';
  if (healerSpecs.some(s => spec.includes(s))) return 'Healer';
  return 'DPS';
}



const SEASON_1_BOSS_6_ID = 2920;
const SEASON_1_DEBUFF_ID = 437343; // Acidic Apocalypse (or regicide?) 437343 is User provided ID.

// Season 2 보스 및 디버프 설정
const SEASON_2_BOSS_1_ID = 3009;  // Vexie and the Geargrinders
const SEASON_2_BOSS_3_ID = 3011;  // 리크 리버브
const SEASON_2_BOSS_8_ID = 3016;  // 8넴 (Sarkareth)
const BOSS_1_DEBUFF_ABILITY_ID = 459445;
const BOSS_3_DEBUFF_ABILITY_ID = 1217122;
const BOSS_8_DEBUFF_ABILITY_ID = 1220784; // 사용자 요청 폭탄목걸이 ID

/**
 * 시즌별 추가 분석 데이터 조회
 * Season 2: 1넴, 3넴 모든 킬에서 평균 디버프 수 계산 (한번에 처리)
 *          8넴 폭탄목걸이 특임 수행 여부 체크
 */
async function fetchSeasonAnalysis(
  season: SeasonData, 
  playerName: string,
  dpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>,
  hpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>
): Promise<void> {
  // Season 2 (zoneId 42)만 처리
  if (season.zoneId !== 42) return;

  // 보스의 모든 킬 report 수집 (중복 제거)
  const collectReports = (bossId: number): Array<{ code: string; fightID: number; startTime: number }> => {
    const dpsRanks = dpsRanksMap.get(bossId) || [];
    const hpsRanks = hpsRanksMap.get(bossId) || [];
    const reportsMap = new Map<string, { code: string; fightID: number; startTime: number }>();
    
    [...dpsRanks, ...hpsRanks].forEach(rank => {
      if (rank.report?.code && rank.report?.fightID) {
        const key = `${rank.report.code}-${rank.report.fightID}`;
        reportsMap.set(key, { 
            code: rank.report.code, 
            fightID: rank.report.fightID,
            startTime: (rank as any).startTime || 0
        });
      }
    });
    
    return Array.from(reportsMap.values());
  };
  
  const boss1Reports = collectReports(SEASON_2_BOSS_1_ID);
  const boss3Reports = collectReports(SEASON_2_BOSS_3_ID);
  const boss8Reports = collectReports(SEASON_2_BOSS_8_ID);
  
  if (boss1Reports.length === 0 && boss3Reports.length === 0 && boss8Reports.length === 0) {
    return;
  }

  // 개별 리포트 디버프 조회 함수
  const queryDebuffForReport = async (
    report: { code: string; fightID: number },
    abilityId: number
  ): Promise<number | null> => {
    try {
      const query = `
        query GetDebuffTable {
          reportData {
            report(code: "${report.code}") {
              table(fightIDs: [${report.fightID}], dataType: Debuffs, abilityID: ${abilityId})
            }
          }
        }
      `;
      
      const result = await queryWarcraftLogs<{
        reportData: { report: { table: { data?: { auras?: Array<{ name: string; totalUses: number; guid?: number }> } } } | null };
      }>(query, {});
      
      if (!result.reportData?.report) return null; // 접근 불가
      
      const auras = result.reportData.report.table?.data?.auras || [];
      
      const playerAura = auras.find(
        aura => aura.name.toLowerCase() === playerName.toLowerCase()
      );
      
      return playerAura?.totalUses || 0;
    } catch {
      return null; // 오류 시 (private 등) null 반환
    }
  };

  // 1넴 상세 분석 (Batch Query)
  const boss1KillDetails: any[] = [];
  let boss1Avg = 0;

  if (boss1Reports.length > 0) {
      const reportQueries = boss1Reports.map((r, i) => `
          boss1_${i}: report(code: "${r.code}") {
              table(fightIDs: [${r.fightID}], dataType: Debuffs, abilityID: ${BOSS_1_DEBUFF_ABILITY_ID})
          }
      `).join('\n');
      
      const batchQuery = `query GetBoss1Debuffs { reportData { ${reportQueries} } }`;
      
      try {
          const result = await queryWarcraftLogs<any>(batchQuery, {});
          let myTotalDebuffs = 0;
          let validKills = 0;
          
          boss1Reports.forEach((r, i) => {
               const data = result.reportData?.[`boss1_${i}`];
               const auras = data?.table?.data?.auras || [];
               
               const breakdown = auras.map((a: any) => ({
                   name: a.name,
                   className: a.type || 'Unknown',
                   icon: a.icon || '',
                   count: a.totalUses
               })).sort((a: any, b: any) => b.count - a.count);
               
               // 본인 카운트 집계
               const myEntry = breakdown.find((b: any) => b.name.toLowerCase() === playerName.toLowerCase());
               if (myEntry) {
                   myTotalDebuffs += myEntry.count;
               }
               validKills++;
               
               boss1KillDetails.push({
                   code: r.code,
                   fightID: r.fightID,
                   startTime: r.startTime,
                   debuffBreakdown: breakdown
               });
          });
          
          if (validKills > 0) {
              boss1Avg = myTotalDebuffs / validKills;
          }
      } catch (e) {
          // console.error("Boss 1 Batch Error", e);
      }
  }

  // 3, 8넴 병렬 조회 (1넴 제외됨)
  const [boss3Results, boss8Results] = await Promise.all([
    Promise.allSettled(boss3Reports.map(r => queryDebuffForReport(r, BOSS_3_DEBUFF_ABILITY_ID))),
    Promise.allSettled(boss8Reports.map(r => queryDebuffForReport(r, BOSS_8_DEBUFF_ABILITY_ID)))
  ]);

  // 평균 집계 함수 (1, 3넴용)
  const aggregateResults = (results: PromiseSettledResult<number | null>[]): { total: number; valid: number } => {
    let total = 0;
    let valid = 0;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        total += result.value;
        valid++;
      }
    }
    return { total, valid };
  };

  const boss3Agg = aggregateResults(boss3Results);
  const boss3Avg = boss3Agg.valid > 0 ? boss3Agg.total / boss3Agg.valid : 0;

  // 8넴 집계 (특임 횟수 카운트)
  let boss8BombCount = 0;
  let boss8TotalKills = 0;
  for (const result of boss8Results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      boss8TotalKills++;
      if (result.value >= 1) { // 1회 이상이면 true
        boss8BombCount++;
      }
    }
  }
  

  // Season 2 8넴 추가 분석: Damage Taken from Ability 1218703 (Volcanic Heart)
  const boss8DamageTakenDetails: any[] = [];
  if (boss8Reports.length > 0) {
      try {
          const reportQueries = boss8Reports.map((r, i) => `
              boss8_dmg_${i}: report(code: "${r.code}") {
                  table(fightIDs: [${r.fightID}], dataType: DamageTaken, abilityID: 1218703)
              }
          `).join('\n');
          
          const batchQuery = `query GetBoss8DamageTaken { reportData { ${reportQueries} } }`;
          const result = await queryWarcraftLogs<any>(batchQuery, {});
          
          boss8Reports.forEach((r, i) => {
               const table = result.reportData?.[`boss8_dmg_${i}`]?.table;
               const entries = table?.data?.entries || [];
               
               const breakdown = entries.map((e: any) => ({
                   name: e.name,
                   className: e.type,
                   icon: e.icon,
                   total: e.total
               })).sort((a: any, b: any) => b.total - a.total);
               
               boss8DamageTakenDetails.push({
                   code: r.code,
                   fightID: r.fightID,
                   startTime: r.startTime,
                   breakdown
               });
          });
      } catch (e) {
          // console.error("Boss 8 Damage Taken Batch Error", e);
      }
  }
  
  season.analysisData = {
    ...season.analysisData,
    boss1AvgDebuff: Math.round(boss1Avg * 100) / 100,
    boss3AvgDebuff: Math.round(boss3Avg * 100) / 100,
    boss8BombCount,
    boss8TotalKills,
    boss1KillDetails,
    boss8DamageTakenDetails,
  };
}

// Season 3 보스 설정
const SEASON_3_BOSS_2_ID = 3131;  // 2넴
const SEASON_3_BOSS_9_ID = 3135;  // 디멘
const INFUSED_TANGLE_NAME = "Infused Tangle";
const BOSS_9_DEBUFF_ABILITY_ID = 1246930; // 8넴 특임 디버프 ID
const BOSS_9_STAR_DEBUFF_ABILITY_ID = 1254385; // 8넴 별조각 특임 디버프 ID



/**
 * Season 1 분석:
 * 6넴(Healer): Debuff 437343 힐량 분석
 */
async function fetchSeason1Analysis(
  season: SeasonData,
  playerName: string,
  dpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>,
  hpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>
): Promise<void> {
  if (season.zoneId !== 38) return;

  const dpsRanks = dpsRanksMap.get(SEASON_1_BOSS_6_ID) || [];
  const hpsRanks = hpsRanksMap.get(SEASON_1_BOSS_6_ID) || [];
  
  const uniqueReportsMap = new Map<string, any>();
  [...dpsRanks, ...hpsRanks].forEach((rank: any) => {
      if (rank.report?.code && rank.report?.fightID) {
          const key = `${rank.report.code}-${rank.report.fightID}`;
          uniqueReportsMap.set(key, {
             code: rank.report.code,
             fightID: rank.report.fightID,
             startTime: rank.startTime || 0,
             spec: rank.spec || ''
          });
      }
  });

  const allReports = Array.from(uniqueReportsMap.values());
  
  // 힐러 스펙인 킬만 필터링
  const healerKills = allReports.filter(kill => HEALER_SPECS.some(s => kill.spec.includes(s)));

  const boss6KillDetails: any[] = [];

  if (healerKills.length > 0) {
      try {
          const reportQueries = healerKills.map((kill, idx) => `
            report_${idx}: report(code: "${kill.code}") {
                healing: table(fightIDs: [${kill.fightID}], dataType: Healing, targetAurasPresent: "${SEASON_1_DEBUFF_ID}")
                debuffs: table(fightIDs: [${kill.fightID}], dataType: Debuffs, abilityID: ${SEASON_1_DEBUFF_ID})
            }
          `).join('\n');

          const batchQuery = `query GetS1Boss6Analysis { reportData { ${reportQueries} } }`;
          const result = await queryWarcraftLogs<any>(batchQuery, {});

          healerKills.forEach((kill, idx) => {
              const rData = result.reportData?.[`report_${idx}`];
              if (!rData) return;

              const healingEntries = rData.healing?.data?.entries || [];
              const debuffAuras = rData.debuffs?.data?.auras || [];

              let totalDuration = 0;
              const targetAura = debuffAuras.length > 0 ? debuffAuras[0] : null;

              if (targetAura?.bands) {
                 totalDuration = targetAura.bands.reduce((acc: number, band: any) => acc + (band.endTime - band.startTime), 0) / 1000;
              }

              if (totalDuration > 0) {
                 const breakdown = healingEntries
                    .sort((a: any, b: any) => b.total - a.total)
                    .slice(0, 6)
                    .map((e: any) => ({
                        name: e.name,
                        className: e.type,
                        icon: e.icon,
                        total: e.total,
                        hps: e.total / totalDuration
                    }));

                 boss6KillDetails.push({
                     code: kill.code,
                     fightID: kill.fightID,
                     startTime: kill.startTime,
                     healerBreakdown: breakdown
                 });
              }
          });
      } catch (e) {
          // console.error(e);
      }
  }

  // --- Boss 8 Analysis (Queen Ansurek - 2922) ---
  const boss8Reports: Array<{ code: string; fightID: number; startTime: number }> = [];
  const boss8Ranks = [...(dpsRanksMap.get(2922) || []), ...(hpsRanksMap.get(2922) || [])];

  boss8Ranks.forEach((rank: any) => {
    if (rank.report?.code && rank.report?.fightID) {
      const startTime = rank.startTime || 0;
      const isDuplicate = boss8Reports.some(existing => 
         (existing.code === rank.report.code && existing.fightID === rank.report.fightID) ||
         (startTime > 0 && existing.startTime > 0 && Math.abs(existing.startTime - startTime) < 60000)
      );
      if (!isDuplicate) {
         boss8Reports.push({ code: rank.report.code, fightID: rank.report.fightID, startTime });
      }
    }
  });

  const boss8TotalKills = boss8Reports.length;
  let boss8JumpTaskCount = 0;
  let boss8PortalTaskCount = 0;
  let boss8EssenceTaskCount = 0;

  if (boss8TotalKills > 0) {
      try {
          // Batch Query
          const reportQueries = boss8Reports.map((kill, idx) => `
              r8_${idx}: report(code: "${kill.code}") {
                  jump: table(fightIDs: [${kill.fightID}], dataType: Debuffs, abilityID: 451278)
                  portal: table(fightIDs: [${kill.fightID}], dataType: Debuffs, abilityID: 464056)
                  essence: table(fightIDs: [${kill.fightID}], dataType: Debuffs, abilityID: 445152)
              }
          `).join('\n');
          
          const batchQuery = `query GetBoss8TasksBatch { reportData { ${reportQueries} } }`;
          const result = await queryWarcraftLogs<any>(batchQuery, {});
          
          boss8Reports.forEach((_, idx) => {
             const data = result.reportData?.[`r8_${idx}`];
             
             const checkDebuff = (auras: any[]) => auras?.some((a: any) => a.name === playerName);
             
             if (checkDebuff(data?.jump?.data?.auras)) boss8JumpTaskCount++;
             if (checkDebuff(data?.portal?.data?.auras)) boss8PortalTaskCount++;
             if (checkDebuff(data?.essence?.data?.auras)) boss8EssenceTaskCount++;
          });
      } catch (e) { /* S1 Boss 8 Analysis Error (Silent) */ }
  }

  season.analysisData = {
     ...season.analysisData,
     boss6KillDetails,
     boss8TotalKills,
     boss8JumpTaskCount,
     boss8PortalTaskCount,
     boss8EssenceTaskCount
  };
}

/**
 * Season 3 분석: 
 * 1. 2넴(DPS): Infused Tangle 비율
 * 2. 9넴(All): 특임 수행 여부
 */
async function fetchSeason3Analysis(
  season: SeasonData,
  playerName: string,
  dpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number }; name?: string }>>,
  hpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number }; name?: string }>>
): Promise<void> {
  // Season 3 (zoneId 44)만 처리
  if (season.zoneId !== 44) return;
  
  // --- 2넴 분석 (DPS 전용, DPS가 Main Role일 때만) ---
  let boss2FirstKillPercent: number | null = null;
  let boss2AvgPercent: number | null = null;
  
  // 역할별 총 킬 수 집계하여 Main Role 판별
  let totalDps = 0, totalHealer = 0, totalTank = 0;
  season.bossRankings.forEach(b => {
    totalDps += b.roles.DPS?.totalKills || 0;
    totalHealer += b.roles.Healer?.totalKills || 0;
    totalTank += b.roles.Tank?.totalKills || 0;
  });
  
  // 2넴 분석 (First Kill이 DPS일 때만 실행)
  const boss2 = season.bossRankings.find(b => b.encounterId === SEASON_3_BOSS_2_ID);
  let performBoss2Analysis = false;
  if (boss2) {
      const dpsTime = boss2.roles.DPS?.firstKillTimestamp || Infinity;
      const healerTime = boss2.roles.Healer?.firstKillTimestamp || Infinity;
      const tankTime = boss2.roles.Tank?.firstKillTimestamp || Infinity;
      
      // DPS First Kill Check (가장 빠른 킬이 DPS이거나 동률일 때)
      if (dpsTime !== Infinity && dpsTime <= healerTime && dpsTime <= tankTime) {
          performBoss2Analysis = true;
      }
  }

  const boss2KillDetails: any[] = [];

  if (performBoss2Analysis) {
      const allKillReports = (dpsRanksMap.get(SEASON_3_BOSS_2_ID) || [])
        .filter(r => r.report?.code && r.report?.fightID)
        .map(r => ({ 
            code: r.report!.code, 
            fightID: r.report!.fightID, 
            startTime: (r as any).startTime || 0,
            myParse: Math.round((r as any).rankPercent || 0)
        }));

      // Unique Reports
      const uniqueReports = Array.from(
         new Map(allKillReports.map(r => [`${r.code}-${r.fightID}`, r])).values()
      );

      if (uniqueReports.length > 0) {
        try {
          const reportQueries = uniqueReports.map((report, index) => 
            `kill${index}: report(code: "${report.code}") {
              table(fightIDs: [${report.fightID}], dataType: DamageDone)
            }`
          ).join('\n');
          
          const batchQuery = `query GetAllKillsDamage { reportData { ${reportQueries} } }`;
          const batchResult = await queryWarcraftLogs<any>(batchQuery, {});
          
          uniqueReports.forEach((report, index) => {
             const reportData = batchResult.reportData[`kill${index}`];
             const entries = reportData?.table?.data?.entries || [];
             
             const breakdown = entries
                .map((e: any) => {
                    if (!e.icon) return null;
                    const spec = e.icon.includes('-') ? e.icon.split('-')[1] : e.icon;
                    // DPS Only Check
                    if (HEALER_SPECS.some(s => spec.includes(s)) || TANK_SPECS.some(s => spec.includes(s))) return null;

                    const tangleTarget = e.targets?.find((t: any) => t.name === INFUSED_TANGLE_NAME);
                    const amount = tangleTarget?.total || 0;
                    const total = e.total || 0;
                    const percent = total > 0 ? (amount / total) * 100 : 0;
                    
                    return {
                        name: e.name,
                        className: e.type,
                        amount,
                        percent
                    };
                })
                .filter((e: any) => e !== null)
                .sort((a: any, b: any) => b.amount - a.amount);
             
             boss2KillDetails.push({
                 ...report,
                 myParse: (report as any).myParse,
                 entanglementBreakdown: breakdown
             });
          });
        } catch(e) { console.error("Boss 2 Analysis Error", e); }
      }
  }

  // --- 8넴 분석 (특임 수행 여부 - Roles 무관) ---
  // --- 8넴 분석 (특임 수행 여부 - Roles 무관) ---
  // --- 8넴 분석 (특임 수행 여부 - Roles 무관) ---
  let boss8SpecialCount = 0;
  let boss8StarCount = 0;
  let boss8TotalKills = 0;
  let boss8PhaseDamage: number | undefined;


  const dpsRanks = dpsRanksMap.get(SEASON_3_BOSS_9_ID) || [];
  const hpsRanks = hpsRanksMap.get(SEASON_3_BOSS_9_ID) || [];
  
  const uniqueBoss8Reports: Array<{ spec: string; code: string; fightID: number; startTime: number; reportStartTime: number; customStart?: number; customEnd?: number }> = [];

  [...dpsRanks, ...hpsRanks].forEach(rank => {
    if (rank.report?.code && rank.report?.fightID) {
      // startTime을 사용하여 중복 킬(다른 리포트) 제거
      // rank 타입에 startTime이 명시적으로 없으면 any로 접근
      const startTime = (rank as any).startTime || 0;
      const reportStartTime = 0;
      const spec = (rank as any).spec || 'Unknown';
      
      const isDuplicate = uniqueBoss8Reports.some(existing => {
        // 1. 완전히 같은 리포트
        if (existing.code === rank.report!.code && existing.fightID === rank.report!.fightID) return true;
        // 2. 다른 리포트지만 시작 시간이 60초 이내 (같은 전투로 간주)
        if (startTime > 0 && existing.startTime > 0 && Math.abs(existing.startTime - startTime) < 60000) return true;
        return false;
      });

      if (!isDuplicate) {
        uniqueBoss8Reports.push({ 
          code: rank.report!.code, 
          fightID: rank.report!.fightID,
          startTime,
          reportStartTime,
          spec
        });
      }
    }
  });

  if (uniqueBoss8Reports.length > 0) {
    // 1. Report Start Time들이 필요함 (DPS Query의 Offset 계산용)
    const uniqueReportCodes = Array.from(new Set(uniqueBoss8Reports.map(k => k.code)));
    if (uniqueReportCodes.length > 0) {
        try {
            const timeQueries = uniqueReportCodes.map((code, idx) => `r_${idx}: report(code: "${code}") { startTime }`).join('\n');
            const timeBatchQuery = `query GetReportStartTimes { reportData { ${timeQueries} } }`;
            const timeResult = await queryWarcraftLogs<any>(timeBatchQuery, {});
            
            const codeToStartTime = new Map<string, number>();
            uniqueReportCodes.forEach((code, idx) => {
                const r = timeResult.reportData?.[`r_${idx}`];
                if (r?.startTime) codeToStartTime.set(code, r.startTime);
            });
            uniqueBoss8Reports.forEach(kill => {
                const st = codeToStartTime.get(kill.code);
                if (st) kill.reportStartTime = st;
            });
        } catch(e) { /* Failed to fetch report start times (Silent) */ }
    }

    const boss8Reports = uniqueBoss8Reports;
    
    // 개별 쿼리 함수 (두 가지 디버프 동시 확인 + 페이즈 디버프 시간 확인)
    const checkBoss8Debuff = async (report: { code: string; fightID: number }) => {
      try {
        const query = `
          query GetBoss8Debuffs {
            reportData {
              report(code: "${report.code}") {
                special: table(fightIDs: [${report.fightID}], dataType: Debuffs, abilityID: ${BOSS_9_DEBUFF_ABILITY_ID})
                star: table(fightIDs: [${report.fightID}], dataType: Debuffs, abilityID: ${BOSS_9_STAR_DEBUFF_ABILITY_ID})
                phase: table(fightIDs: [${report.fightID}], dataType: Debuffs, abilityID: 1245292, hostilityType: Enemies)
              }
            }
          }
        `;
        const result = await queryWarcraftLogs<{
            reportData: { 
              report: { 
                special: { data?: { auras?: Array<{ name: string; totalUses: number }> } };
                star: { data?: { auras?: Array<{ name: string; totalUses: number }> } };
                phase: { data?: { auras?: Array<{ bands?: Array<{ startTime: number; endTime: number }> }> } };
              } | null 
            };
        }>(query, {});

        if (!result.reportData?.report) return { special: 0, star: 0 };
        
        const getCount = (auras: Array<{ name: string; totalUses: number }> | undefined) => {
           return auras?.find(a => a.name.toLowerCase() === playerName.toLowerCase())?.totalUses || 0;
        };

        const phaseBand = result.reportData.report.phase?.data?.auras?.[0]?.bands?.[0];

        return {
           special: getCount(result.reportData.report.special?.data?.auras),
           star: getCount(result.reportData.report.star?.data?.auras),
           phase: phaseBand ? { startTime: phaseBand.startTime, endTime: phaseBand.endTime } : undefined
        };
      } catch {
        return { special: 0, star: 0 }; // 오류 무시
      }
    };

    const results = await Promise.allSettled(boss8Reports.map(r => checkBoss8Debuff(r)));
    
    results.forEach((res, index) => {
      if (res.status === 'fulfilled') {
        boss8TotalKills++;
        if (res.value.special >= 1) boss8SpecialCount++;
        if (res.value.star >= 1) boss8StarCount++;
        
        if (res.value.phase) {
          boss8Reports[index].customStart = res.value.phase.startTime;
          boss8Reports[index].customEnd = res.value.phase.endTime;
        }
      }
    });






      // 힐러 스펙인 킬(All Kills)에 대해 별조각(Starshard) 힐량 분석 (Batch)
      const healerKills = uniqueBoss8Reports.filter(kill => HEALER_SPECS.some(s => kill.spec.includes(s)));
      if (healerKills.length > 0) {
        try {
            // Batch Query 생성
            const reportQueries = healerKills.map((kill, idx) => {
               let query = `
               report_${idx}: report(code: "${kill.code}") {
                  healing: table(
                      fightIDs: [${kill.fightID}], dataType: Healing, targetAurasPresent: "1254385"
                  )
                  debuffs: table(
                      fightIDs: [${kill.fightID}], dataType: Debuffs, targetAurasPresent: "1254385"
                  )
               `;
               
               if (kill.customStart && kill.customEnd) {
                 query += `
                  damage: table(
                      fightIDs: [${kill.fightID}], 
                      dataType: DamageDone, 
                      startTime: ${kill.customStart}, 
                      endTime: ${kill.customEnd},
                      filterExpression: "source.name='${playerName}' or source.owner.name='${playerName}'"
                  )
                 `;
               }
               
               query += `}`;
               return query;
            }).join('\n');

            const batchQuery = `
              query GetStarshardHealingBatch {
                 reportData {
                    ${reportQueries}
                 }
              }
            `;
            
            const result = await queryWarcraftLogs<any>(batchQuery, {});
            
            // 결과 파싱 및 할당
            healerKills.forEach((kill, idx) => {
                 const reportData = result.reportData?.[`report_${idx}`];
                 if (reportData) {
                    const healingEntries = reportData.healing?.data?.entries;
                    const debuffAuras = reportData.debuffs?.data?.auras;
                    const damageEntries = reportData.damage?.data?.entries;
                    
                    if (damageEntries && damageEntries.length > 0) {
                        (kill as any).phaseDamage = damageEntries[0].total;
                    } else if (kill.customStart) {
                         (kill as any).phaseDamage = 0;
                    }
                    
                    if (healingEntries && debuffAuras) {
                        const starshardAura = debuffAuras.find((a: any) => a.name === "Starshard");
                        const bands = starshardAura?.bands;
                        if (bands && bands.length > 0) {
                           const totalDuration = bands.reduce((sum: number, band: any) => sum + (band.endTime - band.startTime), 0) / 1000;
                           if (totalDuration > 0) {
                               (kill as any).healerBreakdown = healingEntries
                                 .sort((a: any, b: any) => b.total - a.total)
                                 .slice(0, 6)
                                 .map((entry: any) => ({
                                    name: entry.name,
                                    icon: entry.icon,
                                    total: entry.total,
                                    hps: entry.total / totalDuration
                                 }));
                           }
                        }
                    }
                 }
            });

        } catch (e) { console.error(`[Boss9 Batch Debug] Error:`, e); }
      }

      // [New] DPS 스펙인 킬에 대해 공허(1228206) 내부에서의 피격 분석 (Batch)
      const dpsKills = uniqueBoss8Reports.filter(kill => 
          !HEALER_SPECS.some(s => kill.spec.includes(s)) && 
          !TANK_SPECS.some(s => kill.spec.includes(s))
      );
      
      if (dpsKills.length > 0) {
          try {
              const dpsQueries = dpsKills.map((kill, idx) => {
                 // Calculate Relative Start Time for Query (Offset)
                 const fightOffset = kill.startTime - kill.reportStartTime;
                 const queryStart = fightOffset > 0 ? fightOffset + 25000 : 0; // 25초부터
                 const queryEnd = fightOffset > 0 ? fightOffset + 180000 : 9999999999; // 3분까지
                 
                 const timeParams = (kill.reportStartTime > 0) 
                    ? `startTime: ${queryStart}, endTime: ${queryEnd},` 
                    : '';

                 return `
                 dps_${idx}: report(code: "${kill.code}") {
                    hits: table(
                        fightIDs: [${kill.fightID}], 
                        dataType: DamageTaken,
                        abilityID: 1243702,
                        ${timeParams}
                    )
                    hits_void: table(
                        fightIDs: [${kill.fightID}], 
                        dataType: DamageTaken,
                        abilityID: 1243702,
                        targetAurasPresent: "1228206",
                        ${timeParams}
                    )
                 }`;
              }).join('\n');
              
              const batchQuery = `
                query GetDPSHitsBatch {
                    reportData {
                        ${dpsQueries}
                    }
                }
              `;
              
              const result = await queryWarcraftLogs<any>(batchQuery, {});
              
              dpsKills.forEach((kill, idx) => {
                  const reportData = result.reportData?.[`dps_${idx}`];
                  const hitsEntries = reportData?.hits?.data?.entries || [];
                  const voidEntries = reportData?.hits_void?.data?.entries || [];
                  
                  const voidMap = new Set();
                  voidEntries.forEach((e: any) => voidMap.add(e.name));

                  if (hitsEntries.length > 0) {
                      (kill as any).hitsBreakdown = hitsEntries
                          .map((entry: any) => ({
                              name: entry.name,
                              className: entry.type,
                              icon: entry.icon,
                              hitCount: entry.hitCount || 0,
                              hasVoidHit: voidMap.has(entry.name)
                          }))
                          .sort((a: any, b: any) => b.hitCount - a.hitCount);
                  }
              });
          } catch (e) { console.error(`[DPS Batch Debug] Error:`, e); }
      }
    }
  

  // --- Boss 7: 1227549 Healing Analysis (Healers) ---
  const boss7Kills: Array<{ code: string; fightID: number; startTime: number; spec: string }> = [];
  const boss7Ranks = [...(dpsRanksMap.get(3134) || []), ...(hpsRanksMap.get(3134) || [])];
  
  boss7Ranks.forEach(rank => {
       if (rank.report?.code && rank.report?.fightID) {
           const startTime = (rank as any).startTime || 0;
           const spec = (rank as any).spec || '';
           
           const isDuplicate = boss7Kills.some(existing => {
               // 1. 완전히 같은 리포트
               if (existing.code === rank.report!.code && existing.fightID === rank.report!.fightID) return true;
               // 2. 다른 리포트지만 시작 시간이 60초 이내 (같은 전투로 간주)
               if (startTime > 0 && existing.startTime > 0 && Math.abs(existing.startTime - startTime) < 60000) return true;
               return false;
           });

           if (!isDuplicate) {
               boss7Kills.push({
                   code: rank.report.code,
                   fightID: rank.report.fightID,
                   startTime,
                   spec
               });
           }
       }
  });

  const healerBoss7Kills = boss7Kills.filter(kill => HEALER_SPECS.some(s => kill.spec.includes(s)));

  const boss7HealingDetails: any[] = [];
  if (healerBoss7Kills.length > 0) {
      try {
          const reportQueries = healerBoss7Kills.map((kill, idx) => `
              r7_${idx}: report(code: "${kill.code}") {
                  healing: table(fightIDs: [${kill.fightID}], dataType: Healing, targetAurasPresent: "1227549")
              }
          `).join('\n');
          
          const batchQuery = `query GetBoss7HealingBatch { reportData { ${reportQueries} } }`;
          const result = await queryWarcraftLogs<any>(batchQuery, {});
          
          healerBoss7Kills.forEach((kill, idx) => {
               const reportData = result.reportData?.[`r7_${idx}`];
               const healingEntries = reportData?.healing?.data?.entries || [];
               
               const breakdown = healingEntries.map((e: any) => ({
                   name: e.name,
                   className: e.type,
                   icon: e.icon,
                   total: e.total // Raw Healing
               })).sort((a: any, b: any) => b.total - a.total);
               
               if (breakdown.length > 0) {
                   boss7HealingDetails.push({
                       code: kill.code,
                       fightID: kill.fightID,
                       startTime: kill.startTime,
                       breakdown
                   });
               }
          });
      } catch (e) {
          // console.error("Boss 7 Analysis Error", e);
      }
  }

  // 결과 저장
  season.analysisData = {
    ...season.analysisData,
    boss2FirstKillTanglePercent: boss2FirstKillPercent !== null ? Math.round(boss2FirstKillPercent * 100) / 100 : undefined,
    boss2AvgTanglePercent: boss2AvgPercent !== null ? Math.round(boss2AvgPercent * 100) / 100 : undefined,
    boss8SpecialCount,
    boss8StarCount,
    boss8TotalKills,
    boss8PhaseDamage,

    boss8KillDetails: uniqueBoss8Reports,
    boss2KillDetails,
    boss7HealingDetails,
  };
}

// Power Infusion 버프 ID (10060)
const POWER_INFUSION_ABILITY_ID = 10060;

/**
 * DPS Best % 전투에서 Power Infusion 받은 횟수 체크 (Batch 처리)
 * 모든 보스를 한번의 API 호출로 조회 (Shadow Priest 제외)
 */
async function fetchPowerInfusionCheckBatch(season: SeasonData, playerName: string): Promise<void> {
  // 체크할 보스 목록 필터링
  const bossesToCheck = season.bossRankings.filter(boss => {
    const dpsData = boss.roles.DPS;
    if (!dpsData?.bestRankReportCode || !dpsData?.bestRankFightID) return false;
    // Shadow Priest는 PI를 본인이 시전하므로 제외
    if (dpsData.spec?.includes('Shadow')) return false;
    return true;
  });

  if (bossesToCheck.length === 0) return;

  try {
    // GraphQL aliases로 한번에 조회
    const reportQueries = bossesToCheck.map((boss, index) => {
      const dpsData = boss.roles.DPS!;
      return `boss${index}: report(code: "${dpsData.bestRankReportCode}") {
        table(fightIDs: [${dpsData.bestRankFightID}], dataType: Buffs, abilityID: ${POWER_INFUSION_ABILITY_ID})
      }`;
    }).join('\n');

    const query = `
      query GetAllPowerInfusion {
        reportData {
          ${reportQueries}
        }
      }
    `;

    const result = await queryWarcraftLogs<{
      reportData: Record<string, { table: unknown }>;
    }>(query, {});

    // 결과 처리
    bossesToCheck.forEach((boss, index) => {
      const reportData = result.reportData[`boss${index}`];
      if (!reportData) return;

      const tableData = reportData.table as {
        data?: {
          auras?: Array<{ name: string; totalUses: number }>;
        };
      };

      const playerAura = tableData?.data?.auras?.find(
        aura => aura.name.toLowerCase() === playerName.toLowerCase()
      );

      const dpsData = boss.roles.DPS!;
      dpsData.powerInfusionCount = playerAura?.totalUses ?? 0;
    });
  } catch {
    // batch 조회 실패 시 무시
  }
}
