#!/usr/bin/env node
/**
 * browser-agent — AI-driven browser control without computer vision
 *
 * Starts a Playwright-backed Chromium instance and exposes an HTTP API that
 * lets AI agents (Claude, GPT, etc.) drive the browser via REST calls.
 *
 * All configuration is via environment variables. See .env.example.
 */

import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";
import { launchBrowser, closeBrowser, BrowserConfig } from "./browser";
import { createServer, printBanner, ServerConfig } from "./server";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.BROWSER_PORT ?? 9229);
const BASE_URL = process.env.BROWSER_BASE_URL ?? "http://localhost:3000";
const START_PATH = process.env.BROWSER_START_PATH ?? "/";
const AUTH_STATE = process.env.BROWSER_AUTH_STATE ?? undefined;
const HEADLESS = (process.env.BROWSER_HEADLESS ?? "false").toLowerCase() !== "false";
const SLOW_MO = Number(process.env.BROWSER_SLOW_MO ?? 30);
const VIEWPORT_W = Number(process.env.BROWSER_VIEWPORT_W ?? 1440);
const VIEWPORT_H = Number(process.env.BROWSER_VIEWPORT_H ?? 900);
const SCREENSHOT_DIR =
  process.env.BROWSER_SCREENSHOT_DIR ??
  path.join(os.tmpdir(), "browser-agent-screenshots");

const browserConfig: BrowserConfig = {
  baseUrl: BASE_URL,
  startPath: START_PATH,
  authStatePath: AUTH_STATE,
  headless: HEADLESS,
  slowMo: SLOW_MO,
  viewportWidth: VIEWPORT_W,
  viewportHeight: VIEWPORT_H,
};

const serverConfig: ServerConfig = {
  port: PORT,
  screenshotDir: SCREENSHOT_DIR,
  baseUrl: BASE_URL,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function freePort(port: number): void {
  try {
    const pids = child_process
      .execSync(`lsof -ti:${port} 2>/dev/null || true`)
      .toString()
      .trim();
    if (pids) {
      child_process.execSync(`kill -9 ${pids.split("\n").join(" ")} 2>/dev/null || true`);
      console.log(`  freed port ${port} (killed pid ${pids.replace(/\n/g, ", ")})`);
    }
  } catch {
    // lsof not available or nothing to kill — continue
  }
}

async function main(): Promise<void> {
  console.log("\nbrowser-agent starting…");
  console.log(`  headless:   ${HEADLESS}`);
  console.log(`  slow_mo:    ${SLOW_MO} ms`);
  console.log(`  viewport:   ${VIEWPORT_W}×${VIEWPORT_H}`);
  console.log(`  base URL:   ${BASE_URL}`);
  console.log(`  start path: ${START_PATH}`);
  if (AUTH_STATE) console.log(`  auth state: ${AUTH_STATE}`);
  console.log("");

  // Clear the port before launching so we never get EADDRINUSE
  freePort(PORT);

  // Launch browser
  const instance = await launchBrowser(browserConfig);
  console.log(`  browser ready → ${instance.page.url()}`);

  // Start HTTP server
  const server = createServer(instance.page, serverConfig);

  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, () => {
      printBanner(serverConfig);
      console.log(`  listening on http://localhost:${PORT}\n`);
      resolve();
    });
    server.on("error", reject);
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\nbrowser-agent: received ${signal}, shutting down…`);

    // Browser must close before server so in-flight Playwright calls finish
    await closeBrowser(instance);
    console.log("  browser closed");

    server.close(() => {
      console.log("  server closed");
      process.exit(0);
    });

    // Force exit if clean shutdown stalls
    setTimeout(() => {
      console.warn("  force exit after timeout");
      process.exit(1);
    }, 5000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGHUP", () => shutdown("SIGHUP"));
}

main().catch((err) => {
  console.error("browser-agent: fatal error:", err);
  process.exit(1);
});
