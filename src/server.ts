import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Page } from "playwright";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerConfig {
  port: number;
  screenshotDir: string;
  baseUrl: string;
}

type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: unknown
) => Promise<void>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX = 1024 * 1024; // 1 MB

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error("Request body too large (max 1 MB)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

/** Resolve a locator from the three addressing modes: testid / text / selector */
function resolveLocator(
  page: Page,
  body: Record<string, string>
): ReturnType<Page["locator"]> {
  if (body.testid) return page.getByTestId(body.testid);
  if (body.text) return page.getByText(body.text, { exact: false });
  if (body.selector) return page.locator(body.selector);
  throw new Error('Body must include "testid", "text", or "selector"');
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function buildRoutes(
  page: Page,
  config: ServerConfig
): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();

  // ---- GET /health --------------------------------------------------------
  routes.set("GET /health", async (_req, res) => {
    json(res, 200, { status: "ok", url: page.url() });
  });

  // ---- GET /url -----------------------------------------------------------
  routes.set("GET /url", async (_req, res) => {
    json(res, 200, { url: page.url() });
  });

  // ---- GET /screenshot ----------------------------------------------------
  routes.set("GET /screenshot", async (_req, res) => {
    await fs.promises.mkdir(config.screenshotDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `screenshot-${timestamp}.png`;
    const filePath = path.join(config.screenshotDir, filename);

    const buffer = await page.screenshot({ fullPage: false });
    await fs.promises.writeFile(filePath, buffer);

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": buffer.length,
      "X-Path": filePath,
    });
    res.end(buffer);
  });

  // ---- GET /dom -----------------------------------------------------------
  routes.set("GET /dom", async (_req, res) => {
    const snapshot = await page.locator("body").ariaSnapshot();
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(snapshot);
  });

  // ---- GET /html ----------------------------------------------------------
  routes.set("GET /html", async (_req, res) => {
    const html = await page.content();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  // ---- POST /goto ---------------------------------------------------------
  routes.set("POST /goto", async (_req, res, body) => {
    const { url } = body as Record<string, string>;
    if (!url) throw new Error('"url" is required');

    // Accept absolute URLs or path-only strings
    const target = url.startsWith("http")
      ? url
      : `${config.baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;

    await page.goto(target);
    json(res, 200, { url: page.url() });
  });

  // ---- POST /reload -------------------------------------------------------
  routes.set("POST /reload", async (_req, res) => {
    await page.reload();
    json(res, 200, { url: page.url() });
  });

  // ---- POST /click --------------------------------------------------------
  routes.set("POST /click", async (_req, res, body) => {
    const locator = resolveLocator(page, body as Record<string, string>);
    await locator.click();
    json(res, 200, { clicked: true });
  });

  // ---- POST /fill ---------------------------------------------------------
  routes.set("POST /fill", async (_req, res, body) => {
    const b = body as Record<string, string>;
    if (!b.value && b.value !== "") throw new Error('"value" is required');
    const locator = resolveLocator(page, b);
    await locator.clear();
    await locator.fill(b.value);
    json(res, 200, { filled: true });
  });

  // ---- POST /type ---------------------------------------------------------
  // Use select-all + type for custom inputs that don't respond to fill()
  routes.set("POST /type", async (_req, res, body) => {
    const b = body as Record<string, string>;
    if (!b.value && b.value !== "") throw new Error('"value" is required');
    const locator = resolveLocator(page, b);
    await locator.click();
    const selectAll =
      process.platform === "darwin" ? "Meta+A" : "Control+A";
    await locator.press(selectAll);
    await locator.type(b.value);
    json(res, 200, { typed: true });
  });

  // ---- POST /press --------------------------------------------------------
  routes.set("POST /press", async (_req, res, body) => {
    const b = body as Record<string, string>;
    if (!b.key) throw new Error('"key" is required');
    const locator = resolveLocator(page, b);
    await locator.press(b.key);
    json(res, 200, { pressed: b.key });
  });

  // ---- POST /wait ---------------------------------------------------------
  routes.set("POST /wait", async (_req, res, body) => {
    const b = body as Record<string, string | number>;
    const state = (b.state as "visible" | "hidden" | "attached" | "detached") ?? "visible";
    const timeout = Number(b.timeout ?? 10000);
    const locator = resolveLocator(page, b as Record<string, string>);
    await locator.waitFor({ state, timeout });
    json(res, 200, { state, done: true });
  });

  // ---- POST /eval ---------------------------------------------------------
  routes.set("POST /eval", async (_req, res, body) => {
    const { code } = body as Record<string, string>;
    if (!code) throw new Error('"code" is required');
    // eslint-disable-next-line no-eval
    const result = await page.evaluate(code);
    json(res, 200, { result });
  });

  return routes;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createServer(page: Page, config: ServerConfig): http.Server {
  const routes = buildRoutes(page, config);

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.split("?")[0];
    const key = `${method} ${pathname}`;

    const handler = routes.get(key);

    if (!handler) {
      json(res, 404, { error: `No route: ${key}` });
      return;
    }

    try {
      let body: unknown = {};
      if (method === "POST") {
        body = await readBody(req);
      }
      await handler(req, res, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: message });
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Startup banner
// ---------------------------------------------------------------------------

export function printBanner(config: ServerConfig): void {
  const lines = [
    `  browser-agent  ·  port ${config.port}`,
    `  base URL: ${config.baseUrl}`,
    `  screenshots → ${config.screenshotDir}`,
    ``,
    `  ENDPOINTS`,
    `  GET  /health          liveness check`,
    `  GET  /url             current page URL`,
    `  GET  /screenshot      PNG bytes (saves to screenshotDir, X-Path header)`,
    `  GET  /dom             ARIA accessibility snapshot`,
    `  GET  /html            full page HTML`,
    `  POST /goto            { url }                      navigate`,
    `  POST /reload          reload current page`,
    `  POST /click           { testid|text|selector }     click element`,
    `  POST /fill            { testid|selector, value }   clear + fill input`,
    `  POST /type            { testid|selector, value }   select-all + type`,
    `  POST /press           { testid|selector, key }     keyboard press`,
    `  POST /wait            { testid|selector, state,    wait for element`,
    `                          timeout? }`,
    `  POST /eval            { code }                     evaluate JS in page`,
  ];

  const width = Math.max(...lines.map((l) => l.length)) + 2;
  const bar = "─".repeat(width);

  console.log(`\n┌${bar}┐`);
  for (const line of lines) {
    console.log(`│ ${line.padEnd(width - 1)}│`);
  }
  console.log(`└${bar}┘\n`);
}
