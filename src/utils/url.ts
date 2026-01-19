export function getPureUrl(url: string): string {
  const u = new URL(url);
  u.search = "";
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

/**
 * 获取北京时间的 ISO 字符串
 * @returns 北京时间的 ISO 字符串（UTC+8）
 */
export function getBeijingTimeISOString(): string {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString();
}

/**
 * 将时间戳转换为北京时间的 ISO 字符串
 * @param timestamp 时间戳（毫秒）
 * @returns 北京时间的 ISO 字符串（UTC+8）
 */
export function toBeijingTimeISOString(timestamp: number): string {
  const date = new Date(timestamp);
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString();
}
