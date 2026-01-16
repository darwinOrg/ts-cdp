/**
 * 反检测脚本生成器
 * 用于生成注入到页面的反检测脚本，避免被网站识别为自动化工具
 */

export function getAntiDetectScript(): string {
  return `
    (function() {
      'use strict';

      // 1. 隐藏 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // 2. 伪装 Chrome 对象
      window.chrome = {
        runtime: {}
      };

      // 3. 伪装 navigator.plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // 4. 伪装 navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
      });

      // 5. 删除 cdc_ 开头的变量（Chrome DevTools Protocol 注入的变量）
      const deleteCdcVars = () => {
        for (let key in window) {
          if (key.startsWith('cdc_')) {
            delete window[key];
          }
        }
      };
      deleteCdcVars();

      // 6. 伪装 permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'granted' }) :
          originalQuery(parameters)
      );

      // 7. 伪装 WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };

      // 8. 伪装 canvas 指纹
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        if (type === 'image/png') {
          return originalToDataURL.call(this, type);
        }
        return originalToDataURL.call(this, type);
      };

      // 9. 伪装 navigator.vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.'
      });

      // 10. 伪装 navigator.platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel'
      });

      // 11. 伪装 screen 信息
      Object.defineProperty(screen, 'availHeight', {
        get: () => 1080
      });
      Object.defineProperty(screen, 'availWidth', {
        get: () => 1920
      });
      Object.defineProperty(screen, 'height', {
        get: () => 1080
      });
      Object.defineProperty(screen, 'width', {
        get: () => 1920
      });

      // 12. 伪装 navigator.connection
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 100,
          downlink: 10,
          saveData: false
        })
      });

      // 13. 伪装 navigator.deviceMemory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
      });

      // 14. 伪装 navigator.hardwareConcurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
      });

      // 15. 伪装 navigator.maxTouchPoints
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0
      });

      // 16. 伪装 PointerEvent
      const originalPointerEvent = window.PointerEvent;
      window.PointerEvent = function(type, eventInitDict) {
        return originalPointerEvent.call(this, type, eventInitDict);
      };

      // 17. 伪装 MouseEvent
      const originalMouseEvent = window.MouseEvent;
      window.MouseEvent = function(type, eventInitDict) {
        return originalMouseEvent.call(this, type, eventInitDict);
      };

      // 18. 伪装 KeyboardEvent
      const originalKeyboardEvent = window.KeyboardEvent;
      window.KeyboardEvent = function(type, eventInitDict) {
        return originalKeyboardEvent.call(this, type, eventInitDict);
      };

      // 19. 伪装 TouchEvent
      const originalTouchEvent = window.TouchEvent;
      window.TouchEvent = function(type, eventInitDict) {
        return originalTouchEvent.call(this, type, eventInitDict);
      };

      // 20. 伪装 FocusEvent
      const originalFocusEvent = window.FocusEvent;
      window.FocusEvent = function(type, eventInitDict) {
        return originalFocusEvent.call(this, type, eventInitDict);
      };

      console.log('Anti-detect script injected successfully');
    })();
  `;
}

export async function injectAntiDetectScript(client: any): Promise<void> {
  const cdpClient = client.getClient ? client.getClient() : client;
  if (!cdpClient || !cdpClient.Runtime) {
    throw new Error('CDP client not initialized or Runtime not available');
  }
  await cdpClient.Runtime.evaluate({
    expression: getAntiDetectScript(),
    returnByValue: true
  });
}