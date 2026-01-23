import { useState, useMemo, useRef, useEffect } from 'react';
import type { SeasonData, Role, BossRanking, RoleRanking, AnalysisResult } from '../types';
import { 
  createDefaultScoreConfig, 
  calculateWeightedScore,
  getFirstKillColor, 
  getFirstKillColorClass,
  calculateDebuffScore,
  calculateAnalysisScore,
  SEASON_2_ANALYSIS_WEIGHTS,
  getBossPercentWeights,
  getRecommendedHealers,
  calculateKillWeekScore,
} from '../config/scoreSettings';
import { getSpecImage, HIDDEN_ANALYSIS_CONFIG, HEALER_SPECS, HEALER_PHASE_DAMAGE_THRESHOLDS, CLASS_INFO, TANK_SPECS } from '../config/classSpecs';
import { fetchDetailedAnalysis } from '../api/warcraftLogs';

const AnalysisTitleWithPopup = ({ title, description, date }: { title: string, description: React.ReactNode, date?: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center mb-1 z-20">
            <div 
                className="text-sm text-gray-400 font-medium border-b border-dotted border-gray-600 cursor-pointer hover:text-gray-200 transition-colors"
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            >
                {title}
            </div>
            {date && <span className="text-[10px] text-gray-500 font-normal font-mono block mt-0.5 sm:mt-0 sm:ml-1">({date})</span>}
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div 
                        className="absolute left-0 bottom-full mb-2 z-50 w-64 p-3 bg-gray-900 border border-gray-600 rounded shadow-xl text-xs text-gray-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-1 font-bold text-gray-200">{title}</div>
                        <div>{description}</div>
                    </div>
                </>
            )}
        </div>
    );
};

const getClassColorByName = (className: string) => {
  const entry = Object.values(CLASS_INFO).find(c => c.name === className || c.slug === className.toLowerCase());
  return entry ? entry.color : '#888888';
};

const NAWithPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <span className="relative inline-block ml-1">
      <span 
        className="cursor-pointer underline decoration-dotted decoration-gray-500 hover:text-gray-300"
        onClick={() => setIsOpen(!isOpen)}
        title="클릭하여 상세 정보 확인"
      >
        N/A
      </span>
      {isOpen && (
        <div ref={popupRef} className="absolute right-0 top-full mt-2 z-50 min-w-[220px] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-left shadow-xl">

            <div className="text-white text-sm leading-relaxed whitespace-pre-line text-left">
              닉네임 변경 등으로 검색 불가능
            </div>
          </div>
        </div>
      )}
    </span>
  );
};

interface SeasonTableProps {
  season: SeasonData;
  classID?: number;
  analysisResult?: AnalysisResult;
  onSeasonUpdate?: (season: SeasonData) => void;
  showTableByDefault?: boolean;  // SeasonCard에서 사용할 때 true
}

// 역할별 색상 (아이콘은 스펙 이미지로 대체)
const roleConfig: Record<Role, { label: string; color: string; bgColor: string }> = {
  Tank: { label: '탱커', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  Healer: { label: '힐러', color: 'text-green-400', bgColor: 'bg-green-500/20' },
  DPS: { label: '딜러', color: 'text-red-400', bgColor: 'bg-red-500/20' },
};

// 역할별 컬럼 정의
type ColumnKey = 'specKills' | 'firstKill' | 'bestRank' | 'tankDps' | 'tankHps';

interface ColumnDef {
  key: ColumnKey;
  label: string;
}

// 기본 컬럼 (Healer, DPS용)
const defaultColumns: ColumnDef[] = [
  { key: 'specKills', label: '스펙 (Kills)' },
  { key: 'firstKill', label: 'First Kill' },
  { key: 'bestRank', label: 'Best %' },
];

// 탱커 전용 컬럼 (DPS/HPS 분리)
const tankColumns: ColumnDef[] = [
  { key: 'specKills', label: '스펙 (Kills)' },
  { key: 'firstKill', label: 'First Kill' },
  { key: 'tankDps', label: 'DPS' },
  { key: 'tankHps', label: 'HPS' },
];

// 역할에 따른 컬럼 반환
function getColumnsForRole(role: Role): ColumnDef[] {
  return role === 'Tank' ? tankColumns : defaultColumns;
}

// WarcraftLogs 스타일 랭킹 색상
function getRankColor(percent: number): string {
  if (percent === 100) return 'text-amber-300';
  if (percent >= 99) return 'text-pink-400';
  if (percent >= 95) return 'text-orange-400';
  if (percent >= 75) return 'text-purple-400';
  if (percent >= 50) return 'text-blue-400';
  if (percent >= 25) return 'text-green-400';
  return 'text-gray-400';
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '-';
  // 정확히 100점만 100으로 표시
  if (value === 100) return '100';
  // 99.95 이상 100 미만은 99.9로 표시 (반올림으로 100이 되는 것 방지)
  if (value >= 99.95 && value < 100) return '99.9';
  return value.toFixed(1);
}

// 시즌별 오픈 날짜
const SEASON_OPEN_DATES: Record<number, number> = {
  38: new Date('2024-09-12T08:00:00+09:00').getTime(),
  42: new Date('2025-03-06T08:00:00+09:00').getTime(),
  44: new Date('2025-08-14T08:00:00+09:00').getTime(),
};

// 시즌별 막넴 한퍼킬 날짜 (주차 계산 기준)
const KR_FIRST_KILL_DATES: Record<number, number> = {
  38: new Date('2024-10-17T08:00:00+09:00').getTime(), // Season 1 (Queen Ansurek)
  42: new Date('2025-03-24T08:00:00+09:00').getTime(), // Season 2 (Gallywix)
  44: new Date('2025-09-02T08:00:00+09:00').getTime(), // Season 3 (Dimensius)
};



// 패치 날짜
const PATCH_DATES: Array<{ version: string; startTime: number; endTime?: number }> = [
  { version: '11.0', startTime: new Date('2024-09-12T08:00:00+09:00').getTime() },
  { version: '11.0.5', startTime: new Date('2024-10-24T08:00:00+09:00').getTime() },
  { version: '11.0.7', startTime: new Date('2024-12-19T08:00:00+09:00').getTime() },
  { version: '11.1.0', startTime: new Date('2025-03-06T08:00:00+09:00').getTime() },
  { version: '11.1.5', startTime: new Date('2025-04-24T08:00:00+09:00').getTime() },
  { version: '11.1.7', startTime: new Date('2025-06-19T08:00:00+09:00').getTime() },
  { version: '11.2.0', startTime: new Date('2025-08-14T08:00:00+09:00').getTime() },
  { version: '11.2.5', startTime: new Date('2025-10-09T08:00:00+09:00').getTime() },
  { version: '11.2.7', startTime: new Date('2025-12-04T08:00:00+09:00').getTime(), endTime: new Date('2026-01-22T08:00:00+09:00').getTime() },
];

function getPatchVersion(timestamp: number): string | null {
  for (let i = PATCH_DATES.length - 1; i >= 0; i--) {
    const patch = PATCH_DATES[i];
    if (timestamp >= patch.startTime) {
      if (patch.endTime && timestamp >= patch.endTime) continue;
      return patch.version;
    }
  }
  return null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function calculateFirstKillInfo(timestamp: number | undefined, zoneId: number): { week: number; day: number } | null {
  if (!timestamp) return null;
  const openDate = SEASON_OPEN_DATES[zoneId];
  if (!openDate) return null;
  const diffMs = timestamp - openDate;
  if (diffMs < 0) return null;
  const wowDays = Math.floor(diffMs / ONE_DAY_MS);
  const week = Math.floor(wowDays / 7) + 1;
  const day = (wowDays % 7) + 1;
  return { week, day };
}

const WOW_WEEK_ANCHOR = 1704322800000; // 2024-01-04 08:00:00 KST
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function calculateKrFirstKillDiffWeek(timestamp: number | undefined, zoneId: number): number | null {
  if (!timestamp) return null;
  const krDate = KR_FIRST_KILL_DATES[zoneId];
  if (!krDate) return null;
  
  const getWeekIndex = (ts: number) => Math.floor((ts - WOW_WEEK_ANCHOR) / ONE_WEEK_MS);

  const krWeek = getWeekIndex(krDate);
  const killWeek = getWeekIndex(timestamp);
  
  return killWeek - krWeek;
}

// 시즌별 배경 이미지
const SEASON_BACKGROUNDS: Record<number, string> = {
  38: '/images/nerub-ar-palace.jpg',
  42: '/images/undermine.jpg',
  44: '/images/manaforge-omega.jpg',
};


// DPS 주작 감지 설정
const DPS_CHEAT_THRESHOLD = {
  minBestPercent: 99.0,   // Best % 99 이상일 때만 체크
  maxLowDpsPercent: 19,   // 19% 이하 DPS
  minLowDpsCount: 6,      // 6명 이상이면 경고
};

// Power Infusion 아이콘 설정
const POWER_INFUSION_ICON_URL = 'https://wow.zamimg.com/images/wow/icons/small/spell_holy_powerinfusion.jpg';
const POWER_INFUSION_MIN_COUNT = 2;  // 2회 이상이면 아이콘 표시



export function SeasonTable({ season, classID, analysisResult, onSeasonUpdate, showTableByDefault = false }: SeasonTableProps) {
  const [chartIndex, setChartIndex] = useState(0);
  const [boss1ChartIndex, setBoss1ChartIndex] = useState(0);
  const [boss2ChartIndex, setBoss2ChartIndex] = useState(0);
  const [boss6ChartIndex, setBoss6ChartIndex] = useState(0);
  const [boss8ChartIndex, setBoss8ChartIndex] = useState(0);
  const [boss7ChartIndex, setBoss7ChartIndex] = useState(0);
  // showTableByDefault여도 역할은 사용자가 선택해야 함
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(showTableByDefault);
  const [healerRecPopup, setHealerRecPopup] = useState<number | null>(null);  // encounterId
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [detailedLoaded, setDetailedLoaded] = useState(showTableByDefault);
  
  // 권장 힐러 수 설정
  const recommendedHealers = useMemo(() => getRecommendedHealers(season.zoneId), [season.zoneId]);
  
  const scoreConfigs = useMemo(() => createDefaultScoreConfig(), []);
  const scoreConfig = scoreConfigs.find(c => c.zoneId === season.zoneId);
  
  const roles: Role[] = ['Tank', 'Healer', 'DPS'];

  // 역할별 사용된 스펙 목록 (첫 번째 스펙만 표시용)
  const roleSpecs = useMemo(() => {
    const specs: Record<Role, string[]> = { Tank: [], Healer: [], DPS: [] };
    
    season.bossRankings.forEach(boss => {
      roles.forEach(role => {
        const roleData = boss.roles[role];
        if (roleData?.specKills) {
          Object.keys(roleData.specKills).forEach(specName => {
            if (!specs[role].includes(specName)) {
              specs[role].push(specName);
            }
          });
        }
      });
    });
    
    return specs;
  }, [season.bossRankings]);

  // 킬한 보스 수 계산 (역할 상관없이 하나라도 잡았으면 카운트)
  const killedBossCount = useMemo(() => {
    const killedBossIds = new Set<number>();
    season.bossRankings.forEach(boss => {
      const hasKill = Object.values(boss.roles).some(roleData => 
        roleData && roleData.totalKills > 0
      );
      if (hasKill) {
        killedBossIds.add(boss.encounterId);
      }
    });
    return killedBossIds.size;
  }, [season.bossRankings]);

  const totalBossCount = 8;
  const isFullClear = killedBossCount === totalBossCount;

  // 상세 분석 데이터 로드
  const handleLoadDetailedAnalysis = async () => {
    if (detailedLoaded || detailedLoading || !analysisResult?._ranksData) return;
    
    setDetailedLoading(true);
    try {
      await fetchDetailedAnalysis(
        season,
        analysisResult.playerName,
        analysisResult._ranksData.dpsRanksMap,
        analysisResult._ranksData.hpsRanksMap
      );
      setDetailedLoaded(true);
      setShowAnalysis(true);
      onSeasonUpdate?.({ ...season });
    } catch {
      // 실패 시 무시
    } finally {
      setDetailedLoading(false);
    }
  };

  const getBossDataForRole = (boss: BossRanking, role: Role): RoleRanking | undefined => {
    return boss.roles[role];
  };

  // 역할에 맞는 랭킹 값 반환 (DPS역할이면 dpsRankPercent, Healer면 hpsRankPercent, Tank면 둘 중 높은 값)
  const getRoleRankPercent = (roleData: RoleRanking | undefined, role: Role): number | undefined => {
    if (!roleData) return undefined;
    
    switch (role) {
      case 'DPS':
        return roleData.dpsRankPercent;
      case 'Healer':
        return roleData.hpsRankPercent;
      case 'Tank':
        // 탱커는 DPS와 HPS 중 높은 값
        const dps = roleData.dpsRankPercent ?? 0;
        const hps = roleData.hpsRankPercent ?? 0;
        const best = Math.max(dps, hps);
        return best > 0 ? best : undefined;
    }
  };

  // BEST % 점수 계산 (보스별 가중치 적용)
  // Tank의 경우 DPS만 사용
  const calculateBestPercentScore = (role: Role): number => {
    const customWeights = getBossPercentWeights(season.zoneId);
    const scores: Array<{ score: number; weight: number }> = [];
    
    season.bossRankings.forEach(boss => {
      const roleData = boss.roles[role];
      let rankPercent: number | undefined;
      
      if (role === 'Tank') {
        // 탱커는 DPS만 사용
        rankPercent = roleData?.dpsRankPercent;
      } else {
        rankPercent = getRoleRankPercent(roleData, role);
      }
      
      if (rankPercent !== undefined) {
        // 커스텀 가중치가 있으면 사용, 없으면 균등 분배
        const customWeight = customWeights.find(w => w.encounterId === boss.encounterId);
        const weight = customWeight?.weight ?? (scoreConfig?.bossWeights.find(b => b.encounterId === boss.encounterId)?.weight ?? 1);
        scores.push({ score: rankPercent, weight });
      }
    });

    return calculateWeightedScore(scores);
  };

  // 추가평가 점수 계산 (셀별 가중치 적용)
  const calculateAdditionalScore = useMemo(() => {
    if (!isFullClear || season.zoneId !== 42) return 0;
    
    const cellScores = new Map<string, number>();
    
    // boss1_debuff 점수 계산
    const debuffScore = calculateDebuffScore(season.analysisData?.boss1AvgDebuff);
    cellScores.set('boss1_debuff', debuffScore);
    
    // 나머지 셀은 아직 미구현 (0점)
    // cellScores.set('consistency', 0);
    // cellScores.set('mechanics', 0);
    // ...
    
    return calculateAnalysisScore(cellScores, SEASON_2_ANALYSIS_WEIGHTS);
  }, [isFullClear, season.zoneId, season.analysisData?.boss1AvgDebuff]);

  // 힐러 주작 경고 카운트 (권장 힐러 수 미달 보스 개수)
  const healerCheatWarningCount = useMemo(() => {
    let count = 0;
    season.bossRankings.forEach(boss => {
      const healerData = boss.roles.Healer;
      if (!healerData?.hpsRankPercent) return;
      
      const healerConfig = recommendedHealers.find(h => h.encounterId === boss.encounterId);
      if (!healerConfig) return;
      
      const effectiveCount = healerData.effectiveHealerCount ?? healerData.healerCount;
      if (effectiveCount !== undefined && effectiveCount < healerConfig.minHealers) {
        count++;
      }
    });
    return count;
  }, [season.bossRankings, recommendedHealers]);

  // DPS 미주 카운트 (Power Infusion 받은 보스 개수)
  const dpsPowerInfusionCount = useMemo(() => {
    let count = 0;
    season.bossRankings.forEach(boss => {
      const dpsData = boss.roles.DPS;
      if (dpsData?.powerInfusionCount !== undefined && dpsData.powerInfusionCount >= POWER_INFUSION_MIN_COUNT) {
        count++;
      }
    });
    return count;
  }, [season.bossRankings]);

  // DPS 주작 경고 카운트 (lowDpsCount 기반)
  const dpsCheatWarningCount = useMemo(() => {
    let count = 0;
    season.bossRankings.forEach(boss => {
      const dpsData = boss.roles.DPS;
      const percent = dpsData?.dpsRankPercent;
      if (percent !== undefined && percent >= DPS_CHEAT_THRESHOLD.minBestPercent &&
          dpsData?.lowDpsCount !== undefined && 
          dpsData.lowDpsCount >= DPS_CHEAT_THRESHOLD.minLowDpsCount) {
        count++;
      }
    });
    return count;
  }, [season.bossRankings]);

  // 스펙+킬 렌더링 (아이콘 옆에 킬 수)
  const renderSpecKills = (roleData: RoleRanking | undefined) => {
    if (!roleData || !roleData.specKills) return <span className="text-gray-600">-</span>;
    
    const specEntries = Object.entries(roleData.specKills);
    if (specEntries.length === 0) return <span className="text-gray-600">-</span>;
    
    return (
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {specEntries.map(([specName, kills], index) => {
          const specImage = classID ? getSpecImage(classID, specName) : null;
          
          return (
            <div key={index} className="flex items-center gap-0.5">
              {specImage ? (
                <img 
                  src={specImage} 
                  alt={specName}
                  title={specName}
                  className="w-4 h-4 rounded-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-gray-500 text-xs">?</span>
              )}
              <span className="text-gray-400 text-xs">({kills})</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderColumnValue = (col: ColumnDef, roleData: RoleRanking | undefined, encounterId: number, role: Role) => {
    if (!roleData && col.key !== 'firstKill') {
      return <span className="text-gray-600">-</span>;
    }

    switch (col.key) {
      case 'specKills':
        return renderSpecKills(roleData);
      
      case 'firstKill': {
        const timestamp = roleData?.firstKillTimestamp;
        const info = calculateFirstKillInfo(timestamp, season.zoneId);
        if (!info) return <span className="text-gray-600">-</span>;
        
        const color = getFirstKillColor(info.week, encounterId, season.zoneId);
        const colorClass = getFirstKillColorClass(color);
        const patchVersion = timestamp ? getPatchVersion(timestamp) : null;
        
        return (
          <span className="text-sm">
            <span className={colorClass}>
              {info.week}주차 {info.day}일
            </span>
            {patchVersion && (
              <span className="text-gray-500 text-xs ml-1">
                ({patchVersion})
              </span>
            )}
          </span>
        );
      }
      
      case 'bestRank': {
        const percent = getRoleRankPercent(roleData, role);
        if (percent === undefined) return <span className="text-gray-600">-</span>;
        
        // Healer 역할: 힐러 수 및 경고 표시
        if (role === 'Healer' && roleData?.healerCount !== undefined) {
          const healerConfig = recommendedHealers.find(h => h.encounterId === encounterId);
          const minHealers = healerConfig?.minHealers ?? 4;
          const effectiveCount = roleData.effectiveHealerCount ?? roleData.healerCount;
          const isWarning = effectiveCount < minHealers;
          const showEffective = roleData.effectiveHealerCount !== undefined && 
                                roleData.effectiveHealerCount !== roleData.healerCount;
          
          return (
            <span className="flex items-center justify-center gap-1">
              <span className={getRankColor(percent)}>
                {formatPercent(percent)}
              </span>
              <span className="text-gray-400 text-xs">
                {showEffective ? (
                  <>사실상 {effectiveCount}힐</>
                ) : (
                  <>({roleData.healerCount}힐)</>
                )}
              </span>
              {isWarning && (
                <span 
                  className="text-yellow-400 cursor-help" 
                  title="주작 의심"
                >
                  ⚠️
                </span>
              )}
            </span>
          );
        }
        
        // DPS 역할: 99% 이상이고 lowDpsCount 있으면 경고, Power Infusion 아이콘 표시
        if (role === 'DPS') {
          const isCheatWarning = percent >= DPS_CHEAT_THRESHOLD.minBestPercent && 
                                 roleData?.lowDpsCount !== undefined && 
                                 roleData.lowDpsCount >= DPS_CHEAT_THRESHOLD.minLowDpsCount;
          const hasPowerInfusion = roleData?.powerInfusionCount !== undefined && 
                                   roleData.powerInfusionCount >= POWER_INFUSION_MIN_COUNT;
          
          return (
            <span className="flex items-center justify-center gap-1">
              <span className={getRankColor(percent)}>
                {formatPercent(percent)}
              </span>
              {hasPowerInfusion && (
                <img 
                  src={POWER_INFUSION_ICON_URL}
                  alt="Power Infusion"
                  title={`Power Infusion ${roleData?.powerInfusionCount}회`}
                  className="w-4 h-4 rounded-sm cursor-help"
                />
              )}
              {isCheatWarning && (
                <span 
                  className="text-yellow-400 cursor-help" 
                  title="주작 의심"
                >
                  ⚠️
                </span>
              )}
            </span>
          );
        }
        
        return (
          <span className={getRankColor(percent)}>
            {formatPercent(percent)}
          </span>
        );
      }
      
      case 'tankDps': {
        const dpsPercent = roleData?.dpsRankPercent;
        if (dpsPercent === undefined) return <span className="text-gray-600">-</span>;
        return (
          <span className={getRankColor(dpsPercent)}>
            {formatPercent(dpsPercent)}
          </span>
        );
      }
      
      case 'tankHps': {
        const hpsPercent = roleData?.hpsRankPercent;
        if (hpsPercent === undefined) return <span className="text-gray-600">-</span>;
        return (
          <span className={getRankColor(hpsPercent)}>
            {formatPercent(hpsPercent)}
          </span>
        );
      }
      
      default:
        return <span className="text-gray-600">-</span>;
    }
  };

  const currentBestPercent = activeRole ? calculateBestPercentScore(activeRole) : 0;
  const backgroundImage = SEASON_BACKGROUNDS[season.zoneId];

  return (
    <div className={showTableByDefault ? '' : 'bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden mb-6 max-w-2xl mx-auto'}>
      {/* 시즌 헤더 - showTableByDefault일 때는 간소화 */}
      {!showTableByDefault && (
        <div 
          className="relative px-5 py-5 border-b border-gray-800 flex flex-col items-center"
          style={{
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/80" />
          
          <div className="relative z-10 text-center">
            <h3 className="text-xl font-bold text-white mb-3">{season.zoneName}</h3>
            
            <div className="flex gap-2 justify-center">
              {roles.map((role) => {
                const isActive = season.activeRoles[role];
                const isSelected = activeRole === role;
                const config = roleConfig[role];
                const specNames = roleSpecs[role];
                
                return (
                  <button
                    key={role}
                    onClick={() => isActive && setActiveRole(isSelected ? null : role)}
                    disabled={!isActive}
                    className={`
                      px-3 py-1.5 rounded-lg text-sm font-medium
                      transition-all duration-200
                      flex items-center gap-1.5
                      ${isActive 
                        ? isSelected
                          ? `${config.bgColor} ${config.color} ring-2 ring-current`
                          : `${config.bgColor} ${config.color} hover:ring-1 hover:ring-current cursor-pointer`
                        : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                      }
                    `}
                  >
                    {isActive && classID && specNames.length > 0 && (
                      <span className="flex items-center gap-0.5">
                        {specNames.slice(0, 3).map((specName, idx) => {
                          const specImage = getSpecImage(classID, specName);
                          return specImage ? (
                            <img 
                              key={idx}
                              src={specImage} 
                              alt={specName}
                              title={specName}
                              className="w-5 h-5 rounded-sm"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : null;
                        })}
                      </span>
                    )}
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* showTableByDefault일 때는 역할 버튼만 */}
      {showTableByDefault && (
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex gap-2 justify-center">
            {roles.map((role) => {
              const isActive = season.activeRoles[role];
              const isSelected = activeRole === role;
              const config = roleConfig[role];
              const specNames = roleSpecs[role];
              
              return (
                <button
                  key={role}
                  onClick={() => isActive && setActiveRole(isSelected ? null : role)}
                  disabled={!isActive}
                  className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    flex items-center gap-1.5
                    ${isActive 
                      ? isSelected
                        ? `${config.bgColor} ${config.color} ring-2 ring-current`
                        : `${config.bgColor} ${config.color} hover:ring-1 hover:ring-current cursor-pointer`
                      : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                  {isActive && classID && specNames.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {specNames.slice(0, 3).map((specName, idx) => {
                        const specImage = getSpecImage(classID, specName);
                        return specImage ? (
                          <img 
                            key={idx}
                            src={specImage} 
                            alt={specName}
                            title={specName}
                            className="w-5 h-5 rounded-sm"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : null;
                      })}
                    </span>
                  )}
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* 테이블 + 점수 영역 */}
      {activeRole && (
        <>
          <div className="overflow-x-auto animate-in slide-in-from-top-2 duration-200 px-4">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="px-3 py-2 text-left text-gray-400 font-medium text-sm">보스</th>
                  {getColumnsForRole(activeRole).map((col) => (
                    <th key={col.key} className="px-3 py-2 text-center text-gray-400 font-medium text-sm">
                      {/* Healer일 때만 Best % 헤더에 (힐러수) 추가 */}
                      {col.key === 'bestRank' && activeRole === 'Healer' 
                        ? 'Best % (힐러수)' 
                        : col.label
                      }
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {season.bossRankings.map((boss, bossIndex) => {
                  const roleData = getBossDataForRole(boss, activeRole);
                  const healerRec = recommendedHealers.find(h => h.encounterId === boss.encounterId);
                  const totalBosses = season.bossRankings.length;
                  // 마지막 3개 로우는 팝업을 위로 표시
                  const isBottomRow = bossIndex >= totalBosses - 3;
                  
                  return (
                    <tr
                      key={boss.encounterId}
                      className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-3 py-2 text-white font-medium text-sm">
                        {boss.encounterName}
                      </td>
                      {getColumnsForRole(activeRole).map((col) => (
                        <td key={col.key} className="px-3 py-2 text-center text-sm relative">
                          {/* Best % 컬럼이고 Healer일 때 전체를 클릭 가능하게 */}
                          {col.key === 'bestRank' && activeRole === 'Healer' && healerRec?.description ? (
                            <>
                              <button
                                className="hover:opacity-80 cursor-pointer underline decoration-dotted decoration-gray-500"
                                onClick={() => setHealerRecPopup(healerRecPopup === boss.encounterId ? null : boss.encounterId)}
                              >
                                {renderColumnValue(col, roleData, boss.encounterId, activeRole)}
                              </button>
                              {/* 팝업 - 하단 3개 로우는 위로 표시 */}
                              {healerRecPopup === boss.encounterId && (
                                <div className={`absolute right-0 z-50 min-w-[180px] animate-in fade-in duration-150 ${
                                  isBottomRow 
                                    ? 'bottom-full mb-2 slide-in-from-bottom-1' 
                                    : 'top-full mt-2 slide-in-from-top-1'
                                }`}>
                                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                                    {/* 헤더 */}
                                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
                                      <span className="text-gray-400 font-medium text-sm">권장 힐러 수</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setHealerRecPopup(null);
                                        }}
                                        className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    {/* 내용 */}
                                    <div className="text-white text-xs leading-relaxed whitespace-pre-line">
                                      {healerRec.description}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            renderColumnValue(col, roleData, boss.encounterId, activeRole)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 추가 분석 섹션 - showTableByDefault가 아닐 때만 버튼 표시 */}
          {!showTableByDefault && (
            <div className="px-4 py-3 bg-gray-800/30 border-t border-gray-800">
              <div className="flex items-center justify-center gap-4">
                {/* 킬 수 카드 */}
                <div className={`
                  px-4 py-2 rounded-xl border-2 
                  ${isFullClear 
                    ? 'bg-green-500/10 border-green-500/50 shadow-lg shadow-green-500/20' 
                    : 'bg-gray-800/50 border-gray-700'
                  }
                `}>
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${isFullClear ? 'text-green-400' : 'text-gray-400'}`}>
                      {killedBossCount}/{totalBossCount}
                    </div>
                    <div className={`text-xs font-medium ${isFullClear ? 'text-green-500' : 'text-gray-500'}`}>
                      MYTHIC
                    </div>
                  </div>
                </div>
                
                {/* 메시지 또는 버튼 */}
                {!isFullClear ? (
                  <div className="text-gray-500 text-sm">
                    추가분석은 8/8M만 제공합니다
                  </div>
                ) : detailedLoaded ? (
                  <button
                    onClick={() => setShowAnalysis(!showAnalysis)}
                    className={`
                      px-3 py-1.5 rounded-lg font-medium text-sm
                      transition-all duration-200
                      ${showAnalysis 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30'
                      }
                    `}
                  >
                    {showAnalysis ? '분석 닫기' : '분석 보기'}
                  </button>
                ) : (
                  <button
                    onClick={handleLoadDetailedAnalysis}
                    disabled={detailedLoading}
                    className={`
                      px-3 py-1.5 rounded-lg font-medium text-sm
                      transition-all duration-200
                      ${detailedLoading
                        ? 'bg-gray-600 text-gray-400 cursor-wait'
                        : 'bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30'
                      }
                    `}
                  >
                    {detailedLoading ? '분석 중...' : '상세 분석'}
                  </button>
                )}
              </div>
            </div>
          )}



            {/* 추가분석 클릭 후에만 점수 표시 - showTableByDefault면 카드에서 표시하므로 여기선 숨김 */}
            {!showTableByDefault && showAnalysis && (
              <div className="flex items-center justify-center gap-6 pt-3 border-t border-gray-700">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-0.5">BEST %</div>
                  <div className={`text-lg font-bold ${getRankColor(currentBestPercent)}`}>
                    {formatPercent(currentBestPercent)}
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-0.5">추가평가</div>
                  <div className={`text-lg font-bold ${getRankColor(calculateAdditionalScore)}`}>
                    {calculateAdditionalScore > 0 ? calculateAdditionalScore.toFixed(1) : '-'}
                  </div>
                </div>

                <div className="text-center border-l border-gray-700 pl-6">
                  <div className="text-xs text-gray-500 mb-0.5">종합</div>
                  {(() => {
                    // 종합 = BEST % 70% + 추가평가 30%
                    const totalScore = calculateAdditionalScore > 0
                      ? (currentBestPercent * 0.7) + (calculateAdditionalScore * 0.3)
                      : currentBestPercent;
                    return (
                      <div className={`text-xl font-bold ${getRankColor(totalScore)}`}>
                        {formatPercent(totalScore)}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
        </>
      )}
      
      {!activeRole && (
        <div className="px-6 py-6 text-center text-gray-500">
          <p className="text-sm">역할 버튼을 클릭하여 보스별 데이터를 확인하세요</p>
        </div>
      )}
      
      {/* 분석 섹션 - 2개의 셀 */}
      {showTableByDefault && (
        <div className="px-4 pb-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            {/* 막넴 퍼킬 분석 */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-sm font-semibold text-purple-400 mb-3 pb-2 border-b border-gray-700">
                막넴 분석
              </h3>
              
              {/* 리스트 형식 내용 */}
              <div className="space-y-2 text-sm">


                {/* 시즌 1: 8넴 상세 분석 */}
                {season.zoneId === 38 && season.analysisData?.boss8TotalKills !== undefined && season.analysisData.boss8TotalKills > 0 && (
                  <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-gray-400 shrink-0">점프 특임:</span>
                        <span className="text-white text-right">
                          {season.analysisData.boss8TotalKills}킬 중 {season.analysisData.boss8JumpTaskCount || 0}회
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-gray-400 shrink-0">포탈 특임:</span>
                        <span className="text-white text-right">
                          {season.analysisData.boss8TotalKills}킬 중 {season.analysisData.boss8PortalTaskCount || 0}회
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-gray-400 shrink-0">정수 특임:</span>
                        <span className="text-white text-right">
                          {season.analysisData.boss8TotalKills}킬 중 {season.analysisData.boss8EssenceTaskCount || 0}회
                        </span>
                      </div>
                  </div>
                )}

                {/* 시즌 2: 8넴 폭탄목걸이 분석 */}
                {season.zoneId === 42 && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400 shrink-0">폭탄목걸이 특임:</span>
                    <span className="text-white text-right">
                      {season.analysisData?.boss8TotalKills
                        ? `${season.analysisData.boss8TotalKills}킬 중 ${season.analysisData.boss8BombCount || 0}회 (${((season.analysisData.boss8BombCount || 0) / season.analysisData.boss8TotalKills * 100).toFixed(1)}%)`
                        : <NAWithPopup />}
                    </span>
                  </div>
                )}
                


                {/* 시즌 2: 8넴 받피량 분석 */}
                {season.zoneId === 42 && (() => {
                     const details = season.analysisData?.boss8DamageTakenDetails || [];
                     if (details.length === 0) return null;
                     
                     const sortedKills = [...details].sort((a,b) => a.startTime - b.startTime);
                     const safeIndex = Math.min(boss8ChartIndex, sortedKills.length - 1);
                     const currentKill = sortedKills[safeIndex];
                     const breakdown = currentKill.breakdown || [];
                     
                     const myName = analysisResult?.playerName;
                     let myEntry = breakdown.find(e => e.name === myName);
                     if (!myEntry && myName) {
                         // 0 damage
                         myEntry = { name: myName, total: 0, icon: '', className: '' }; 
                     }
                     
                     const topList = breakdown.slice(0, 8);
                     const myIndex = breakdown.findIndex(e => e.name === myName);
                     const showSeparateMe = myName && (myIndex === -1 || myIndex >= 8); // Show if not in top 8
                     
                     const maxTotal = breakdown.length > 0 ? breakdown[0].total : (myEntry?.total || 0);

                     const renderRow = (entry: any, rank: number | string) => {
                         const isMe = entry.name === myName;
                         const barPercent = maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0;
                         const color = getClassColorByName(entry.className);
                         
                         return (
                            <div key={entry.name} className={`flex items-center h-5 px-1 rounded ${isMe ? 'bg-white/10' : ''}`}>
                               <span className={`w-4 text-center font-mono text-[10px] shrink-0 ${(typeof rank === 'number' && rank <= 3) ? 'text-purple-300 font-bold' : 'text-gray-500'}`}>{rank}</span>
                                 {entry.icon && (
                                  <img 
                                      src={`/images/specs/${entry.icon.toLowerCase()}.webp`} 
                                      className="w-3.5 h-3.5 rounded-sm mx-1 shrink-0" 
                                      alt="" 
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                               <span className="w-24 truncate text-gray-300 text-[11px] shrink-0" title={entry.name}>
                                  {entry.name}
                               </span>
                               <div className="flex-1 h-2.5 bg-gray-800 rounded-sm overflow-hidden relative ml-1.5">
                                     <div style={{ width: `${barPercent}%`, backgroundColor: color }} className="h-full absolute left-0 top-0 opacity-80" />
                               </div>
                               <span className="w-12 text-right text-[10px] font-mono ml-1 shrink-0 text-gray-300">
                                  {entry.total >= 1000000 ? `${(entry.total / 1000000).toFixed(1)}M` : `${(entry.total / 1000).toFixed(0)}k`}
                               </span>
                            </div>
                         );
                     };

                     return (
                         <div className="mb-4 pb-2 border-b border-gray-700/50">
                                  <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-end mb-2 gap-2 sm:gap-0">
                                      <AnalysisTitleWithPopup 
                                          title="3페 파란 바닥 피해량" 
                                          description="막페에서 건너갈 때 경계에 생기는 파란색 원인 '폭주하는 작업장'으로 받은 피해량입니다."
                                          date={new Date(currentKill.startTime).toLocaleDateString()}
                                      />
                                      <div className="flex gap-1 self-end sm:self-auto">
                                       <button 
                                           onClick={(e) => {
                                               e.preventDefault(); e.stopPropagation();
                                               setBoss8ChartIndex(Math.max(0, safeIndex - 1));
                                           }}
                                           disabled={safeIndex === 0}
                                           className={`p-1 rounded ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                       >
                                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                       </button>
                                       <span className="text-xs text-gray-500 font-mono flex items-center min-w-[30px] justify-center">
                                           {safeIndex + 1}/{sortedKills.length}
                                       </span>
                                       <button 
                                           onClick={(e) => {
                                               e.preventDefault(); e.stopPropagation();
                                               setBoss8ChartIndex(Math.min(sortedKills.length - 1, safeIndex + 1));
                                           }}
                                           disabled={safeIndex === sortedKills.length - 1}
                                           className={`p-1 rounded ${safeIndex === sortedKills.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                       >
                                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                       </button>
                                  </div>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                  {topList.map((e, i) => renderRow(e, i+1))}
                                  
                                  {showSeparateMe && myEntry && (
                                     <>
                                         <div className="h-3 flex items-center justify-center text-gray-700 text-[10px]">...</div>
                                         {renderRow(myEntry, myIndex === -1 ? '-' : myIndex + 1)}
                                     </>
                                  )}
                              </div>
                         </div>
                     )
                })()}
                
                {/* 시즌 3: 8넴 특임 및 별조각 특임 분석 */}
                {season.zoneId === 44 && (() => {
                  const details = [...(season.analysisData?.boss8KillDetails || [])]
                    .sort((a, b) => a.startTime - b.startTime);
                  
                  // 스펙별 그룹화
                  const groupedKills: Record<string, typeof details> = {};
                  details.forEach(detail => {
                    if (!groupedKills[detail.spec]) groupedKills[detail.spec] = [];
                    groupedKills[detail.spec].push(detail);
                  });

                  const hasTankOrHealer = season.activeRoles.Tank || season.activeRoles.Healer;
                  const hasSpecialCount = (season.analysisData?.boss8SpecialCount || 0) > 0;
                  const firstKill = details[0];
                  const isHealerFirstKill = firstKill && HEALER_SPECS.some(s => firstKill.spec.includes(s));
                  
                  const showSpecial = hasTankOrHealer || hasSpecialCount;

                  // 별조각 특임 숨김 여부 체크
                  const isSpecHidden = (specName: string) => {
                    if (!classID) return false;
                    const config = HIDDEN_ANALYSIS_CONFIG['starFragment'];
                    if (!config) return false;
                    return config.some(c => c.classID === classID && c.specs.includes(specName));
                  };

                  const allSpecsHidden = details.length > 0 && details.every(d => isSpecHidden(d.spec));
                  const showStarFragment = !allSpecsHidden;

                  return (
                    <>
                      {/* 킬 로그: 막넴 분석 첫 번째 항목 */}
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-gray-400 shrink-0 mt-0.5">킬 로그:</span>
                        <div className="text-white text-right flex flex-col items-end gap-1 w-[75%]">
                            {Object.keys(groupedKills).length > 0 ? (
                                Object.entries(groupedKills).map(([spec, kills]) => (
                                    <div key={spec} className="flex items-start justify-end w-full">
                                        {classID && (
                                            <img 
                                                src={getSpecImage(classID, spec) || ''} 
                                                alt={spec}
                                                className="w-4 h-4 rounded-full border border-gray-600 object-cover bg-gray-900 mt-0.5 shrink-0"
                                                title={spec}
                                            />
                                        )}
                                        <div className="text-xs text-gray-400 text-right leading-relaxed break-words flex flex-wrap justify-end gap-x-1">
                                            <span>(</span>
                                            {kills.map((kill, idx) => (
                                                <span key={`${kill.code}-${kill.fightID}`}>
                                                    <a 
                                                        href={
                                                          kill.customStart && kill.customEnd
                                                            ? `https://ko.warcraftlogs.com/reports/${kill.code}?fight=${kill.fightID}&type=damage-done&start=${kill.customStart}&end=${kill.customEnd}`
                                                            : `https://ko.warcraftlogs.com/reports/${kill.code}?fight=${kill.fightID}&type=casts`
                                                        }
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
                                                    >
                                                        {idx + 1}
                                                    </a>
                                                    {idx < kills.length - 1 && ','}
                                                </span>
                                            ))}
                                            <span>)</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <span className="text-gray-500">-</span>
                            )}
                        </div>
                      </div>

                      {/* [New] 퍼킬 주차 (한퍼킬 기준) */}
                      {(() => {
                          const firstKill = details[0]; 
                          if (!firstKill) return null;
                          
                          const diffWeek = calculateKrFirstKillDiffWeek(firstKill.startTime, season.zoneId);
                          if (diffWeek === null) return null;
                          
                          const weekLabel = diffWeek <= 0 ? "한퍼킬 주차" : `한퍼킬 후 ${diffWeek}주차`;
                          // diffWeek=0 -> 1주차 점수, diffWeek=1 -> 2주차 점수
                          const score = calculateKillWeekScore(diffWeek + 1);
                          
                          return (
                              <div className="flex justify-between items-start mt-1 mb-1 text-sm">
                                 <span className="text-gray-400 shrink-0">퍼킬 주차:</span>
                                 <span className="text-white text-right">
                                    {weekLabel}
                                 </span>
                              </div>
                          );
                      })()}



                      {showSpecial && (
                        <div className="flex justify-between items-start">
                          <span className="text-gray-400 shrink-0">항성핵 특임:</span>
                          <span className="text-white text-right">
                            {season.analysisData?.boss8TotalKills
                              ? `${season.analysisData.boss8TotalKills}킬 중 ${season.analysisData.boss8SpecialCount || 0}회 (${((season.analysisData.boss8SpecialCount || 0) / season.analysisData.boss8TotalKills * 100).toFixed(1)}%)`
                              : <NAWithPopup />}
                          </span>
                        </div>
                      )}
                      
                      {/* 별조각 특임 (조건부 표시) */}
                      {showStarFragment && (
                        <div className="flex justify-between items-start">
                          <span className="text-gray-400 shrink-0">별조각 특임:</span>
                          <span className="text-white text-right">
                            {season.analysisData?.boss8TotalKills
                              ? `${season.analysisData.boss8TotalKills}킬 중 ${season.analysisData.boss8StarCount || 0}회 (${((season.analysisData.boss8StarCount || 0) / season.analysisData.boss8TotalKills * 100).toFixed(1)}%)`
                              : <NAWithPopup />}
                          </span>
                        </div>
                      )}

                      {/* 힐러: 별조각 HPS 그래프 (Pagination) */}
                      {isHealerFirstKill && (() => {
                          const validKills = season.analysisData?.boss8KillDetails
                              ? season.analysisData.boss8KillDetails
                                  .filter(k => k.healerBreakdown && k.healerBreakdown.length > 0)
                                  .sort((a,b) => a.startTime - b.startTime)
                              : [];

                          if (validKills.length === 0) return null;

                          const safeIndex = Math.min(chartIndex, validKills.length - 1);
                          const currentKill = validKills[safeIndex];

                          if (!currentKill || !currentKill.healerBreakdown) return null;

                          return (
                              <div className="mt-3 pt-2 border-t border-gray-700/50">
                                   {(() => {
                                        const dmg = currentKill.phaseDamage;
                                        if (dmg !== undefined) {
                                            let thresholds = undefined;
                                            if (classID) {
                                                const config = HEALER_PHASE_DAMAGE_THRESHOLDS[classID];
                                                if (config) {
                                                    thresholds = config; 
                                                    if (config.specs) {
                                                        const specKey = Object.keys(config.specs).find(s => currentKill.spec.includes(s));
                                                        if (specKey) thresholds = config.specs[specKey];
                                                    }
                                                }
                                            }
                                            
                                            let grade = '최하';
                                            let color = 'text-gray-600';
                                            if (thresholds) {
                                                if (dmg >= thresholds.high) { grade = '상'; color = 'text-purple-400'; }
                                                else if (dmg >= thresholds.medium) { grade = '중'; color = 'text-green-400'; }
                                                else if (dmg > 0) { grade = '하'; color = 'text-gray-400'; }
                                            } else if (dmg > 0) {
                                                grade = '하'; color = 'text-gray-400';
                                            }
                                            
                                            return (
                                                <div className="flex justify-between items-start mb-2">
                                                   <span className="text-gray-400 shrink-0 text-sm">3페 증뎀 딜량:</span>
                                                   <span className="text-white text-right font-mono text-sm">
                                                      {(dmg / 1_000_000).toFixed(2)}M
                                                      <span className={`ml-1 text-[10px] ${color}`}>[{grade}]</span>
                                                   </span>
                                                </div>
                                            );
                                        }
                                        return null;
                                   })()}
                                   <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-end mb-1 gap-2 sm:gap-0">
                                        <AnalysisTitleWithPopup 
                                            title="별조각 HPS" 
                                            description="2-2단상 별조각 디버프 힐량입니다."
                                            date={new Date(currentKill.startTime).toLocaleDateString()}
                                        />
                                      
                                      {validKills.length > 1 && (
                                          <div className="flex items-center gap-1 bg-gray-900/50 rounded px-1.5 py-0.5 border border-gray-700/50 self-end sm:self-auto">
                                              <button 
                                                onClick={() => setChartIndex(Math.max(0, safeIndex - 1))}
                                                disabled={safeIndex === 0}
                                                className={`text-xs px-1 ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-gray-700/50 rounded'}`}
                                              >
                                                ◀
                                              </button>
                                              <span className="text-[10px] text-gray-400 min-w-[30px] text-center select-none font-mono">
                                                {safeIndex + 1} / {validKills.length}
                                              </span>
                                              <button 
                                                onClick={() => setChartIndex(Math.min(validKills.length - 1, safeIndex + 1))}
                                                disabled={safeIndex === validKills.length - 1}
                                                className={`text-xs px-1 ${safeIndex === validKills.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-gray-700/50 rounded'}`}
                                              >
                                                ▶
                                              </button>
                                          </div>
                                      )}
                                   </div>
                                   
                                   <div className="space-y-1">
                                     {currentKill.healerBreakdown.map((healer, idx) => {
                                        const maxHps = currentKill.healerBreakdown![0].hps;
                                        const percent = Math.max(5, (healer.hps / maxHps) * 100);
                                        const isMe = analysisResult?.playerName ? healer.name.toLowerCase() === analysisResult.playerName.toLowerCase() : false;
                                        
                                        return (
                                           <div key={idx} className="relative h-5 flex items-center group">
                                              <div className="absolute inset-0 bg-gray-900/40 rounded" />
                                              <div 
                                                  className={`absolute left-0 top-0 bottom-0 rounded-l border-l-2 transition-all duration-500 ${isMe ? 'bg-green-500/30 border-green-400' : 'bg-gray-600/30 border-gray-500'}`}
                                                  style={{ width: `${percent}%` }}
                                              />
                                              
                                              <div className="relative z-10 flex justify-between w-full px-2 text-[11px]">
                                                 <div className="flex items-center gap-1.5 overflow-hidden">
                                                    <span className="text-gray-500 w-3 text-right shrink-0">{idx + 1}</span>
                                                    {healer.icon && (
                                                      <img 
                                                        src={`/images/specs/${healer.icon.toLowerCase()}.webp`}
                                                        alt=""
                                                        className="w-3.5 h-3.5 rounded-sm bg-gray-900 shrink-0"
                                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                      />
                                                    )}
                                                    <span className={`truncate ${isMe ? 'text-green-300 font-bold' : 'text-gray-300'}`}>
                                                       {healer.name}
                                                    </span>
                                                 </div>
                                                 <div className={`font-medium shrink-0 ml-2 ${isMe ? 'text-green-300' : 'text-gray-400'}`}>
                                                    {Math.round(healer.hps).toLocaleString()}
                                                 </div>
                                              </div>
                                           </div>
                                        );
                                     })}

                                   </div>
                                   
                                   {(() => {
                                      // Calculate Average Rank for Healer Breakdown
                                      let totalRank = 0;
                                      let rankCount = 0;
                                      validKills.forEach(kill => {
                                          const breakdown = [...(kill.healerBreakdown || [])].sort((a,b) => b.hps - a.hps);
                                          const myIndex = breakdown.findIndex(e => analysisResult?.playerName && e.name.toLowerCase() === analysisResult.playerName.toLowerCase());
                                          if (myIndex !== -1) {
                                              totalRank += (myIndex + 1);
                                              rankCount++;
                                          }
                                      });
                                      const avgRank = rankCount > 0 ? (totalRank / rankCount).toFixed(1) : null;
                                      
                                      if (!avgRank) return null;
                                      
                                      return (
                                           <div className="mt-2 text-right">
                                               <span className="text-[11px] text-gray-400">평균 등수: </span>
                                               <span className="text-[11px] text-white font-mono">{avgRank}위</span>
                                           </div>
                                      );
                                   })()}
                              </div>
                          );
                      })()}

                      {/* DPS/Tank: Hits Breakdown Chart (Pagination) */}
                      {!isHealerFirstKill && (() => {
                          const validKills = season.analysisData?.boss8KillDetails
                              ? season.analysisData.boss8KillDetails
                                  .filter(k => k.hitsBreakdown && k.hitsBreakdown.length > 0)
                                  .sort((a,b) => a.startTime - b.startTime)
                              : [];

                          if (validKills.length === 0) return null;

                          const safeIndex = Math.min(chartIndex, validKills.length - 1);
                          const currentKill = validKills[safeIndex];

                          if (!currentKill || !currentKill.hitsBreakdown) return null;

                          if (!currentKill || !currentKill.hitsBreakdown) return null;

                          const breakdown = currentKill.hitsBreakdown.filter(entry => {
                              if (!entry.icon) return true;
                              const spec = entry.icon.includes('-') ? entry.icon.split('-')[1] : entry.icon;
                              
                              // Healer 제외
                              if (HEALER_SPECS.some(s => spec.includes(s))) return false;
                              // Tank 제외
                              if (TANK_SPECS.some(s => spec.includes(s))) return false;
                              
                              return true;
                          });

                          const maxHit = Math.max(...breakdown.map(h => h.hitCount)); 

                          return (
                              <div className="mt-3 pt-2 border-t border-gray-700/50">
                                   <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-end mb-2 gap-2 sm:gap-0">
                                        <AnalysisTitleWithPopup 
                                            title="반물질 흡수(Hits)" 
                                            description="1페 반물질 흡수 틱수 입니다. 공대 딜컷 택틱에 따라 흡수 수가 달라지므로 공대 내 상대적 비교만 유의미합니다. 구슬 아이콘이 있는 유저는 '잉여 질량체' 디버프 특임자이며, 맨처음 시작 구슬은 제외입니다."
                                            date={new Date(currentKill.startTime).toLocaleDateString()}
                                        />
                                       
                                       <div className="flex gap-1 self-end sm:self-auto">
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const newIndex = Math.max(0, safeIndex - 1);
                                                    setChartIndex(newIndex);
                                                }}
                                                disabled={safeIndex === 0}
                                                className={`p-1 rounded ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                            </button>
                                            <span className="text-xs text-gray-500 font-mono flex items-center min-w-[30px] justify-center">
                                                {safeIndex + 1}/{validKills.length}
                                            </span>
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const newIndex = Math.min(validKills.length - 1, safeIndex + 1);
                                                    setChartIndex(newIndex);
                                                }}
                                                disabled={safeIndex === validKills.length - 1}
                                                className={`p-1 rounded ${safeIndex === validKills.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            </button>
                                       </div>
                                   </div>
                                   
                                   <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                       {breakdown.map((entry, idx) => {
                                          const isMe = entry.name === analysisResult?.playerName;
                                          const percent = maxHit > 0 ? (entry.hitCount / maxHit) * 100 : 0;
                                          const color = getClassColorByName(entry.className);
                                          
                                          return (
                                              <div key={idx} className={`relative flex items-center h-5 text-xs px-1 rounded ${isMe ? 'bg-white/10' : ''}`}>
                                                  <div className="w-20 shrink-0 truncate text-gray-300 mr-2 z-10 flex items-center" title={entry.name}>
                                                      <span className="truncate">{entry.name}</span>
                                                      {entry.hasVoidHit && <img src="/images/inv_nullstone_void.jpg" className="w-3 h-3 ml-1 rounded-sm shrink-0" alt="" />}
                                                  </div>
                                                  <div className="flex-1 h-3 bg-gray-800 rounded-sm overflow-hidden relative">
                                                       <div 
                                                          style={{ width: `${percent}%`, backgroundColor: color }} 
                                                          className="h-full absolute left-0 top-0 opacity-80"
                                                       />
                                                  </div>
                                                  <div className="w-6 shrink-0 text-right text-gray-400 font-mono ml-1 z-10">
                                                      {entry.hitCount}
                                                  </div>
                                              </div>
                                          );
                                       })}
                                   </div>
                              </div>
                          );
                      })()}
                    </>
                  );
                })()}
              </div>

                {/* 태그 영역 */}
                <div className="flex flex-wrap gap-1 mt-4">
                  {/* 시즌 3: 특임 매니아 태그 */}
                  {season.zoneId === 44 && (() => {
                     const totalKills = season.analysisData?.boss8TotalKills || 0;
                     const specialCount = season.analysisData?.boss8SpecialCount || 0;
                     const starCount = season.analysisData?.boss8StarCount || 0;
                     
                     // 3킬 이상이고 특임 수행률 100% 이상
                     if (totalKills >= 3 && (specialCount >= totalKills && starCount >= totalKills)) {
                       return (
                         <span className="px-2 py-0.5 text-xs rounded-full bg-purple-900 text-purple-200 border border-purple-700">
                           특임 매니아
                         </span>
                       );
                     }
                     return null;
                  })()}

                  {/* 시즌 1: 특임 매니아 태그 (S1) */}
                  {season.zoneId === 38 && (() => {
                     const totalKills = season.analysisData?.boss8TotalKills || 0;
                     const jumpCount = season.analysisData?.boss8JumpTaskCount || 0;
                     const portalCount = season.analysisData?.boss8PortalTaskCount || 0;
                     const essenceCount = season.analysisData?.boss8EssenceTaskCount || 0;
                     
                     // 3킬 이상이고, (점프+포탈+정수) 합계가 킬수 * 0.9 이상이면
                     if (totalKills >= 3 && (jumpCount + portalCount + essenceCount) >= totalKills*3 * 0.9) {
                        return (
                         <span className="px-2 py-0.5 text-xs rounded-full bg-purple-900 text-purple-200 border border-purple-700">
                           특임 매니아
                         </span>
                       );
                     }
                     return null;
                  })()}
                </div>
            </div>
            
            {/* 기타 분석 */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-sm font-semibold text-pink-400 mb-3 pb-2 border-b border-gray-700">
                기타 분석
              </h3>
              
              {/* 리스트 형식 내용 */}
              <div className="space-y-2 text-sm">
                
                {/* 시즌 2: 3넴 디버프 분석 */}
                {season.zoneId === 42 && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400 shrink-0">3넴 증폭기 빨기:</span>
                    <span className={`text-right ${season.analysisData?.boss3AvgDebuff !== undefined ? (season.analysisData.boss3AvgDebuff <= 3 ? 'text-gray-400' : season.analysisData.boss3AvgDebuff <= 10 ? 'text-yellow-400' : 'text-pink-400') : 'text-white'}`}>
                      {season.analysisData?.boss3AvgDebuff !== undefined
                        ? `${season.analysisData.boss3AvgDebuff.toFixed(1)}회/킬`
                        : <NAWithPopup />}
                    </span>
                  </div>
                )}

                 {/* 시즌 2: 1넴 디버프 분석 */}
                {season.zoneId === 42 && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400 shrink-0">1넴 오토바이 탑승:</span>
                    <span className={`text-right ${season.analysisData?.boss1AvgDebuff !== undefined ? (season.analysisData.boss1AvgDebuff <= 1 ? 'text-gray-400' : season.analysisData.boss1AvgDebuff <= 3 ? 'text-yellow-400' : 'text-pink-400') : 'text-white'}`}>
                      {season.analysisData?.boss1AvgDebuff !== undefined
                        ? `${season.analysisData.boss1AvgDebuff.toFixed(1)}회/킬`
                        : <NAWithPopup />}
                    </span>
                  </div>
                )}

                {/* 시즌 1: 6넴 힐량 분석 (Healer Only) */}
                {season.zoneId === 38 && (() => {
                  const boss6Details = season.analysisData?.boss6KillDetails || [];
                  const boss6 = season.bossRankings.find(b => b.encounterId === 2920);
                  const healerFirst = boss6?.roles.Healer?.firstKillTimestamp;
                  
                  if (!healerFirst) return null;
                  
                  const dpsFirst = boss6?.roles.DPS?.firstKillTimestamp;
                  const tankFirst = boss6?.roles.Tank?.firstKillTimestamp;
                  if (dpsFirst && dpsFirst < healerFirst) return null;
                  if (tankFirst && tankFirst < healerFirst) return null;
                  
                  if (boss6Details.length === 0) return null;

                  const sortedKills = [...boss6Details].sort((a, b) => a.startTime - b.startTime);
                  const safeIndex = Math.min(boss6ChartIndex, sortedKills.length - 1);
                  const currentKill = sortedKills[safeIndex];
                  const breakdown = currentKill.healerBreakdown || [];
                  
                  const sortedBreakdown = [...breakdown].sort((a,b) => b.hps - a.hps);
                  const maxHps = sortedBreakdown.length > 0 ? sortedBreakdown[0].hps : 0;
                  
                  const renderRow = (entry: any, rank: number) => {
                       const isMe = entry.name === analysisResult?.playerName;
                       const barPercent = maxHps > 0 ? (entry.hps / maxHps) * 100 : 0;
                       const color = getClassColorByName(entry.className);
                       
                       return (
                          <div key={entry.name} className={`flex items-center h-5 px-1 rounded ${isMe ? 'bg-white/10' : ''}`}>
                             <span className={`w-4 text-center font-mono text-[10px] shrink-0 ${rank <= 3 ? 'text-purple-300 font-bold' : 'text-gray-500'}`}>{rank}</span>
                               {entry.icon && (
                                <img 
                                    src={`/images/specs/${entry.icon.toLowerCase()}.webp`} 
                                    className="w-3.5 h-3.5 rounded-sm mx-1 shrink-0" 
                                    alt="" 
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                             <span className="w-24 truncate text-gray-300 text-[11px] shrink-0" title={entry.name}>
                                {entry.name}
                             </span>
                             <div className="flex-1 h-2.5 bg-gray-800 rounded-sm overflow-hidden relative ml-1.5">
                                   <div style={{ width: `${barPercent}%`, backgroundColor: color }} className="h-full absolute left-0 top-0 opacity-80" />
                             </div>
                             <span className="w-12 text-right text-[10px] font-mono ml-1 shrink-0 text-gray-300">
                                {entry.hps >= 1000000 ? (entry.hps / 1000000).toFixed(2) + 'M' : (entry.hps / 1000).toFixed(0) + 'k'}
                             </span>
                          </div>
                       );
                  };

                  // Calculate Average Rank
                  let totalRank = 0;
                  let rankCount = 0;
                  sortedKills.forEach(kill => {
                      const killBreakdown = [...(kill.healerBreakdown || [])].sort((a,b) => b.hps - a.hps);
                      const myIndex = killBreakdown.findIndex(e => e.name === analysisResult?.playerName);
                      if (myIndex !== -1) {
                          totalRank += (myIndex + 1);
                          rankCount++;
                      }
                  });
                  const avgRank = rankCount > 0 ? (totalRank / rankCount).toFixed(1) : null;
                  
                  return (
                      <div className="mb-4 pb-2 border-b border-gray-700/50">
                           <div className="flex justify-between items-end mb-2">
                               <AnalysisTitleWithPopup 
                                   title="6넴 대상자 힐량" 
                                   description="여왕의 파멸 디버프 대상자에 대한 힐량입니다. 칼날을 피함과 동시에 대상자에게 유효힐을 넣어야하므로 1시즌 힐러 역량을 보는 지표로 자주 사용됩니다."
                                   date={new Date(currentKill.startTime).toLocaleDateString()}
                               />
                               <div className="flex gap-1">
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss6ChartIndex(Math.max(0, safeIndex - 1));
                                        }}
                                        disabled={safeIndex === 0}
                                        className={`p-1 rounded ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <span className="text-xs text-gray-500 font-mono flex items-center min-w-[30px] justify-center">
                                        {safeIndex + 1}/{sortedKills.length}
                                    </span>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss6ChartIndex(Math.min(sortedKills.length - 1, safeIndex + 1));
                                        }}
                                        disabled={safeIndex === sortedKills.length - 1}
                                        className={`p-1 rounded ${safeIndex === sortedKills.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                               </div>
                           </div>
                           <div className="flex flex-col gap-0.5">
                               {sortedBreakdown.slice(0, 6).map((e, i) => renderRow(e, i+1))}
                           </div>
                           
                           {avgRank && (
                               <div className="mt-2 text-right">
                                   <span className="text-[11px] text-gray-400">평균 등수: </span>
                                   <span className="text-[11px] text-white font-mono">{avgRank}위</span>
                               </div>
                           )}
                      </div>
                  )
                })()}

                {/* 시즌 3: 7넴 힐량 분석 (Healer Only) */}
                {season.zoneId === 44 && (() => {
                     // Check Main Role Healer (based on Last Boss First Kill)
                     const boss9 = season.bossRankings.find(b => b.encounterId === 3135);
                     const healerFirst = boss9?.roles.Healer?.firstKillTimestamp;
                     
                     if (!healerFirst) return null;
                     
                     const dpsFirst = boss9?.roles.DPS?.firstKillTimestamp;
                     const tankFirst = boss9?.roles.Tank?.firstKillTimestamp;
                     if (dpsFirst && dpsFirst < healerFirst) return null;
                     if (tankFirst && tankFirst < healerFirst) return null;
                     
                     const details = season.analysisData?.boss7HealingDetails || [];
                     if (details.length === 0) return null;
                     
                     const sortedKills = [...details].sort((a,b) => a.startTime - b.startTime);
                     const safeIndex = Math.min(boss7ChartIndex, sortedKills.length - 1);
                     const currentKill = sortedKills[safeIndex];
                     const breakdown = currentKill.breakdown || [];
                     
                     const sortedBreakdown = [...breakdown].sort((a,b) => b.total - a.total);
                     const maxTotal = sortedBreakdown.length > 0 ? sortedBreakdown[0].total : 0;

                     const renderRow = (entry: any, rank: number) => {
                         const isMe = entry.name === analysisResult?.playerName;
                         const barPercent = maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0;
                         const color = getClassColorByName(entry.className);
                         
                         return (
                          <div key={entry.name} className={`flex items-center h-5 px-1 rounded ${isMe ? 'bg-white/10' : ''}`}>
                             <span className={`w-4 text-center font-mono text-[10px] shrink-0 ${rank <= 3 ? 'text-purple-300 font-bold' : 'text-gray-500'}`}>{rank}</span>
                               {entry.icon && (
                                <img 
                                    src={`/images/specs/${entry.icon.toLowerCase()}.webp`} 
                                    className="w-3.5 h-3.5 rounded-sm mx-1 shrink-0" 
                                    alt="" 
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                             <span className="w-24 truncate text-gray-300 text-[11px] shrink-0" title={entry.name}>
                                {entry.name}
                             </span>
                             <div className="flex-1 h-2.5 bg-gray-800 rounded-sm overflow-hidden relative ml-1.5">
                                   <div style={{ width: `${barPercent}%`, backgroundColor: color }} className="h-full absolute left-0 top-0 opacity-80" />
                             </div>
                             <span className="w-12 text-right text-[10px] font-mono ml-1 shrink-0 text-gray-300">
                                {entry.total >= 1000000 ? `${(entry.total / 1000000).toFixed(1)}M` : `${(entry.total / 1000).toFixed(0)}k`}
                             </span>
                          </div>
                       );
                  };

                  // Calculate Average Rank
                  let totalRank = 0;
                  let rankCount = 0;
                  sortedKills.forEach(kill => {
                      const breakdown = [...(kill.breakdown || [])].sort((a,b) => b.total - a.total);
                      // Use case-insensitive comparison if needed, but usually exact match is fine derived from analysisResult
                      const myIndex = breakdown.findIndex(e => e.name === analysisResult?.playerName);
                      if (myIndex !== -1) {
                          totalRank += (myIndex + 1);
                          rankCount++;
                      }
                  });
                  const avgRank = rankCount > 0 ? (totalRank / rankCount).toFixed(1) : null;
                  
                  return (
                      <div className="mb-4 pb-2 border-b border-gray-700/50">
                           <div className="flex justify-between items-end mb-2">
                               <AnalysisTitleWithPopup 
                                   title="7넴 추방 힐량" 
                                   description="1페 추방 디버프 대상자에 대한 치유량입니다. 해당 디버프 대상자에 대한 스팟 힐이 7넴 힐러에게 가장 중요했다고 합니다."
                                   date={new Date(currentKill.startTime).toLocaleDateString()}
                               />
                               <div className="flex gap-1">
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss7ChartIndex(Math.max(0, safeIndex - 1));
                                        }}
                                        disabled={safeIndex === 0}
                                        className={`p-1 rounded ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <span className="text-xs text-gray-500 font-mono flex items-center min-w-[30px] justify-center">
                                        {safeIndex + 1}/{sortedKills.length}
                                    </span>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss7ChartIndex(Math.min(sortedKills.length - 1, safeIndex + 1));
                                        }}
                                        disabled={safeIndex === sortedKills.length - 1}
                                        className={`p-1 rounded ${safeIndex === sortedKills.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                               </div>
                           </div>
                           <div className="flex flex-col gap-0.5">
                               {sortedBreakdown.slice(0, 6).map((e, i) => renderRow(e, i+1))}
                           </div>

                           {avgRank && (
                               <div className="mt-2 text-right">
                                   <span className="text-[11px] text-gray-400">평균 등수: </span>
                                   <span className="text-[11px] text-white font-mono">{avgRank}위</span>
                               </div>
                           )}
                      </div>
                  )
                })()}

                {/* 시즌 2: 1넴 디버프 분석 */}
                {season.zoneId === 42 && (() => {
                  // 날짜순 정렬 (오래된 순)
                  const boss1Details = season.analysisData?.boss1KillDetails 
                      ? [...season.analysisData.boss1KillDetails].sort((a, b) => a.startTime - b.startTime)
                      : [];

                  if (boss1Details.length === 0) return null;
                  
                  const safeIndex = Math.min(boss1ChartIndex, boss1Details.length - 1);
                  const currentKill = boss1Details[safeIndex];
                  const breakdown = currentKill.debuffBreakdown || [];
                  const maxCount = breakdown.length > 0 ? breakdown[0].count : 0;
                  
                  const topList = breakdown.slice(0, 8);
                  const myIndex = breakdown.findIndex(e => e.name === analysisResult?.playerName);
                  const showSeparateMe = myIndex >= 8;
                  const myEntry = showSeparateMe ? breakdown[myIndex] : null;

                  const renderRow = (entry: any, rank: number) => {
                      const isMe = entry.name === analysisResult?.playerName;
                      const barPercent = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
                      const color = getClassColorByName(entry.className);
                      
                      return (
                          <div key={entry.name} className={`flex items-center h-5 px-1 rounded ${isMe ? 'bg-white/10' : ''}`}>
                              <span className={`w-4 text-center font-mono text-[10px] shrink-0 ${rank <= 3 ? 'text-purple-300 font-bold' : 'text-gray-500'}`}>{rank}</span>
                              {entry.icon && (
                                <img 
                                    src={`/images/specs/${entry.icon.toLowerCase()}.webp`} 
                                    className="w-3.5 h-3.5 rounded-sm mx-1 shrink-0" 
                                    alt="" 
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <span className="w-24 truncate text-gray-300 text-[11px] shrink-0" title={entry.name}>
                                  {entry.name}
                              </span>
                              
                              <div className="flex-1 h-2.5 bg-gray-800 rounded-sm overflow-hidden relative ml-1.5">
                                   <div style={{ width: `${barPercent}%`, backgroundColor: color }} className="h-full absolute left-0 top-0 opacity-80" />
                              </div>
                              
                              <div className="w-10 text-right text-[10px] font-mono ml-1 shrink-0">
                                   <span className="text-gray-300">{entry.count}</span>
                              </div>
                          </div>
                      );
                  };

                  return (
                      <div className="mb-4 pb-2 border-b border-gray-700/50">
                            <div className="flex justify-between items-end mb-2">
                                <AnalysisTitleWithPopup 
                                    title="상세 횟수" 
                                    description="이타적으로 딜힐 멈추고 오토바이 탄 횟수입니다."
                                    date={new Date(currentKill.startTime).toLocaleDateString()}
                                />
                                <div className="flex gap-1">
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss1ChartIndex(Math.max(0, safeIndex - 1));
                                        }}
                                        disabled={safeIndex === 0}
                                        className={`p-1 rounded ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <span className="text-xs text-gray-500 font-mono flex items-center min-w-[30px] justify-center">
                                        {safeIndex + 1}/{boss1Details.length}
                                    </span>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss1ChartIndex(Math.min(boss1Details.length - 1, safeIndex + 1));
                                        }}
                                        disabled={safeIndex === boss1Details.length - 1}
                                        className={`p-1 rounded ${safeIndex === boss1Details.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-0.5">
                               {topList.map((entry, idx) => renderRow(entry, idx + 1))}
                               
                               {showSeparateMe && myEntry && (
                                   <>
                                       <div className="h-3 flex items-center justify-center text-gray-700 text-[10px]">...</div>
                                       {renderRow(myEntry, myIndex + 1)}
                                   </>
                               )}
                               {breakdown.length === 0 && (
                                   <div className="text-gray-500 text-xs text-center py-2">데이터 없음</div>
                               )}
                            </div>
                      </div>
                  );
                })()}

                {/* 시즌 3: 2넴 뒤얽힘 분석 */}
                {season.zoneId === 44 && (() => {
                  // 날짜순 정렬 (오래된 순)
                  const boss2Details = season.analysisData?.boss2KillDetails 
                      ? [...season.analysisData.boss2KillDetails].sort((a, b) => a.startTime - b.startTime)
                      : [];
                  if (boss2Details.length === 0) return null;
                  
                  const safeIndex = Math.min(boss2ChartIndex, boss2Details.length - 1);
                  const currentKill = boss2Details[safeIndex];
                  const breakdown = currentKill.entanglementBreakdown || [];
                  const maxAmount = breakdown.length > 0 ? breakdown[0].amount : 0;
                  
                  const topList = breakdown.slice(0, 8);
                  const myIndex = breakdown.findIndex(e => e.name === analysisResult?.playerName);
                  const showSeparateMe = myIndex >= 8;
                  const myEntry = showSeparateMe ? breakdown[myIndex] : null;

                  const renderRow = (entry: any, rank: number) => {
                      const isMe = entry.name === analysisResult?.playerName;
                      const barPercent = maxAmount > 0 ? (entry.amount / maxAmount) * 100 : 0;
                      const color = getClassColorByName(entry.className);
                      
                      return (
                          <div key={entry.name} className={`flex items-center h-5 px-1 rounded ${isMe ? 'bg-white/10' : ''}`}>
                              <span className={`w-4 text-center font-mono text-[10px] shrink-0 ${rank <= 3 ? 'text-purple-300 font-bold' : 'text-gray-500'}`}>{rank}</span>
                              {entry.icon && (
                                <img 
                                    src={`/images/specs/${entry.icon.toLowerCase()}.webp`} 
                                    className="w-3.5 h-3.5 rounded-sm mx-1 shrink-0" 
                                    alt="" 
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <span className="w-24 truncate text-gray-300 text-[11px] shrink-0" title={entry.name}>
                                  {entry.name}
                                  {isMe && currentKill.myParse !== undefined && (
                                     <span className={`ml-1 font-mono text-[9px] ${getRankColor(currentKill.myParse)}`}>
                                         ({currentKill.myParse})
                                     </span>
                                  )}
                              </span>
                              
                              <div className="flex-1 h-2.5 bg-gray-800 rounded-sm overflow-hidden relative ml-1.5">
                                   <div style={{ width: `${barPercent}%`, backgroundColor: color }} className="h-full absolute left-0 top-0 opacity-80" />
                              </div>
                              
                              <div className="w-20 text-right text-[10px] font-mono ml-1 shrink-0 flex justify-end gap-1 items-baseline">
                                   <span className="text-gray-400">{(entry.amount / 1000000).toFixed(1)}M</span>
                                   <span className="text-gray-600 text-[9px]">({entry.percent.toFixed(1)}%)</span>
                              </div>
                          </div>
                      );
                  };

                  return (
                      <div className="mb-4 pb-2 border-b border-gray-700/50">
                            <div className="flex justify-between items-end mb-2">
                                <AnalysisTitleWithPopup 
                                    title="2넴 뒤얽힘 딜" 
                                    description="2넴 뒤얽힘 쫄에 가한 데미지와, 괄호 안은 본인의 데미지 중 뒤얽힘 딜의 비중입니다."
                                    date={new Date(currentKill.startTime).toLocaleDateString()}
                                />
                                <div className="flex gap-1">
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss2ChartIndex(Math.max(0, safeIndex - 1));
                                        }}
                                        disabled={safeIndex === 0}
                                        className={`p-1 rounded ${safeIndex === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <span className="text-xs text-gray-500 font-mono flex items-center min-w-[30px] justify-center">
                                        {safeIndex + 1}/{boss2Details.length}
                                    </span>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setBoss2ChartIndex(Math.min(boss2Details.length - 1, safeIndex + 1));
                                        }}
                                        disabled={safeIndex === boss2Details.length - 1}
                                        className={`p-1 rounded ${safeIndex === boss2Details.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-0.5">
                               {topList.map((entry, idx) => renderRow(entry, idx + 1))}
                               
                               {showSeparateMe && myEntry && (
                                   <>
                                       <div className="h-3 flex items-center justify-center text-gray-700 text-[10px]">...</div>
                                       {renderRow(myEntry, myIndex + 1)}
                                   </>
                               )}
                            </div>
                      </div>
                  );
                })()}

              </div>
              
              {/* 태그 영역 */}
              <div>
                <div className="flex flex-wrap gap-1">
                  {/* 시즌 2: 역할별 이타적 플레이어 태그 */}
                  {season.zoneId === 42 && (() => {
                    const boss1 = season.analysisData?.boss1AvgDebuff;
                    const boss3 = season.analysisData?.boss3AvgDebuff;
                    
                    // 1넴 기준: Tank > 3.3, DPS > 2.0, Healer > 2.5
                    const boss1Altruistic = boss1 !== undefined && (
                      (season.activeRoles.Tank && boss1 > 3.3) ||
                      (season.activeRoles.DPS && boss1 > 2.0) ||
                      (season.activeRoles.Healer && boss1 > 2.5)
                    );
                    
                    // 3넴 기준: Tank > 18, Healer/DPS > 12
                    const boss3Altruistic = boss3 !== undefined && (
                      (season.activeRoles.Tank && boss3 > 18) ||
                      ((season.activeRoles.Healer || season.activeRoles.DPS) && boss3 > 14.5)
                    );
                    
                    return (boss1Altruistic || boss3Altruistic) && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        이타적 플레이어
                      </span>
                    );
                  })()}
                  
                  {/* 시즌 2: 이기적 플레이어 태그 (힐러 & DPS) */}
                  {season.zoneId === 42 && (
                    (season.activeRoles.Healer && (
                      (season.analysisData?.boss1AvgDebuff !== undefined && season.analysisData.boss1AvgDebuff <= 0.5) &&
                      (season.analysisData?.boss3AvgDebuff !== undefined && season.analysisData.boss3AvgDebuff <= 2.7)
                    )) ||
                    (season.activeRoles.DPS && (
                      (season.analysisData?.boss1AvgDebuff !== undefined && season.analysisData.boss1AvgDebuff <= 0.1) &&
                      (season.analysisData?.boss3AvgDebuff !== undefined && season.analysisData.boss3AvgDebuff <= 0.9)
                    ))
                  ) && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      이기적 플레이어
                    </span>
                  )}
                  
                  {/* 힐러: 주작 경고 2개 이상 */}
                  {healerCheatWarningCount >= 2 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      힐주작 의심
                    </span>
                  )}
                  
                  {/* DPS: 미주 6개 이상 */}
                  {dpsPowerInfusionCount >= 6 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                      마주 애호가
                    </span>
                  )}
                  
                  {/* DPS: 주작 경고 1개 이상 */}
                  {dpsCheatWarningCount >= 1 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      딜주작 의심
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
