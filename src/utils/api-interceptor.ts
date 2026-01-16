import { CDPClient } from "../browser/client";
import { createLogger } from "./logger";

const logger = createLogger("ApiInterceptor");

export interface InterceptOptions {
  timeout?: number; // 超时时间（毫秒）
  maxAttempts?: number; // 最大尝试次数
  triggerAction?: () => Promise<void>; // 触发 API 请求的操作
}

export interface InterceptResult {
  success: boolean;
  data?: string; // JSON 字符串格式的数据
  error?: string;
  metadata?: {
    timestamp: string;
    attemptCount: number;
    requestUrl: string;
  };
}

/**
 * 精准拦截指定接口的最新一次数据
 *
 * @param client - CDP 客户端实例
 * @param apiUrl - 要拦截的 API URL
 * @param options - 配置选项
 * @returns Promise<InterceptResult>
 *
 * @example
 * ```typescript
 * const result = await interceptApiData(client, 'https://api.example.com/data', {
 *   timeout: 10000,
 *   maxAttempts: 3,
 *   triggerAction: async () => {
 *     await client.navigate('https://example.com');
 *   }
 * });
 *
 * if (result.success) {
 *   const data = JSON.parse(result.data);
 *   console.log('拦截成功:', data);
 * } else {
 *   console.error('拦截失败:', result.error);
 * }
 * ```
 */
export async function interceptApiData(
  client: CDPClient,
  apiUrl: string,
  options: InterceptOptions = {},
): Promise<InterceptResult> {
  const { timeout = 10000, maxAttempts = 5, triggerAction } = options;

  let latestData: any = null;
  let attemptCount = 0;
  let isResolved = false;

  const startTime = Date.now();

  try {
    logger.info(`开始拦截 API: ${apiUrl}`);
    logger.debug(`配置: timeout=${timeout}ms, maxAttempts=${maxAttempts}`);

    // 设置拦截回调
    client.addNetworkCallback(apiUrl, (response: any, request?: string) => {
      if (isResolved) return;

      attemptCount++;
      logger.debug(`拦截到第 ${attemptCount} 次请求`);

      // 只保存最新的数据
      latestData = {
        timestamp: new Date().toISOString(),
        attemptCount,
        request,
        response,
      };

      logger.debug(`已更新最新数据缓存 (尝试次数: ${attemptCount})`);
    });

    // 执行触发操作（如果提供）
    if (triggerAction) {
      logger.debug("执行触发操作...");
      await triggerAction();
    }

    // 等待拦截数据或超时
    await new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // 检查是否成功拦截到数据
        if (latestData) {
          clearInterval(checkInterval);
          isResolved = true;
          resolve();
          return;
        }

        // 检查是否超时
        if (elapsed >= timeout) {
          clearInterval(checkInterval);
          isResolved = true;
          reject(new Error(`拦截超时: ${timeout}ms 内未捕获到数据`));
          return;
        }

        // 检查是否达到最大尝试次数
        if (attemptCount >= maxAttempts) {
          clearInterval(checkInterval);
          isResolved = true;
          resolve();
          return;
        }
      }, 100);
    });

    // 移除拦截回调
    client.removeNetworkCallback(apiUrl);

    // 检查是否成功拦截到数据
    if (!latestData) {
      return {
        success: false,
        error: `未拦截到数据 (尝试次数: ${attemptCount}, 耗时: ${Date.now() - startTime}ms)`,
        metadata: {
          timestamp: new Date().toISOString(),
          attemptCount,
          requestUrl: apiUrl,
        },
      };
    }

    // 返回成功结果
    const result: InterceptResult = {
      success: true,
      data: JSON.stringify(latestData, null, 2),
      metadata: {
        timestamp: latestData.timestamp,
        attemptCount: latestData.attemptCount,
        requestUrl: apiUrl,
      },
    };

    logger.info(
      `拦截成功 (尝试次数: ${attemptCount}, 耗时: ${Date.now() - startTime}ms)`,
    );
    return result;
  } catch (error: any) {
    // 移除拦截回调
    try {
      client.removeNetworkCallback(apiUrl);
    } catch (e) {
      // 忽略移除回调的错误
    }

    const errorMessage = error.message || String(error);
    logger.error(`拦截失败: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      metadata: {
        timestamp: new Date().toISOString(),
        attemptCount,
        requestUrl: apiUrl,
      },
    };
  }
}

/**
 * 批量拦截多个接口的数据
 *
 * @param client - CDP 客户端实例
 * @param apiUrls - 要拦截的 API URL 数组
 * @param options - 配置选项
 * @returns Promise<Map<string, InterceptResult>>
 *
 * @example
 * ```typescript
 * const results = await interceptMultipleApis(client, [
 *   'https://api.example.com/data1',
 *   'https://api.example.com/data2'
 * ], {
 *   timeout: 10000,
 *   triggerAction: async () => {
 *     await client.navigate('https://example.com');
 *   }
 * });
 *
 * results.forEach((result, url) => {
 *   if (result.success) {
 *     console.log(`${url}:`, JSON.parse(result.data));
 *   }
 * });
 * ```
 */
export async function interceptMultipleApis(
  client: CDPClient,
  apiUrls: string[],
  options: InterceptOptions = {},
): Promise<Map<string, InterceptResult>> {
  const results = new Map<string, InterceptResult>();

  logger.info(`开始批量拦截 ${apiUrls.length} 个 API`);

  // 并发拦截所有 API
  const promises = apiUrls.map(async (url) => {
    const result = await interceptApiData(client, url, options);
    results.set(url, result);
  });

  await Promise.all(promises);

  const successCount = Array.from(results.values()).filter(
    (r) => r.success,
  ).length;
  logger.info(`批量拦截完成: ${successCount}/${apiUrls.length} 成功`);

  return results;
}
