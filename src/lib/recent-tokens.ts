const STORAGE_KEY = "parkswap-recent-tokens-v1";
const MAX = 8;

export function loadRecentTokenKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function pushRecentTokenKey(key: string) {
  if (typeof window === "undefined" || !key) return;
  try {
    const prev = loadRecentTokenKeys().filter((k) => k !== key);
    const next = [key, ...prev].slice(0, MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
