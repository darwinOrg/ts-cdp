/**
 * 将通配符模式转换为正则表达式
 * 支持 Playwright 风格的 URL 匹配规则：
 * - * 匹配任意字符（不包括路径分隔符 /）
 * - ** 匹配任意字符（包括路径分隔符 /）
 * @param pattern 通配符模式
 * @returns 正则表达式对象
 */
export function wildcardToRegex(pattern: string): RegExp {
    let regexPattern = pattern;

    // 处理 ** 通配符（匹配任意字符，包括路径分隔符）
    regexPattern = regexPattern.replace(/\*\*/g, "DOUBLE_WILDCARD");

    // 处理 * 通配符（匹配任意字符，不包括路径分隔符）
    regexPattern = regexPattern.replace(/(?<!\*)\*(?!\*)/g, "SINGLE_WILDCARD");

    // 转义其他正则特殊字符（不包括 /）
    regexPattern = regexPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

    // 将占位符替换为正则表达式
    regexPattern = regexPattern.replace(/DOUBLE_WILDCARD/g, ".*");
    regexPattern = regexPattern.replace(/SINGLE_WILDCARD/g, "[^/]*");

    return new RegExp(regexPattern);
}

/**
 * 获取本地时间的 ISO 字符串
 * @returns 本地时间的 ISO 字符串
 */
export function getLocalTimeISOString(): string {
    return toLocalTimeISOString(Date.now())
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
