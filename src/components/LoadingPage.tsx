

export function LoadingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20">
      {/* 로딩 애니메이션 */}
      <div className="relative w-24 h-24 mb-8">
        {/* 외부 링 */}
        <div className="absolute inset-0 border-4 border-purple-500/30 rounded-full"></div>
        {/* 회전하는 링 */}
        <div className="absolute inset-0 border-4 border-transparent border-t-purple-500 rounded-full animate-spin"></div>
        {/* 내부 아이콘 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex justify-center animate-pulse">
          <img
            src="/images/xal.png"
            alt="잘아타스 로고"
            className="h-auto w-auto"
          />
        </div>
        </div>
      </div>
      
      <h2 className="text-xl text-gray-300 mb-2">로그 분석 중...</h2>
      <p className="text-gray-500 text-sm mb-8">1차 데이터를 불러오고 있습니다.</p>
    </div>
  );
}
