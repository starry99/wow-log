import { useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { LoadingPage } from './components/LoadingPage';
import { AnalysisPage } from './components/AnalysisPage';
import { getZoneData, checkSeasonClearStatus } from './api/warcraftLogs';
import LiquidEther from './components/LiquidEther';
import type { SearchParams, SeasonClearStatus } from './types';

type AppState = 'search' | 'loading' | 'analysis';

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

function App() {
  const [appState, setAppState] = useState<AppState>('search');
  const [searchParams, setSearchParams] = useState<SearchParams | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<SeasonClearStatus[]>([]);
  const [playerName, setPlayerName] = useState<string>('');
  const [classID, setClassID] = useState<number | undefined>(undefined);

  const handleSearch = async (params: SearchParams) => {
    setSearchParams(params);
    setAppState('loading');
    
    try {
      // 서버 이름을 slug로 변환
      const serverSlug = serverSlugMap[params.server] || params.server.toLowerCase();
      const region = params.region.toLowerCase();
      
      // 1. Zone 데이터 가져오기 (상수)
      const zones = getZoneData();
      
      // 2. 가벼운 쿼리로 8/8 상태만 확인
      const result = await checkSeasonClearStatus(params.nickname, serverSlug, region, zones);
      
      if (result) {
        setPlayerName(result.playerName);
        setClassID(result.classID);
        setSeasonStatus(result.seasonStatus);
      } else {
        setPlayerName(params.nickname);
        setSeasonStatus([]);
      }
      
      setAppState('analysis');
    } catch (error) {
      console.error('❌ API 연결 실패:', error);
      setPlayerName(params.nickname);
      setSeasonStatus([]);
      setAppState('analysis');
    }
  };


  const handleNewSearch = () => {
    setAppState('search');
    setSearchParams(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col relative">
      {/* 배경 효과 - 검색 페이지에서만 표시 */}
      {appState === 'search' && (
        <div className="absolute inset-0 z-0">
          <LiquidEther
            colors={['#5227FF', '#FF9FFC', '#B19EEF']}
            mouseForce={20}
            cursorSize={100}
            isViscous={false}
            viscous={30}
            iterationsViscous={32}
            iterationsPoisson={32}
            resolution={0.5}
            isBounce={false}
            autoDemo={true}
            autoSpeed={0.5}
            autoIntensity={2.2}
            takeoverDuration={0.25}
            autoResumeDelay={3000}
            autoRampDuration={0.6}
          />
        </div>
      )}

      {/* 검색창 영역 */}
      <div
        className={`
          w-full px-4 relative z-10
          transition-all duration-500 ease-out
          ${appState === 'search'
            ? 'flex-1 flex items-center justify-center'
            : 'py-0 bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 top-0 z-50'
          }
        `}
      >
        <div className={`
          transition-transform duration-500 ease-out origin-center
          ${appState !== 'search' ? 'scale-75' : ''}
        `}>
          <SearchBar
            onSearch={handleSearch}
            isCompact={appState !== 'search'}
          />
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      {appState === 'loading' && (
        <LoadingPage />
      )}

      {appState === 'analysis' && (
        <AnalysisPage
          playerName={playerName || (searchParams ? `${searchParams.nickname} @ ${searchParams.server}-${searchParams.region}` : '')}
          classID={classID}
          seasonStatus={seasonStatus}
          searchParams={searchParams}
        />
      )}

      {/* 푸터 */}
      {appState !== 'search' && (
        <footer className="py-2 text-center text-gray-600 text-sm">
          <button
            onClick={handleNewSearch}
            className="hover:text-gray-400 transition-colors"
          >
            ← 메인으로
          </button>
        </footer>
      )}
    </div>
  );
}

export default App;
