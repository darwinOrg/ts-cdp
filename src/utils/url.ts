export function getPureUrl(url: string): string {
  const u = new URL(url);
  u.search = '';
  return u.toString();
}

export function isWatchedUrl(url: string, watchUrls: string[]): boolean {
  const pureUrl = getPureUrl(url);
  return watchUrls.includes(pureUrl) || watchUrls.includes(url);
}

export function normalizeUrl(url: string): string {
  try {
    return getPureUrl(url);
  } catch {
    return url;
  }
}