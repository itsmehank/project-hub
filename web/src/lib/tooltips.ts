import type { Filter } from './status';

export const FILTER_TIPS: Record<Filter, string> = {
  all: '스캔한 모든 프로젝트',
  running: '지금 이 프로젝트 폴더에서 프로세스가 실행되고 있음 (서버·봇 등)',
  active: '최근 14일 안에 커밋이 있음',
  dormant: '마지막 커밋이 15~60일 전',
  stale: '마지막 커밋이 60일보다 오래됨',
  dirty: '커밋하지 않은 변경 파일이 남아 있음',
};

export const REFRESH_TIP = [
  '1. 폴더를 다시 스캔해 새 프로젝트·삭제된 프로젝트를 반영',
  '2. 각 저장소에서 git fetch 후 브랜치·커밋·변경 상태 수집',
  '3. GitHub 이슈·PR·CI 상태 갱신',
  '4. 바뀐 프로젝트만 Claude가 설명을 다시 작성',
  '5. 요약이 바뀌었으면 첫 화면 인사이트를 다시 분석',
  'Shift+클릭: 모든 프로젝트 설명을 새로 작성 (수 분 소요, Claude 사용량 발생)',
];
