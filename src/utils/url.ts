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
 * 将时间戳转换为本地时区的 ISO 字符串
 * @param timestamp 时间戳（毫秒）
 * @returns 本地时区的 ISO 字符串
 */
export function toLocalTimeISOString(timestamp: number): string {
    const date = new Date(timestamp);
    // 使用本地时区格式化时间
    const offset = date.getTimezoneOffset() * 60 * 1000;
    const localTime = new Date(date.getTime() - offset);
    return localTime.toISOString();
}
