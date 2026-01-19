import type { BrowserPage } from "./page";
import { createLogger } from "../utils/logger";

const logger = createLogger("BrowserLocator");

export interface LocatorOptions {
  timeout?: number;
}

export class BrowserLocator {
  private page: BrowserPage;
  private selector: string;
  private selectorChain: string[];
  private options: LocatorOptions;

  constructor(
    page: BrowserPage,
    selector: string,
    options: LocatorOptions = {},
    selectorChain: string[] = [],
  ) {
    this.page = page;
    this.selector = selector;
    this.selectorChain = [...selectorChain, selector]; // 保存选择器链
    this.options = {
      timeout: 10000,
      ...options,
    };
  }

  async exists(): Promise<boolean> {
    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `document.querySelector('${escapedSelector}') !== null`,
      );
      return result || false;
    } catch (error) {
      logger.error(`locator[${this.selector}] exists error:`, error);
      return false;
    }
  }

  async getText(): Promise<string> {
    if (!(await this.exists())) {
      logger.debug(`locator[${this.selector}] getText: element does not exist`);
      return "";
    }

    try {
      logger.debug(`locator[${this.selector}] getText: calling executeScript`);
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `document.querySelector('${escapedSelector}').innerText`,
      );
      logger.debug(
        `locator[${this.selector}] getText result:`,
        result,
        "type:",
        typeof result,
      );
      return result ? result.trim() : "";
    } catch (error) {
      logger.error(`locator[${this.selector}] get text error:`, error);
      return "";
    }
  }

  async getAttribute(attr: string): Promise<string> {
    if (!(await this.exists())) {
      return "";
    }

    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `document.querySelector('${escapedSelector}').getAttribute('${attr}')`,
      );
      return result ? result.trim() : "";
    } catch (error) {
      logger.error(`locator[${this.selector}] get attribute error:`, error);
      return "";
    }
  }

  async getHTML(): Promise<string> {
    if (!(await this.exists())) {
      return "";
    }

    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `document.querySelector('${escapedSelector}').outerHTML`,
      );
      return result || "";
    } catch (error) {
      logger.error(`locator[${this.selector}] get html error:`, error);
      return "";
    }
  }

  async getTextContent(): Promise<string> {
    if (!(await this.exists())) {
      return "";
    }

    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `document.querySelector('${escapedSelector}').textContent`,
      );
      return result ? result.trim() : "";
    } catch (error) {
      logger.error(`locator[${this.selector}] get text content error:`, error);
      return "";
    }
  }

  async click(options: { timeout?: number } = {}): Promise<void> {
    if (!(await this.exists())) {
      throw new Error(`Element not found: ${this.selector}`);
    }

    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      await this.page.executeScript(
        `document.querySelector('${escapedSelector}').click()`,
      );
    } catch (error) {
      logger.error(`locator[${this.selector}] click error:`, error);
      throw error;
    }
  }

  async hover(): Promise<void> {
    if (!(await this.exists())) {
      throw new Error(`Element not found: ${this.selector}`);
    }

    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      await this.page.executeScript(
        `
        const el = document.querySelector('${escapedSelector}');
        if (el) {
          const event = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(event);
        }
        `,
      );
    } catch (error) {
      logger.error(`locator[${this.selector}] hover error:`, error);
      throw error;
    }
  }

  async setValue(value: string): Promise<void> {
    if (!(await this.exists())) {
      throw new Error(`Element not found: ${this.selector}`);
    }

    try {
      const element = await this.page.executeScript(
        `document.querySelector('${this.selector}')`,
      );

      // 清空现有值
      await this.page.executeScript(
        `document.querySelector('${this.selector}').value = ''`,
      );

      // 设置新值
      await this.page.executeScript(
        `document.querySelector('${this.selector}').value = '${value.replace(/'/g, "\\'")}'`,
      );

      // 触发 input 事件
      await this.page.executeScript(
        `
        const event = new Event('input', { bubbles: true });
        document.querySelector('${this.selector}').dispatchEvent(event);
        `,
      );
    } catch (error) {
      logger.error(`locator[${this.selector}] set value error:`, error);
      throw error;
    }
  }

  async isVisible(): Promise<boolean> {
    if (!(await this.exists())) {
      return false;
    }

    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `
        (function() {
          const el = document.querySelector('${escapedSelector}');
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
        })()
        `,
      );
      return result || false;
    } catch (error) {
      logger.error(`locator[${this.selector}] is visible error:`, error);
      return false;
    }
  }

  async hasClass(className: string): Promise<boolean> {
    if (!(await this.exists())) {
      return false;
    }

    try {
      const classAttr = await this.getAttribute("class");
      if (!classAttr) return false;

      const classes = classAttr.split(/\s+/).filter((c) => c);
      return classes.includes(className);
    } catch (error) {
      logger.error(`locator[${this.selector}] has class error:`, error);
      return false;
    }
  }

  async getAllTexts(): Promise<string[]> {
    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `Array.from(document.querySelectorAll('${escapedSelector}')).map(el => el.innerText)`,
      );
      return result || [];
    } catch (error) {
      logger.error(`locator[${this.selector}] get all texts error:`, error);
      return [];
    }
  }

  async getAllAttributes(attr: string): Promise<string[]> {
    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `Array.from(document.querySelectorAll('${escapedSelector}')).map(el => el.getAttribute('${attr}'))`,
      );
      return result || [];
    } catch (error) {
      logger.error(
        `locator[${this.selector}] get all attributes error:`,
        error,
      );
      return [];
    }
  }

  async getCount(): Promise<number> {
    try {
      // 转义 selector 中的单引号
      const escapedSelector = this.selector.replace(/'/g, "\\'");
      const result = await this.page.executeScript(
        `document.querySelectorAll('${escapedSelector}').length`,
      );
      return result || 0;
    } catch (error) {
      logger.error(`locator[${this.selector}] get count error:`, error);
      return 0;
    }
  }

  // AllLocators - 获取所有匹配的元素
  async allLocators(): Promise<BrowserLocator[]> {
    const count = await this.getCount();
    if (count === 0) return [];

    const locators: BrowserLocator[] = [];
    for (let i = 0; i < count; i++) {
      // 使用 :nth-of-type 而不是 :nth-child，更准确地选择匹配的元素
      const indexSelector = `${this.selector}:nth-of-type(${i + 1})`;
      locators.push(
        new BrowserLocator(
          this.page,
          indexSelector,
          this.options,
          this.selectorChain,
        ),
      );
    }
    return locators;
  }

  // AllInnerTexts - 获取所有元素的内部文本
  async allInnerTexts(): Promise<string[]> {
    const locators = await this.allLocators();
    const texts: string[] = [];
    for (const locator of locators) {
      texts.push(await locator.getText());
    }
    return texts;
  }

  // AllTextContents - 获取所有元素的文本内容
  async allTextContents(): Promise<string[]> {
    const locators = await this.allLocators();
    const texts: string[] = [];
    for (const locator of locators) {
      texts.push(await locator.getTextContent());
    }
    return texts;
  }

  // AllAttributes - 获取所有元素的属性
  async allAttributes(attr: string): Promise<string[]> {
    const locators = await this.allLocators();
    const attributes: string[] = [];
    for (const locator of locators) {
      attributes.push(await locator.getAttribute(attr));
    }
    return attributes;
  }

  // GetSelectors - 获取选择器链
  getSelectors(): string[] {
    return this.selectorChain;
  }
}
