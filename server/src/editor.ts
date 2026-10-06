import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// "편집기에서 열기"에 쓸 macOS 앱. Python 프로젝트는 PyCharm, 그 외는 IntelliJ IDEA를 우선한다.
const PYTHON_FIRST = ['PyCharm', 'IntelliJ IDEA', 'Visual Studio Code', 'Cursor'];
const DEFAULT_ORDER = ['IntelliJ IDEA', 'Visual Studio Code', 'Cursor', 'WebStorm', 'PyCharm'];

export function resolveEditor(stack: string[], installed: (app: string) => boolean, preferred?: string): string | null {
  if (preferred && installed(preferred)) return preferred;
  const order = stack.some((s) => s.toLowerCase().startsWith('python')) ? PYTHON_FIRST : DEFAULT_ORDER;
  return order.find(installed) ?? null;
}

export function appInstalled(app: string): boolean {
  return ['/Applications', path.join(homedir(), 'Applications')].some((dir) => existsSync(path.join(dir, `${app}.app`)));
}
