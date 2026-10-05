import { useEffect, useRef } from 'react';
import { useLogStream } from '../../lib/hooks';

export function LogViewer({ name }: { name: string }) {
  const text = useLogStream(name, true);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre ref={ref} className="mt-3 max-h-64 overflow-auto rounded-lg border border-line bg-black/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg/80">
      {text || '허브가 실행한 로그가 아직 없습니다. 터미널에서 직접 띄운 프로세스의 로그는 볼 수 없습니다.'}
    </pre>
  );
}
