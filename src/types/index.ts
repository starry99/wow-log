// Player role types
export type Role = 'Tank' | 'Healer' | 'DPS';

// API에서 받아오는 보스(Encounter) 정보
export interface Encounter {
  id: number;
  name: string;
}

// Zone(시즌/레이드) 정보
export interface ZoneData {
  id: number;
  name: string;
  encounters: Encounter[];
}

// 역할별 랭킹 데이터 (API 응답)
export interface RoleRanking {
  spec: string;                           // 모든 스펙 (쉼표 구분)
  totalKills: number;                     // 총 킬 수
  specKills: Record<string, number>;      // 스펙별 킬 수 (예: { "Holy": 6, "Discipline": 1 })
  dpsRankPercent?: number;                // DPS 백분위 랭킹 (가장 높은 값)
  hpsRankPercent?: number;                // HPS 백분위 랭킹 (가장 높은 값)
  bestRankReportCode?: string;            // Best % 기록한 리포트 코드
  bestRankFightID?: number;               // Best % 기록한 전투 ID
  healerCount?: number;                   // Best % 전투에서 힐러 수 (Healer 역할만)
  effectiveHealerCount?: number;          // 사실상 힐러 수 (2% 미만 힐러 제외)
  lowDpsCount?: number;                   // Best % 전투에서 19% 이하 DPS 수 (DPS 역할만)
  powerInfusionCount?: number;            // Best % 전투에서 Power Infusion 받은 횟수 (DPS만)
  firstKillTimestamp?: number;            // 첫 킬 타임스탬프 (Unix ms)
  firstKillReportCode?: string;           // 첫 킬 리포트 코드
  firstKillFightID?: number;              // 첫 킬 전투 ID
  fastestKill?: number;                   // 가장 빠른 킬 시간 (밀리초)
}

// 보스별 랭킹 데이터
export interface BossRanking {
  encounterId: number;
  encounterName: string;
  roles: {
    Tank?: RoleRanking;
    Healer?: RoleRanking;
    DPS?: RoleRanking;
  };
}

// 시즌(Zone)별 데이터
export interface SeasonData {
  zoneId: number;
  zoneName: string;
  imageUrl?: string;
  activeRoles: {
    Tank: boolean;
    Healer: boolean;
    DPS: boolean;
  };
  bossRankings: BossRanking[];
  // 추가 분석 결과
  analysisData?: {
    // Season 2: 1넴 평균 디버프 수
    boss1AvgDebuff?: number;
    // Season 2: 3넴 평균 디버프 수
    boss3AvgDebuff?: number;
    // Season 3: 2넴 퍼킬 Infused Tangle 비율
    boss2FirstKillTanglePercent?: number;
    // Season 3: 2넴 전체 평균 Infused Tangle 비율
    boss2AvgTanglePercent?: number;
    // Season 2: 8넴 폭탄목걸이 특임 분석
    boss8BombCount?: number;
    boss8TotalKills?: number;
    // Season 3: 9넴(막넴) -> 8넴으로 수정
    boss8SpecialCount?: number;
    boss8StarCount?: number;
    boss8TotalsKills?: number; // boss9TotalKills -> boss8TotalKills
    boss8PhaseDamage?: number;
    boss8KillDetails?: Array<{
      spec: string;
      code: string;
      fightID: number;
      startTime: number;
      reportStartTime: number;
      customStart?: number;
      customEnd?: number;
      phaseDamage?: number;
      hitsBreakdown?: Array<{
        name: string;
        className: string;
        icon: string;
        hitCount: number;
        hasVoidHit: boolean;
      }>;
      healerBreakdown?: Array<{
        name: string;
        icon: string;
        total: number;
        hps: number;
      }>;
    }>;
    boss2KillDetails?: Array<{
      code: string;
      fightID: number;
      startTime: number;
      entanglementBreakdown: Array<{
        name: string;
        className: string;
        icon: string;
        amount: number;
        percent: number;
      }>;
      myParse?: number;
    }>;
    boss1KillDetails?: Array<{
      code: string;
      fightID: number;
      startTime: number;
      debuffBreakdown: Array<{
        name: string;
        className: string;
        icon: string;
        count: number;
      }>;
    }>;
    // Season 1: 6넴 상세 분석
    boss6KillDetails?: Array<{
       code: string;
       fightID: number;
       startTime: number;
       phaseDamage?: number;
       healerBreakdown?: Array<{
          name: string;
          className?: string;
          icon: string;
          total: number;
          hps: number;
       }>;
    }>;
    // Season 2: 8넴 받피량 분석
    boss8DamageTakenDetails?: Array<{
       code: string;
       fightID: number;
       startTime: number;
       breakdown: Array<{
          name: string;
          className: string;
          icon: string;
          total: number;
       }>;

    }>;
    // Season 3: 7넴 힐량 분석
    boss7HealingDetails?: Array<{
       code: string;
       fightID: number;
       startTime: number;
       breakdown: Array<{
          name: string;
          className: string;
          icon: string;
          total: number;
       }>;
    }>;
    // Season 1: 8넴 특임 분석 (Queen Ansurek)
    boss8JumpTaskCount?: number;   // 451278
    boss8PortalTaskCount?: number; // 464056
    boss8EssenceTaskCount?: number; // 445152

  };
}

// 검색 파라미터
export interface SearchParams {
  nickname: string;
  region: string;
  server: string;
}

// 전체 분석 결과
export interface AnalysisResult {
  playerName: string;
  classID: number;
  seasons: SeasonData[];
  // 상세 분석용 내부 데이터
  _ranksData?: {
    dpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>;
    hpsRanksMap: Map<number, Array<{ report?: { code: string; fightID: number } }>>;
  };
}

// 시즌 클리어 상태 (초기 빠른 조회용)
export interface SeasonClearStatus {
  zoneId: number;
  zoneName: string;
  killedBossCount: number;
  isFullClear: boolean;
}

// 초기 검색 결과 (가벼운 조회)
export interface InitialSearchResult {
  playerName: string;
  classID: number;
  seasonStatus: SeasonClearStatus[];
}

// ========== 점수/가중치 시스템 ==========

// 보스별 가중치 설정
export interface BossWeight {
  encounterId: number;
  encounterName: string;
  weight: number;       // 0~100 가중치
  hasTactics: boolean;  // 택틱 점수가 있는 보스인지
  tacticsScore?: number; // 수동 입력 택틱 점수 (0~100)
}

// 역할별 점수 가중치
export interface RoleScoreWeights {
  // Tank: DPS점수 + HPS점수 가중치
  // Healer: HPS점수 + 택틱점수 가중치
  // DPS: DPS점수 + 택틱점수 가중치
  primary: number;    // 첫 번째 점수 가중치 (Tank=DPS, Healer=HPS, DPS=DPS)
  secondary: number;  // 두 번째 점수 가중치 (Tank=HPS, Healer=Tactics, DPS=Tactics)
}

// 시즌별 점수 설정
export interface SeasonScoreConfig {
  zoneId: number;
  bossWeights: BossWeight[];
  roleWeights: Record<Role, RoleScoreWeights>;
}
