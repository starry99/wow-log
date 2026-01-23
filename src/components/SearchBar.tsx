import type { SearchParams } from '../types';
import { useState } from 'react';

interface SearchBarProps {
  onSearch: (params: SearchParams) => void;
  isCompact: boolean;
}

export function SearchBar({ onSearch, isCompact }: SearchBarProps) {
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState('');
  const [server, setServer] = useState('');
  
  // 기본값 표시용 (실제 값과 별도)
  const displayRegion = region || 'KR';
  const displayServer = server || '아즈샤라';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    
    onSearch({
      nickname: nickname.trim(),
      region: region.trim() || 'KR',
      server: server.trim() || '아즈샤라',
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`
        w-full mx-auto
        transition-all duration-500 ease-out
        ${isCompact ? 'max-w-xl py-4' : 'max-w-xl py-0 -mt-9'}
      `}
    >
      {!isCompact && (
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
              갤로그: 와우 로그 분석
            </h1>
            <img src="/images/glog.png" alt="Glog" className="h-10 w-auto" />
          </div>
          <p className="text-gray-400 text-sm">
            현재는 내부전쟁 신화레이드 데이터만 분석가능합니다. (한밤 구인용)
          </p>
        </div>
      )}
      
      <div className={`
        flex gap-3
        ${isCompact ? 'flex-row items-center' : 'flex-col sm:flex-row'}
      `}>
        {/* 닉네임 입력 (반으로 줄임) */}
        <div className={`${isCompact ? 'flex-1' : 'flex-[1.5]'}`}>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임을 입력하세요"
            className="
              w-full px-4 py-3 rounded-xl
              bg-gray-800/80 border border-gray-700
              text-white placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              transition-all duration-200
            "
          />
        </div>
        
        {/* 지역 코드 (기본값: KR) - 반으로 줄임 */}
        <div className={`${isCompact ? 'w-16' : 'flex-[0.5]'}`}>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder={displayRegion}
            className="
              w-full px-4 py-3 rounded-xl
              bg-gray-800/80 border border-gray-700
              text-white placeholder-gray-400
              text-center
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              transition-all duration-200
            "
          />
        </div>
        
        {/* 서버명 (기본값: 아즈샤라) */}
        <div className={`${isCompact ? 'w-28' : 'flex-1'}`}>
          <input
            type="text"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder={displayServer}
            className="
              w-full px-4 py-3 rounded-xl
              bg-gray-800/80 border border-gray-700
              text-white placeholder-gray-400
              text-center
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              transition-all duration-200
            "
          />
        </div>
        
        {/* 검색 버튼 */}
        <button
          type="submit"
          disabled={!nickname.trim()}
          className="
            px-6 py-3 rounded-xl
            bg-gradient-to-r from-purple-600 to-pink-600
            text-white font-semibold
            hover:from-purple-500 hover:to-pink-500
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
            shadow-lg shadow-purple-500/25
          "
        >
          검색
        </button>
      </div>

      {/* 로고 - 메인 페이지에서만 표시 */}
      {/* {!isCompact && (
        <div className="flex justify-center mt-10">
          <img
            src="/images/midnight.webp"
            alt="한밤 로고"
            className="h-36 w-auto opacity-80"
          />
        </div>
      )} */}
    </form>
  );
}
