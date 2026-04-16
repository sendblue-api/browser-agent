/**
 * with-auth.ts — example for apps that require a logged-in session
 *
 * Step 1: Generate an auth state file by recording a login flow.
 *
 *   npx playwright codegen \
 *     --save-storage=auth.json \
 *     https://your-app.example.com
 *
 *   Log in manually in the browser that opens. When you close it,
 *   auth.json will contain cookies + localStorage for that session.
 *
 * Step 2: Start browser-agent with the auth state:
 *
 *   BROWSER_BASE_URL=https://your-app.example.com \
 *   BROWSER_AUTH_STATE=./auth.json \
 *   BROWSER_START_PATH=/dashboard \
 *   npm start
 *
 *   The browser will open already authenticated and land on /dashboard.
 *
 * Step 3: Drive the browser via HTTP as usual:
 *
 *   curl http://localhost:9229/dom
 *   curl http://localhost:9229/screenshot --output /tmp/dashboard.png
 *
 * Notes:
 * - auth.json contains sensitive session tokens. Add it to .gitignore.
 * - Sessions expire. Regenerate auth.json when you get 401s.
 * - For CI/CD, generate auth.json in a setup step and pass the path via
 *   BROWSER_AUTH_STATE.
 * - Playwright's storageState captures cookies, localStorage, and
 *   sessionStorage — enough for most auth schemes (JWT, session cookie, etc.)
 *
 * If your app uses OAuth (Google, GitHub, etc.):
 *   npx playwright codegen --save-storage=auth.json https://your-app.example.com/login
 *   Click "Sign in with Google", complete the flow → auth.json is saved.
 */

// Example: programmatic auth state generation (for automation pipelines)
//
// import { chromium } from "playwright";
//
// async function generateAuthState(loginUrl: string, outputPath: string) {
//   const browser = await chromium.launch({ headless: false });
//   const context = await browser.newContext();
//   const page = await context.newPage();
//
//   await page.goto(loginUrl);
//   console.log("Log in manually, then close the browser…");
//
//   // Wait for navigation away from the login page as a signal
//   await page.waitForURL((url) => !url.pathname.includes("login"), {
//     timeout: 120_000,
//   });
//
//   await context.storageState({ path: outputPath });
//   console.log(`Auth state saved to ${outputPath}`);
//   await browser.close();
// }
//
// generateAuthState("https://your-app.example.com/login", "./auth.json");

export {};
