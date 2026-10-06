// "Astro"와 "Astro 7", "PostgreSQL"과 "PostgreSQL(psycopg)"처럼 같은 도구를 하나로 합친다. 더 구체적인(긴) 표기를 남긴다.
export const keyOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .replace(/\s+v?\d[\w.+-]*.*$/, '')
    .trim()
    .toLowerCase();

export function mergeStack(names: string[]): string[] {
  const merged = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = keyOf(name);
    const prev = merged.get(key);
    if (!prev || name.length > prev.length) merged.set(key, name);
  }
  return [...merged.values()];
}
