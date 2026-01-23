import type { SeasonClearStatus, SearchParams } from '../types';
import { SeasonCard } from './SeasonCard';

interface AnalysisPageProps {
  playerName: string;
  classID?: number;
  seasonStatus: SeasonClearStatus[];
  searchParams: SearchParams | null;
}

export function AnalysisPage({ playerName, classID, seasonStatus, searchParams }: AnalysisPageProps) {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
    <div className="flex-1 py-8 px-4">
        {/* 플레이어 정보 헤더 */}
        <div className="max-w-2xl mx-auto mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{playerName}</h2>
            <p className="text-gray-400 text-sm">분석 결과</p>
          </div>
        </div>

        {/* 시즌별 카드 (최신 시즌 먼저) */}
        <div className="space-y-4">
          {[...seasonStatus].reverse().map((status) => (
            <SeasonCard 
              key={status.zoneId} 
              status={status}
              searchParams={searchParams}
              classID={classID}
            />
          ))}
        </div>

        {/* 빈 데이터 안내 */}
        {seasonStatus.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-xl mb-2">분석 결과가 없습니다</p>
            <p className="text-sm">캐릭터를 찾을 수 없거나 레이드 기록이 없습니다.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="py-6 px-4 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs text-gray-600 leading-relaxed">
            All data is retrieved from Warcraft Logs. Item and ability tooltips by Wowhead.
            <br />
            All images copyright Blizzard Entertainment. World of Warcraft, Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries.
          </p>
        </div>
      </footer>
    </div>
  );
}
