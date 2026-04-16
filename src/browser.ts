import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from "fs";

export interface BrowserConfig {
  baseUrl: string;
  startPath: string;
  authStatePath?: string;
  headless: boolean;
  slowMo: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchBrowser(config: BrowserConfig): Promise<BrowserInstance> {
  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  });

  const contextOptions: Parameters<Browser["newContext"]>[0] = {
    viewport: {
      width: config.viewportWidth,
      height: config.viewportHeight,
    },
  };

  if (config.authStatePath) {
    if (!fs.existsSync(config.authStatePath)) {
      throw new Error(
        `BROWSER_AUTH_STATE file not found: ${config.authStatePath}\n` +
          `Generate one with: npx playwright codegen --save-storage=${config.authStatePath} ${config.baseUrl}`
      );
    }
    contextOptions.storageState = config.authStatePath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const startUrl = `${config.baseUrl.replace(/\/$/, "")}${config.startPath}`;
  await page.goto(startUrl);

  return { browser, context, page };
}

export async function closeBrowser(instance: BrowserInstance): Promise<void> {
  try {
    await instance.browser.close();
  } catch {
    // Ignore errors during close — process is shutting down
  }
}
