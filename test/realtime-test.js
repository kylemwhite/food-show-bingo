/* Live-sync wiring test — no real Supabase.

   Injects a mock `window.supabase` that lets the test push inbound broadcast /
   presence events straight to the app's handlers and inspect what the app
   sends out. Verifies: the "N online" dot, the incoming-BINGO banner (+ dedupe
   + mode label), retract clearing it, and that calling / walking back a BINGO
   emits the right broadcast.

   Run:  node test/realtime-test.js
*/
const { spawn } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTTP_PORT = 8792;
const CDP_PORT = 9225;
const BASE = `http://localhost:${HTTP_PORT}`;

function findBrowser() {
  const c = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return c.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
}

const TYPES = { ".html": "text/html", ".js": "text/javascript",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      // Stand in for the (blank) committed realtime-config.js with mock keys.
      if (p === "/realtime-config.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end('window.FSB_CONFIG = { supabaseUrl: "http://mock.local", supabaseKey: "mock-anon-key" };');
        return;
      }
      fs.readFile(path.join(ROOT, p), (e, d) => {
        if (e) { res.writeHead(404); res.end("nf"); return; }
        res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "text/plain" });
        res.end(d);
      });
    });
    srv.listen(HTTP_PORT, () => resolve(srv));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (url) => new Promise((res, rej) =>
  http.get(url, (r) => { let d = ""; r.on("data", (c) => d += c); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej));

// Injected before every document. Mock supabase + test hooks on window.
// (FSB_CONFIG comes from the stubbed /realtime-config.js the server serves.)
const MOCK = `
(function () {
  window.supabase = {
    createClient: function () {
      return {
        channel: function (name) {
          var hs = [];
          var ch = {
            on: function (type, filter, cb) { hs.push({ type: type, event: filter && filter.event, cb: cb }); return ch; },
            subscribe: function (cb) { window.__fsbSubCb = cb; setTimeout(function () { cb && cb("SUBSCRIBED"); }, 5); return ch; },
            send: function (m) { (window.__fsbSent = window.__fsbSent || []).push(m); return Promise.resolve("ok"); },
            track: function (s) { window.__fsbTracked = s; return Promise.resolve("ok"); },
            presenceState: function () { return window.__fsbPresence || {}; },
            unsubscribe: function () { return Promise.resolve(); },
          };
          window.__fsbEmit = function (event, payload) {
            hs.filter(function (h) { return h.type === "broadcast" && h.event === event; })
              .forEach(function (h) { h.cb({ payload: payload }); });
          };
          window.__fsbPresenceSync = function (obj) {
            window.__fsbPresence = obj;
            hs.filter(function (h) { return h.type === "presence" && h.event === "sync"; })
              .forEach(function (h) { h.cb(); });
          };
          return ch;
        },
        removeChannel: function () {},
      };
    },
  };
})();
`;

let ws, msgId = 0;
const pending = new Map();
const send = (method, params) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params: params || {} }));
});
async function evalJS(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
async function navigate(url) {
  await send("Page.navigate", { url: "about:blank" }); await wait(120);
  await send("Page.navigate", { url }); await wait(700);
}
const click = (text) => evalJS(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);

let failures = 0;
const check = (name, cond) => { console.log((cond ? "  ok  " : "FAIL  ") + name); if (!cond) failures++; };

(async () => {
  const browser = findBrowser();
  if (!browser) { console.error("No Chrome/Edge found — skipping realtime test."); process.exit(0); }
  try { await getJSON(`http://localhost:${CDP_PORT}/json/version`); console.error(`Port ${CDP_PORT} busy — kill the stray Chrome.`); process.exit(1); } catch (e) {}

  const srv = await startServer();
  const chrome = spawn(browser, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(os.tmpdir(), "fsb-rt-" + Date.now())}`,
    "--window-size=390,844", "about:blank",
  ]);
  const done = (code) => { try { chrome.kill(); } catch (e) {} try { srv.close(); } catch (e) {} process.exit(code); };
  process.on("uncaughtException", (e) => { console.error(e); done(1); });
  process.on("unhandledRejection", (e) => { console.error(e); done(1); });

  let target;
  for (let i = 0; i < 40; i++) {
    try { const l = await getJSON(`http://localhost:${CDP_PORT}/json/list`); target = l.find((t) => t.type === "page"); if (target) break; } catch (e) {}
    await wait(300);
  }
  if (!target) { console.error("no target"); done(1); }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      errors.push("console.error " + m.params.args.map((a) => a.value).join(" "));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: MOCK });

  // create a game + join
  await navigate(BASE + "/");
  await evalJS("localStorage.clear()");
  await navigate(BASE + "/");
  await click("Make a game");
  await wait(150);
  await click("Generate game link");
  await wait(300);
  const shareUrl = await evalJS("document.querySelector('.code-box').textContent");
  await navigate(shareUrl);
  await evalJS("var n=document.querySelector('input'); n.value='Alice'; n.dispatchEvent(new Event('input'));");
  await click("Play");
  await wait(400);

  check("mock supabase was used (client subscribed)", await evalJS("typeof window.__fsbSubCb === 'function'"));
  check("rt dot present on board", await evalJS("!!document.getElementById('rt-dot')"));
  check("dot goes live after SUBSCRIBED", /live/.test(await evalJS("document.getElementById('rt-dot').className")));
  check("app tracked its own presence", await evalJS("window.__fsbTracked && window.__fsbTracked.name === 'Alice'"));

  // presence count
  await evalJS("window.__fsbPresenceSync({ Alice: [{}], Bob: [{}], Cara: [{}] })");
  await wait(80);
  check("dot shows 3 online", /3 online/.test(await evalJS("document.getElementById('rt-dot').textContent")));

  // inbound BINGO from another player
  await evalJS("window.__fsbEmit('bingo', { id: 'b1', name: 'Bob', emoji: '\\uD83D\\uDC15', mode: 'line' })");
  await wait(120);
  const banner1 = await evalJS("var b=document.querySelector('.rt-banner'); b?b.textContent:''");
  check("banner shows Bob's BINGO", /Bob/.test(banner1) && /BINGO/.test(banner1));
  check("banner shows the mode", /Line/.test(banner1));

  // duplicate id => no second banner
  await evalJS("window.__fsbEmit('bingo', { id: 'b1', name: 'Bob', emoji: '\\uD83D\\uDC15', mode: 'line' })");
  await wait(80);
  check("duplicate BINGO id is ignored", (await evalJS("document.querySelectorAll('.rt-banner').length")) === 1);

  // a second, different player
  await evalJS("window.__fsbEmit('bingo', { id: 'b2', name: 'Cara', emoji: '\\u2B50', mode: 'line' })");
  await wait(80);
  check("second player's BINGO stacks", (await evalJS("document.querySelectorAll('.rt-banner').length")) === 2);

  // retract Bob
  await evalJS("window.__fsbEmit('retract', { name: 'Bob' })");
  await wait(80);
  const left = await evalJS("[...document.querySelectorAll('.rt-banner')].map(b=>b.dataset.name).join(',')");
  check("retract removes only Bob's banner", left === "Cara");

  // Alice completes a line and calls BINGO -> outbound broadcast
  await evalJS("var sq=document.querySelectorAll('.board .sq'); [0,1,2,3,4].forEach(i=>{ if(!sq[i].classList.contains('marked')) sq[i].click(); });");
  await wait(120);
  await evalJS("document.querySelector('.board-foot button').click()");
  await wait(200);
  const sent = JSON.parse(await evalJS("JSON.stringify(window.__fsbSent || [])"));
  const bingoMsg = sent.find((m) => m.event === "bingo");
  check("Alice's BINGO was broadcast", !!bingoMsg && bingoMsg.payload.name === "Alice" && bingoMsg.payload.mode === "line");

  // walk it back -> retract broadcast
  await click("Back to card");
  await wait(200);
  const sent2 = JSON.parse(await evalJS("JSON.stringify(window.__fsbSent || [])"));
  check("walking back broadcasts a retract", sent2.some((m) => m.event === "retract" && m.payload.name === "Alice"));

  // leaving the game tears the channel down (no dot on landing)
  await navigate(BASE + "/");
  check("no rt dot on landing", (await evalJS("!!document.getElementById('rt-dot')")) === false);

  check("no JS errors", errors.length === 0);
  if (errors.length) console.log(errors);

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL REALTIME CHECKS PASSED");
  done(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

process.on("SIGINT", () => process.exit(130));
