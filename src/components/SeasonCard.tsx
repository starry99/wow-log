import { useState, useMemo } from 'react';
import type { SeasonClearStatus, SearchParams, SeasonData, AnalysisResult } from '../types';
import { getZoneData, getCharacterRankings, fetchDetailedAnalysis } from '../api/warcraftLogs';
import { SeasonTable, calculateKrFirstKillDiffWeek } from './SeasonTable';
import { 
  getBossPercentWeights, 
  calculateDebuffScore, 
  SEASON_2_ANALYSIS_WEIGHTS,
  SEASON_3_ANALYSIS_WEIGHTS,
  calculatePhaseDamageScore,
  calculateAnalysisScore,
  calculateKillWeekScore,
} from '../config/scoreSettings';

// 서버 이름 → slug 변환 (한국 서버)
const serverSlugMap: Record<string, string> = {
  '아즈샤라': 'azshara',
  '헬스크림': 'hellscream',
  '불타는군단': 'burning-legion',
  '윈드러너': 'windrunner',
  '줄진': 'zuljin',
  '듀로탄': 'durotan',
  '가로나': 'garona',
  '노르간논': 'norgannon',
  '달라란': 'dalaran',
  '말퓨리온': 'malfurion',
  '세나리우스': 'cenarius',
  '스톰레이지': 'stormrage',
  '와이어매인': 'wildhammer',
  '와일드해머': 'wildhammer',
  '하이잘': 'hyjal',
};

// 시즌별 배경 이미지
const SEASON_BACKGROUNDS: Record<number, string> = {
  38: '/images/nerub-ar-palace.jpg',
  42: '/images/undermine.jpg',
  44: '/images/manaforge-omega.jpg',
};

// 점수 색상
function getRankColor(score: number): string {
  if (score >= 99) return 'text-pink-400';
  if (score >= 95) return 'text-orange-400';
  if (score >= 75) return 'text-purple-400';
  if (score >= 50) return 'text-blue-400';
  if (score >= 25) return 'text-green-400';
  return 'text-gray-400';
}

// 점수 설명 (직접 수정 가능)
const SCORE_DESCRIPTIONS = {
  best: '기존 로그와 달리 주작이 쉬운 넴드는 가중치를 낮추고 뒷넴드는 조금 더 반영하여 평균을 낸 값입니다.',
  total: '분석 점수까지 반영해서 100점 기준으로 환산한 점수입니다. 재미로만 봐주세요!',
};

interface SeasonCardProps {
  status: SeasonClearStatus;
  searchParams: SearchParams | null;
  classID?: number;
}

export function SeasonCard({ status, searchParams, classID }: SeasonCardProps) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [seasonData, setSeasonData] = useState<SeasonData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [scorePopup, setScorePopup] = useState<'best' | 'total' | null>(null);

  // BEST % 계산
  // - 딜러/탱커 기록만 있으면 DPS 랭킹 사용
  // - 힐러 기록만 있으면 HPS 랭킹 사용
  // - 둘 다 있으면 각 보스마다 더 좋은 랭킹 사용
  const bestPercentScore = useMemo(() => {
    if (!seasonData) return 0;
    
    const weights = getBossPercentWeights(status.zoneId);
    let totalWeight = 0;
    let weightedSum = 0;
    
    // 역할별 기록 존재 여부 확인
    const hasDpsOrTank = seasonData.activeRoles.DPS || seasonData.activeRoles.Tank;
    const hasHealer = seasonData.activeRoles.Healer;
    
    seasonData.bossRankings.forEach(boss => {
      const weightConfig = weights.find(w => w.encounterId === boss.encounterId);
      const bossWeight = weightConfig?.weight ?? 1;
      
      // DPS 랭킹: DPS 역할 또는 Tank 역할의 dpsRankPercent 중 높은 값
      const dpsFromDps = boss.roles.DPS?.dpsRankPercent ?? 0;
      const dpsFromTank = boss.roles.Tank?.dpsRankPercent ?? 0;
      const bestDpsPercent = Math.max(dpsFromDps, dpsFromTank);
      
      // HPS 랭킹: Healer 역할의 hpsRankPercent
      const hpsPercent = boss.roles.Healer?.hpsRankPercent ?? 0;
      
      let bestPercent = 0;
      
      if (hasDpsOrTank && hasHealer) {
        // 둘 다 있으면 더 좋은 랭킹 선택
        bestPercent = Math.max(bestDpsPercent, hpsPercent);
      } else if (hasDpsOrTank) {
        // 딜러/탱커만 있으면 DPS 랭킹 사용
        bestPercent = bestDpsPercent;
      } else if (hasHealer) {
        // 힐러만 있으면 HPS 랭킹 사용
        bestPercent = hpsPercent;
      }
      
      if (bestPercent > 0) {
        weightedSum += bestPercent * bossWeight;
        totalWeight += bossWeight;
      }
    });
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }, [seasonData, status.zoneId]);

  // 추가평가 점수 계산
  const additionalScore = useMemo(() => {
    if (!seasonData) return 0;

    // Season 2: 1넴 디버프 등
    if (status.zoneId === 42) {
      const debuffValue = seasonData.analysisData?.boss1AvgDebuff;
      if (debuffValue === undefined) return 0;
      
      const debuffScore = calculateDebuffScore(debuffValue);
      const debuffWeight = SEASON_2_ANALYSIS_WEIGHTS.find(w => w.cellId === 'boss1_debuff')?.weight ?? 20;
      return debuffScore * (debuffWeight / 100);
    }

    // Season 3: 막넴 분석 (딜량 + 주차)
    if (status.zoneId === 44) {
      const scoreMap = new Map<string, number>();

      const boss8Kills = seasonData.analysisData?.boss8KillDetails;
      const firstKill = (boss8Kills && boss8Kills.length > 0) 
         ? [...boss8Kills].sort((a, b) => a.startTime - b.startTime)[0] 
         : undefined;

      // 1. Phase Damage Score
      if (seasonData.analysisData?.boss8PhaseDamage !== undefined) {
          const damage = seasonData.analysisData.boss8PhaseDamage;
          const score = calculatePhaseDamageScore(damage, classID, firstKill?.spec);
          scoreMap.set('boss8_phase_damage', score);
      }

      // 2. Kill Week Score
      if (firstKill) {
         const diffWeek = calculateKrFirstKillDiffWeek(firstKill.startTime, status.zoneId);
         if (diffWeek !== null) {
            const score = calculateKillWeekScore(diffWeek + 1);
            scoreMap.set('boss8_kill_week', score);
         }
      }
      
      return calculateAnalysisScore(scoreMap, SEASON_3_ANALYSIS_WEIGHTS);
    }

    return 0;
  }, [seasonData, status.zoneId, classID]);

  // 탱커 스펙 여부 확인 (마지막 보스 퍼킬이 탱커인 경우)
  const isTankSpec = useMemo(() => {
    if (!seasonData?.bossRankings || seasonData.bossRankings.length === 0) return false;
    const lastBoss = seasonData.bossRankings[seasonData.bossRankings.length - 1];
    
    const tankKill = lastBoss.roles.Tank?.firstKillTimestamp;
    if (!tankKill) return false;
    
    // 다른 역할보다 빠른지 확인
    const dpsKill = lastBoss.roles.DPS?.firstKillTimestamp;
    const healerKill = lastBoss.roles.Healer?.firstKillTimestamp;
    
    if (dpsKill && dpsKill < tankKill) return false;
    if (healerKill && healerKill < tankKill) return false;
    
    return true;
  }, [seasonData]);

  // 탱커용 점수 계산
  const tankScores = useMemo(() => {
    if (!seasonData || !isTankSpec) return { dps: 0, hps: 0 };
    
    const weights = getBossPercentWeights(status.zoneId);
    let totalWeight = 0;
    let dpsSum = 0;
    let hpsSum = 0;
    
    seasonData.bossRankings.forEach(boss => {
      const weightConfig = weights.find(w => w.encounterId === boss.encounterId);
      const w = weightConfig?.weight ?? 1;
      
      const tankData = boss.roles.Tank;
      if (tankData) {
         const d = tankData.dpsRankPercent ?? 0;
         const h = tankData.hpsRankPercent ?? 0;
         
         if (d > 0 || h > 0) {
            dpsSum += d * w;
            hpsSum += h * w;
            totalWeight += w;
         }
      }
    });
    
    return {
       dps: totalWeight > 0 ? dpsSum / totalWeight : 0,
       hps: totalWeight > 0 ? hpsSum / totalWeight : 0
    };
  }, [seasonData, isTankSpec, status.zoneId]);

  // 종합 점수 계산
  const totalScore = useMemo(() => {
    if (isTankSpec) {
        return (tankScores.dps * 0.7) + (tankScores.hps * 0.3);
    }

    if (additionalScore > 0) {
      return (bestPercentScore * 0.7) + (additionalScore * 0.3);
    }
    return bestPercentScore;
  }, [bestPercentScore, additionalScore, isTankSpec, tankScores]);

  const handleLoadDetails = async () => {
    if (loading || !searchParams) return;
    
    setLoading(true);
    try {
      const serverSlug = serverSlugMap[searchParams.server] || searchParams.server.toLowerCase();
      const region = searchParams.region.toLowerCase();
      const zones = getZoneData();
      
      // 해당 시즌만 필터
      const targetZone = zones.find(z => z.id === status.zoneId);
      if (!targetZone) return;
      
      // 전체 랭킹 조회
      const result = await getCharacterRankings(
        searchParams.nickname, 
        serverSlug, 
        region, 
        [targetZone]
      );
      
      if (result && result.seasons.length > 0) {
        const season = result.seasons[0];
        
        // 상세 분석도 함께 실행
        if (result._ranksData) {
          await fetchDetailedAnalysis(
            season,
            result.playerName,
            result._ranksData.dpsRanksMap,
            result._ranksData.hpsRanksMap
          );
        }
        
        setSeasonData({ ...season });
        setAnalysisResult(result);
        setExpanded(true);
      }
    } catch (error) {
      console.error('상세 데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const backgroundImage = SEASON_BACKGROUNDS[status.zoneId];

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden mb-6 max-w-2xl mx-auto">
      {/* 시즌 헤더 */}
      <div 
        className="relative px-5 py-5 border-b border-gray-800 flex flex-col items-center"
        style={{
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {backgroundImage && (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/70 via-gray-900/50 to-gray-900/90" />
        )}
        
        <div className="relative z-10 flex flex-col items-center gap-3">
          <h3 className="text-lg font-bold text-white">{status.zoneName}</h3>
          
          {/* 점수 카드들 */}
          <div className="flex gap-3">
            {/* 킬 수 카드 */}
            <div className={`
              px-4 py-2 rounded-xl border-2 min-w-[80px]
              ${status.isFullClear 
                ? 'bg-green-500/10 border-green-500/50 shadow-lg shadow-green-500/20' 
                : 'bg-gray-800/50 border-gray-700'
              }
            `}>
              <div className="text-center">
                <div className={`text-2xl font-bold ${status.isFullClear ? 'text-green-400' : 'text-gray-400'}`}>
                  {status.killedBossCount}/{8}
                </div>
                <div className={`text-xs pt-1.5 font-medium ${status.isFullClear ? 'text-green-500' : 'text-gray-500'}`}>
                  MYTHIC
                </div>
              </div>
            </div>

            {/* BEST % 카드 - 상세 분석 후에만 표시 */}
            {expanded && seasonData && (
              <>
                <div className="px-4 py-2 rounded-xl border-2 bg-purple-500/10 border-purple-500/50 min-w-[80px] relative">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${getRankColor(bestPercentScore)}`}>
                      {bestPercentScore.toFixed(1)}
                    </div>
                    <button 
                      className="text-xs font-medium text-purple-400 underline decoration-dotted cursor-pointer hover:text-purple-300"
                      onClick={() => setScorePopup(scorePopup === 'best' ? null : 'best')}
                    >
                      BEST %
                    </button>
                    {/* BEST 설명 팝업 */}
                    {scorePopup === 'best' && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 min-w-[220px] animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-left">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
                            <span className="text-gray-400 font-medium text-sm">BEST % 설명</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setScorePopup(null); }}
                              className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
                            >×</button>
                          </div>
                          <div className="text-white text-sm leading-relaxed">
                            {SCORE_DESCRIPTIONS.best}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* 버튼 */}
          {status.isFullClear && !expanded && (
            <button
              onClick={loading ? undefined : handleLoadDetails}
              disabled={loading}
              className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200
                ${loading
                  ? 'bg-gray-700/50 text-gray-400 cursor-wait'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30'
                }
              `}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-1">
                  
                  <img
                    src="/images/xal.png"
                    alt="로딩중"
                    className="h-12 w-auto animate-pulse"
                  /><span className='text-xs'>분석중.. (오래걸림)</span>
                </div>
              ) : (
                '상세 분석'
              )}
            </button>
          )}
          
          {!status.isFullClear && (
            <div className="text-gray-500 text-sm">
              상세 분석은 8/8M만 제공합니다 (cost 절감 ㅠㅠ)
            </div>
          )}
        </div>
      </div>
      
      {/* 상세 테이블 (로드 후 표시) */}
      {expanded && seasonData && (
        <SeasonTable 
          season={seasonData} 
          classID={classID}
          analysisResult={analysisResult ?? undefined}
          onSeasonUpdate={setSeasonData}
          showTableByDefault={true}
        />
      )}
    </div>
  );
}
