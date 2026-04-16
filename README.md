# browser-agent

**An HTTP API over Playwright so Claude can write E2E tests without a vision model.**

browser-agent opens a headed Chromium browser with your auth session loaded and exposes a REST API on localhost. Claude calls the API — reading the live DOM, adding `data-testid` attributes to components, and writing Playwright specs — without ever needing to interpret pixels.

---

## What this is for

browser-agent is built for one primary use case: **letting Claude autonomously write Playwright E2E tests against a local dev server**.

The typical workflow looks like this:

1. Your full dev stack is running locally (Next.js, API, database, the works)
2. browser-agent opens a headed Chromium browser with your auth session already loaded, pointing at localhost
3. Claude uses the HTTP API to read the live DOM, identify elements that need `data-testid` attributes, edit the source components, reload the page, and verify the testids are there
4. Claude writes the Playwright spec using those stable testids and runs it

**This is not a general-purpose computer-use replacement.** It is a focused tool for the loop of: inspect live app → stabilize selectors → write test → pass.

---

## Why not computer use?

Traditional "computer use" (vision-based browser control) works like this:

```
AI → screenshot → vision model interprets pixels → guesses coordinates → clicks
```

This is slow (vision API round-trip per action), expensive (billed as image tokens), and fragile (pixel coordinates break when the viewport changes).

browser-agent works like this:

```
AI → GET /dom → reads ARIA tree → POST /click {"testid":"submit-btn"} → done
```

The ARIA accessibility tree gives Claude all the structural information it needs — every element, its role, its label — without a single vision API call. For apps with `data-testid` attributes, elements are directly addressable by name.

Use a vision model when you need to detect visual regressions or interact with canvas/maps. For everything else — clicking, filling, reading content — the DOM is strictly better.

---

## Quickstart

### 1. Install and start browser-agent

```sh
npm install
npx playwright install chromium

# Point at your local dev server
BROWSER_BASE_URL=http://localhost:3001 npm start
```

For apps that require authentication, generate a storage state first:

```sh
# Opens a browser — log in manually, then close the window
npx playwright codegen --save-storage=auth.json http://localhost:3001
```

Then start with auth loaded:

```sh
BROWSER_BASE_URL=http://localhost:3001 \
BROWSER_AUTH_STATE=./auth.json \
npm start
```

Verify it's running:

```sh
curl http://localhost:9229/health
# {"status":"ok","url":"http://localhost:3001/dashboard"}
```

### 2. Use it with Claude Code

In a Claude Code session, tell Claude the browser-agent is running:

> "browser-agent is running at localhost:9229 pointing at my local app. Use it to write a Playwright E2E test for [feature]."

Claude will:

1. `GET /dom` — read the ARIA tree to understand the current page structure
2. Identify which elements need `data-testid` attributes for stable selectors
3. Edit the source components to add testids
4. `POST /reload` — reload to verify the testids appear in the DOM
5. `POST /eval` — spot-check selectors against the live DOM
6. Write the Playwright spec targeting those testids
7. Run the spec and iterate on failures

**Claude uses the Bash tool to issue curl commands.** No special Claude integration required — the HTTP API is the integration.

### Example session

Claude calls:

```sh
# Understand the current page
curl http://localhost:9229/dom

# Output (ARIA snapshot):
# - navigation
#   - button "New conversation" [ref=e14]
# - main
#   - list "Conversations"
#     - listitem "Alice Johnson — Hey, call me back"

# Screenshot for visual context
curl http://localhost:9229/screenshot --output /tmp/snap.png

# Verify a testid after adding it to the component
curl -X POST http://localhost:9229/eval \
  -H 'Content-Type: application/json' \
  -d '{"code":"document.querySelector(\"[data-testid=new-conversation-btn]\")?.textContent"}'

# Test the interaction
curl -X POST http://localhost:9229/click \
  -H 'Content-Type: application/json' \
  -d '{"testid":"new-conversation-btn"}'

curl -X POST http://localhost:9229/fill \
  -H 'Content-Type: application/json' \
  -d '{"selector":"input#name","value":"E2E Test"}'
```

Then Claude writes the spec using those same testids.

---

## For Sendblue teams (looski setup)

If you are using [looski](https://github.com/sendblue-api/looski) — Sendblue's full local dev environment — the complete workflow is:

```sh
# 1. Start the full dev stack (raz-v2 on :3001, grayrunner on :2999, etc.)
DAEMONIZE=true ./dev-stack.sh

# 2. Start browser-agent pointing at raz-v2, with the E2E auth state
cd /path/to/browser-agent
BROWSER_BASE_URL=http://localhost:3001 \
BROWSER_START_PATH=/conversations \
BROWSER_AUTH_STATE=/path/to/sendblue/tests/e2e/.auth/user.json \
npm start

# 3. Open a Claude Code session
# Tell Claude: "Use browser-agent at localhost:9229 to write an E2E test for [feature]."
```

Claude will use the existing auth session (from Playwright's `sign-in.spec.ts` auth-setup project) and have access to the fully running app — Firebase, Supabase, grayrunner — exactly as it runs in production.

The E2E tests land in `.repos/sendblue/tests/e2e/raz-v2-ui/`. See the `razv2-e2e-author` Claude Code skill for the full authoring guide including known traps around the ControlPanel component fork, react-phone-input-2, and Firebase vs Supabase source-of-truth.

---

## API reference

### GET endpoints

| Endpoint | Response | Description |
|---|---|---|
| `/health` | `{"status":"ok","url":"..."}` | Liveness check |
| `/url` | `{"url":"..."}` | Current page URL |
| `/screenshot` | PNG bytes | Viewport screenshot; path in `X-Path` header |
| `/dom` | Plain text | ARIA accessibility snapshot of the page body |
| `/html` | HTML | Full page HTML |

### POST endpoints

All POST endpoints accept a JSON body.

| Endpoint | Body | Description |
|---|---|---|
| `/goto` | `{"url":"/path"}` | Navigate to a path or absolute URL |
| `/reload` | _(none)_ | Reload the current page |
| `/click` | `{"testid":"..."}` or `{"text":"..."}` or `{"selector":"..."}` | Click an element |
| `/fill` | `{"testid"\|"selector":"...", "value":"..."}` | Clear and fill an input |
| `/type` | `{"testid"\|"selector":"...", "value":"..."}` | Select-all and type (for custom inputs that ignore `fill`, e.g. react-phone-input-2) |
| `/press` | `{"testid"\|"selector":"...", "key":"Enter"}` | Press a keyboard key on an element |
| `/wait` | `{"testid"\|"selector":"...", "state":"visible"\|"hidden", "timeout":10000}` | Wait for element state |
| `/eval` | `{"code":"document.title"}` | Evaluate JavaScript in the page context |

### Element addressing

Three ways to address an element (prefer in this order):

- `testid` — `data-testid` attribute. Add one to the component if it doesn't exist — it takes 30 seconds and pays for itself on every test run.
- `text` — visible text content (partial match, first match)
- `selector` — CSS or Playwright selector string

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `BROWSER_PORT` | `9229` | HTTP server port |
| `BROWSER_BASE_URL` | `http://localhost:3000` | Target application base URL |
| `BROWSER_START_PATH` | `/` | Path to navigate to on startup |
| `BROWSER_AUTH_STATE` | _(none)_ | Path to Playwright storage state JSON |
| `BROWSER_HEADLESS` | `false` | Set `true` for CI |
| `BROWSER_SLOW_MO` | `30` | Slow Playwright actions by N ms |
| `BROWSER_VIEWPORT_W` | `1440` | Viewport width |
| `BROWSER_VIEWPORT_H` | `900` | Viewport height |
| `BROWSER_SCREENSHOT_DIR` | `<tmpdir>/browser-agent-screenshots` | Where screenshots are saved |

Copy `.env.example` to `.env` and edit as needed.

---

## License

MIT — see [LICENSE](LICENSE).
