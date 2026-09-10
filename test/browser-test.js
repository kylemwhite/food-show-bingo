/* Browser smoke test — no dependencies.
   Starts a static server for the project, drives headless Chrome/Edge over the
   DevTools Protocol, and clicks through the whole game flow.

   Run:  node test/browser-test.js
*/
const { spawn } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTTP_PORT = 8791;
const CDP_PORT = 9223;
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
      const fp = path.join(ROOT, p);
      fs.readFile(fp, (e, d) => {
        if (e) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "content-type": TYPES[path.extname(fp)] || "text/plain" });
        res.end(d);
      });
    });
    srv.listen(HTTP_PORT, () => resolve(srv));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (url) => new Promise((res, rej) =>
  http.get(url, (r) => { let d = ""; r.on("data", (c) => d += c); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));

let ws, msgId = 0;
const pending = new Map();
const send = (method, params) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params: params || {} }));
});
async function evalJS(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function navigate(url) {
  await send("Page.navigate", { url: "about:blank" });
  await wait(120);
  await send("Page.navigate", { url });
  await wait(700);
}

let failures = 0;
function check(name, cond) {
  console.log((cond ? "  ok  " : "FAIL  ") + name);
  if (!cond) failures++;
}

(async () => {
  const browser = findBrowser();
  if (!browser) { console.error("No Chrome/Edge found — skipping browser test."); process.exit(0); }

  const srv = await startServer();
  const userDir = path.join(os.tmpdir(), "fsb-cdp-" + Date.now());
  const chrome = spawn(browser, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDir}`,
    "--window-size=390,844", "about:blank",
  ]);

  function done(code) { try { chrome.kill(); } catch (e) {} try { srv.close(); } catch (e) {} process.exit(code); }

  let target;
  for (let i = 0; i < 30; i++) {
    try {
      const list = await getJSON(`http://localhost:${CDP_PORT}/json/list`);
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch (e) {}
    await wait(300);
  }
  if (!target) { console.error("no chrome target"); done(1); }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      errors.push("console.error " + m.params.args.map((a) => a.value).join(" "));
  });
  await send("Page.enable");
  await send("Runtime.enable");

  // Landing
  await navigate(BASE + "/");
  await evalJS("localStorage.clear()");
  await navigate(BASE + "/");
  check("landing shows 'Make a game'", (await evalJS("document.body.innerText")).includes("Make a game"));

  // Setup
  await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Make a game').click()");
  await wait(200);
  check("setup shows win condition", (await evalJS("document.body.innerText")).includes("Win condition"));
  await evalJS("[...document.querySelectorAll('.seg button')].find(b=>b.textContent==='Corners').click()");
  await evalJS("var cbs=document.querySelectorAll('.pool-item input[type=checkbox]'); cbs[0].click(); cbs[1].click();");
  check("count reflects toggles", (await evalJS("document.querySelector('.tag').textContent")).includes("38 on"));
  await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Generate game link').click()");
  await wait(400);
  const hash = await evalJS("location.hash");
  check("hash has seed + mode + mask", /s=/.test(hash) && /m=corners/.test(hash) && /p=/.test(hash));
  check("share view renders QR", await evalJS("!!document.querySelector('.qr-wrap svg')"));
  const shareUrl = await evalJS("document.querySelector('.code-box').textContent");

  // Join
  await navigate(shareUrl);
  check("join screen for fresh device", (await evalJS("document.body.innerText")).includes("Join the game"));
  await evalJS("var n=document.querySelector('input[type=text]'); n.value='Kyle'; n.dispatchEvent(new Event('input'));");
  await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Play').click()");
  await wait(300);
  check("board renders 25 squares", (await evalJS("document.querySelectorAll('.board .sq').length")) === 25);
  check("center is FREE", (await evalJS("document.querySelectorAll('.board .sq')[12].textContent")).includes("FREE"));
  check("BINGO disabled at start", await evalJS("document.querySelector('.board-foot button').disabled"));

  // Win via corners
  await evalJS("[0,4,20,24].forEach(i=>document.querySelectorAll('.board .sq')[i].click())");
  await wait(150);
  check("BINGO enabled after corners", !(await evalJS("document.querySelector('.board-foot button').disabled")));
  await evalJS("document.querySelector('.board-foot button').click()");
  await wait(250);
  check("bingo screen shows winner", (await evalJS("document.body.innerText")).includes("Kyle — show this to everyone"));

  // Persistence
  await navigate(shareUrl);
  check("reload keeps bingo state", (await evalJS("document.body.innerText")).includes("BINGO!"));

  // Distinct cards
  await evalJS("localStorage.removeItem('fsb:profile'); Object.keys(localStorage).filter(k=>k.startsWith('fsb:joined')).forEach(k=>localStorage.removeItem(k));");
  await navigate(shareUrl);
  await evalJS("var n=document.querySelector('input[type=text]'); n.value='Sam'; n.dispatchEvent(new Event('input'));");
  await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Play').click()");
  await wait(250);
  const sam = await evalJS("[...document.querySelectorAll('.board .sq span')].map(s=>s.textContent).join('|')");
  await evalJS("localStorage.setItem('fsb:profile', JSON.stringify({name:'Kyle',emoji:'X'}))");
  await navigate(shareUrl);
  await wait(200);
  const kyle = await evalJS("[...document.querySelectorAll('.board .sq span')].map(s=>s.textContent).join('|')");
  check("different players get different cards", sam !== kyle && sam.length > 20);

  check("no JS errors during run", errors.length === 0);
  if (errors.length) console.log(errors);

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL BROWSER CHECKS PASSED");
  done(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
