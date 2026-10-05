import { useState } from 'react';
import { Box } from './components/ui/Box';
import { Button } from './components/ui/Button';
import { Dialog } from './components/ui/Dialog';
import { GridBackground } from './components/ui/GridBackground';
import { LiveBadge } from './components/ui/LiveBadge';
import { NumberTicker } from './components/ui/NumberTicker';
import { ProgressRing } from './components/ui/ProgressRing';
import { ShimmerButton } from './components/ui/ShimmerButton';
import { SpotlightRow } from './components/ui/SpotlightRow';

export default function App() {
  const [n, setN] = useState(3);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4 p-8">
      <GridBackground />
      <div className="flex items-center gap-3">
        <ShimmerButton onClick={() => setN((v) => v + 7)}>
          <ProgressRing value={0.6} /> 새로고침
        </ShimmerButton>
        <NumberTicker value={n} className="text-2xl font-bold" />
        <LiveBadge />
        <Button variant="gradient" onClick={() => setOpen(true)}>모달</Button>
        <Button variant="live">localhost:5173 ↗</Button>
      </div>
      <div className="w-96 rounded-xl border border-line">
        <SpotlightRow active className="px-3 py-2">선택된 행</SpotlightRow>
        <SpotlightRow className="px-3 py-2">마우스를 올려보세요</SpotlightRow>
      </div>
      <Box title="이 프로젝트는" right={<span>오른쪽</span>}>본문</Box>
      <Dialog open={open} onClose={() => setOpen(false)} title="확인" footer={<Button onClick={() => setOpen(false)}>닫기</Button>}>
        내용
      </Dialog>
    </div>
  );
}
