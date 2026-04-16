# browser-agent — AI-driven browser control without computer vision

**Give your AI an HTTP API to control a real browser. No vision model. No pixel-scraping. Just Playwright behind a REST API.**

browser-agent launches a Chromium instance and exposes a thin HTTP server. Your AI agent (Claude, GPT-4, etc.) calls REST endpoints to navigate, click, fill forms, read the DOM, and take screenshots. The AI reasons about page structure using the ARIA accessibility tree — not pixels — which is faster, cheaper, and more reliable than computer use / vision models.

---

## The concept

Traditional "computer use" works like this:

```
AI → takes screenshot → vision model interprets pixels → guesses coordinates → clicks
```

This is expensive (vision API calls), fragile (pixel coordinates break on resize), and slow.

browser-agent works like this:

```
AI → GET /dom  → reads ARIA tree → POST /click {"testid":"submit"} → done
```

The ARIA accessibility tree gives the AI all the structural information it needs: every interactive element, its role, its label, and how to address it. For applications with `data-testid` attributes, elements are directly addressable by name. No vision model needed.

---

## Quick start

```sh
# 1. Install dependencies
npm install

# 2. Install Chromium (one-time)
npx playwright install chromium

# 3. Start the server
npm start
```

The browser opens, navigates to `BROWSER_BASE_URL` (default: `http://localhost:3000`), and the HTTP server starts on port 9229.

```sh
# Verify it's running
curl http://localhost:9229/health
# {"status":"ok","url":"http://localhost:3000/"}
```

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and edit as needed.

| Variable | Default | Description |
|---|---|---|
| `BROWSER_PORT` | `9229` | HTTP server port |
| `BROWSER_BASE_URL` | `http://localhost:3000` | Target application base URL |
| `BROWSER_START_PATH` | `/` | Path to navigate to on startup |
| `BROWSER_AUTH_STATE` | _(none)_ | Path to Playwright storage state JSON (for authenticated sessions) |
| `BROWSER_HEADLESS` | `false` | Run headless (set `true` for CI) |
| `BROWSER_SLOW_MO` | `30` | Slow Playwright ops by N ms (useful for debugging) |
| `BROWSER_VIEWPORT_W` | `1440` | Viewport width in pixels |
| `BROWSER_VIEWPORT_H` | `900` | Viewport height in pixels |
| `BROWSER_SCREENSHOT_DIR` | `<tmpdir>/browser-agent-screenshots` | Directory for saved screenshots |

Example:

```sh
BROWSER_BASE_URL=https://my-app.example.com \
BROWSER_AUTH_STATE=./auth.json \
BROWSER_HEADLESS=true \
npm start
```

---

## API reference

### GET endpoints

| Method | Endpoint | Response | Description |
|---|---|---|---|
| GET | `/health` | `{"status":"ok","url":"..."}` | Liveness check — always 200 |
| GET | `/url` | `{"url":"..."}` | Current page URL |
| GET | `/screenshot` | PNG bytes | Screenshot of current viewport; saved to `BROWSER_SCREENSHOT_DIR`; file path in `X-Path` response header |
| GET | `/dom` | Plain text | ARIA accessibility snapshot of the page body |
| GET | `/html` | HTML | Full page HTML |

### POST endpoints

All POST endpoints accept a JSON body.

| Method | Endpoint | Body | Response | Description |
|---|---|---|---|---|
| POST | `/goto` | `{"url": "/path"}` | `{"url":"..."}` | Navigate to a path or absolute URL |
| POST | `/reload` | _(none)_ | `{"url":"..."}` | Reload the current page |
| POST | `/click` | `{"testid":"..."}` or `{"text":"..."}` or `{"selector":"..."}` | `{"clicked":true}` | Click an element |
| POST | `/fill` | `{"testid"\|"selector":"...", "value":"..."}` | `{"filled":true}` | Clear and fill an input |
| POST | `/type` | `{"testid"\|"selector":"...", "value":"..."}` | `{"typed":true}` | Select-all and type (for custom inputs that ignore `fill`) |
| POST | `/press` | `{"testid"\|"selector":"...", "key":"Enter"}` | `{"pressed":"Enter"}` | Press a keyboard key on an element |
| POST | `/wait` | `{"testid"\|"selector":"...", "state":"visible"\|"hidden"\|"attached"\|"detached", "timeout":10000}` | `{"state":"...","done":true}` | Wait for element to reach a given state |
| POST | `/eval` | `{"code":"document.title"}` | `{"result":"..."}` | Evaluate JavaScript in the page context |

### Element addressing

Three ways to address an element (in priority order):

- `testid` — matches `data-testid` attribute (most stable)
- `text` — matches by visible text content (partial match)
- `selector` — CSS selector or Playwright selector string

---

## Authenticated sessions

For apps that require login, generate a Playwright storage state file:

```sh
npx playwright codegen --save-storage=auth.json https://your-app.example.com
```

A browser window opens. Log in manually. Close the window — `auth.json` is saved with your session cookies and localStorage.

Then start browser-agent with:

```sh
BROWSER_AUTH_STATE=./auth.json npm start
```

The browser opens already authenticated.

**Important:** `auth.json` contains live session tokens. Add it to `.gitignore` and never commit it.

Sessions expire when the server-side session does. Regenerate `auth.json` when you start getting 401s or redirects to the login page.

See `examples/with-auth.ts` for a programmatic auth state generation pattern.

---

## How Claude uses this

Here is an example multi-turn interaction where Claude uses browser-agent to fill out a form:

**Turn 1 — Claude takes a screenshot and reads the DOM:**

```
Tool call: GET /screenshot
Tool call: GET /dom
```

DOM response (excerpt):
```
- main
  - form
    - textbox "Email address" [required]
    - textbox "Message" [required]
    - button "Send message"
```

**Turn 2 — Claude fills the form:**

```
Tool call: POST /fill {"selector": "input[type=email]", "value": "hello@example.com"}
Tool call: POST /fill {"selector": "textarea", "value": "This is my message."}
```

**Turn 3 — Claude submits:**

```
Tool call: POST /click {"text": "Send message"}
```

**Turn 4 — Claude confirms success:**

```
Tool call: GET /dom
```

Response includes: `- alert "Message sent! We'll be in touch."`

Claude reports back: "Done — the form was submitted successfully."

No vision model was used at any point. Claude made decisions based on the ARIA tree structure.

---

## Why not computer use?

Computer use (vision-based browser control) is the right tool when you need to:

- Detect visual regressions (does the page _look_ right?)
- Interact with canvas elements, custom graphics, or maps
- Verify CSS layout, colors, or responsive design

For everything else — clicking buttons, filling forms, reading page content, navigating — the DOM is strictly better:

| | Computer use (vision) | browser-agent (DOM) |
|---|---|---|
| Cost | High (vision API per screenshot) | Low (no vision model) |
| Speed | Slow (round-trip per action) | Fast |
| Stability | Fragile (pixel coords break on resize) | Stable (semantic selectors) |
| Debuggability | Hard (what did the model see?) | Easy (read the ARIA tree) |
| Works headless | Sometimes | Yes |
| Works with `data-testid` | No advantage | Direct address |

The ARIA accessibility tree — the same tree used by screen readers — gives AI agents everything needed to understand and interact with a web page structurally. `data-testid` attributes make elements directly and unambiguously addressable.

---

## Integration with Claude via MCP

To expose browser-agent as an MCP tool server (so Claude can call it natively without curl), wrap each endpoint in an MCP tool definition. The HTTP API is designed to map 1:1 to MCP tool signatures.

A full MCP adapter is on the roadmap. In the meantime, Claude can use the Bash tool to issue curl commands against the HTTP API.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributing

Pull requests welcome. Please keep the core server dependency-free (only Node built-ins + `playwright`). Feature additions should add env var configuration rather than hardcoded behavior.
