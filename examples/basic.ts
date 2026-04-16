/**
 * basic.ts — minimal example, no authentication
 *
 * Points the browser at a public URL and demonstrates the HTTP API.
 *
 * Run:
 *   BROWSER_BASE_URL=https://example.com npm start
 *
 * Then, in another terminal, run these curl commands to drive the browser:
 */

// 1. Check the browser is alive
//    curl http://localhost:9229/health

// 2. Take a screenshot and save it
//    curl http://localhost:9229/screenshot --output /tmp/snap.png

// 3. Get the ARIA accessibility tree (what an AI agent sees)
//    curl http://localhost:9229/dom

// 4. Navigate to a different page
//    curl -X POST http://localhost:9229/goto \
//      -H 'Content-Type: application/json' \
//      -d '{"url":"/about"}'

// 5. Click a link by its visible text
//    curl -X POST http://localhost:9229/click \
//      -H 'Content-Type: application/json' \
//      -d '{"text":"Learn more"}'

// 6. Fill in a search box
//    curl -X POST http://localhost:9229/fill \
//      -H 'Content-Type: application/json' \
//      -d '{"selector":"input[type=search]", "value":"playwright"}'

// 7. Press Enter to submit
//    curl -X POST http://localhost:9229/press \
//      -H 'Content-Type: application/json' \
//      -d '{"selector":"input[type=search]", "key":"Enter"}'

// 8. Evaluate arbitrary JS in the page
//    curl -X POST http://localhost:9229/eval \
//      -H 'Content-Type: application/json' \
//      -d '{"code":"document.title"}'

// This file is intentionally a comment-only reference. To run programmatically,
// use the HTTP API from your AI agent's tool calls or any HTTP client.
export {};
