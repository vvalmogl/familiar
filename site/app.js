// Landing page: language switch, download button for the visitor's OS, install tabs, live demo.
const REPO = "vvalmogl/familiar";

// ───────── language ─────────
// Russian lives in the HTML; English overrides by data-i18n key. Both are our own static strings,
// so setting them as HTML is safe (nothing user-provided ever reaches innerHTML here).
const EN = {
  "nav.features": "Features", "nav.install": "Install", "nav.faq": "FAQ",
  "hero.title": "AI at one keystroke. And a friend by your side.",
  "hero.lead": "Press <kbd>⌥</kbd> <kbd>Space</kbd> and a Spotlight-like bar appears. Ask Claude, ChatGPT or Gemini and the answer types out right over your windows. Next to it lives an animated character: it thinks while the AI thinks and cheers when the answer is ready.",
  "dl.generic": "Download for free", "dl.other": "Other platforms",
  "dl.note": "macOS · Windows · Linux. Free and open source.",
  "f.title": "What it does",
  "f1.t": "Any AI you already use", "f1.d": "Claude, ChatGPT (Codex), Gemini, OpenRouter or a local Ollama. It runs on your own account: we don't resell requests or add limits.",
  "f2.t": "Characters and GIFs", "f2.d": "Built-in characters, a pack gallery and your own GIFs: drop files in and the wizard turns them into a character with moods.",
  "f3.t": "Stays out of the way", "f3.d": "The bar appears over any window and hides on Esc. Formatted answers with code, conversation history, ⌘N for a new chat.",
  "f4.t": "Themes and hotkeys", "f4.d": "Nine themes, your own shortcut, character size, teleports around the screen — or a calm mode.",
  "f5.t": "Private", "f5.d": "Questions go from your computer straight to the AI. Keys stay in the system keychain. An account is optional.",
  "f6.t": "Three platforms, open source", "f6.d": "macOS, Windows and Linux. Apache-2.0 source code, updates install themselves.",
  "i.title": "Install",
  "i.mac.btn": "Download for macOS (.dmg)",
  "i.mac.1": "Open the downloaded <b>.dmg</b> and drag Familiar into Applications.",
  "i.mac.2": "Launch Familiar. macOS says it “cannot verify the developer” — click <b>Done</b>.",
  "i.mac.3": "Open <b>System Settings → Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b> next to Familiar.",
  "i.mac.4": "Launch it again and confirm. You only do this once.",
  "i.mac.why": "Why: Familiar doesn't have a paid Apple signature yet. The code is open and updates are signed with our key.",
  "i.win.btn": "Download for Windows (.exe)",
  "i.win.1": "Run the downloaded installer.",
  "i.win.2": "If Windows says “Windows protected your PC”, click <b>More info → Run anyway</b>.",
  "i.win.3": "After installing, press <kbd>Alt</kbd> + <kbd>Space</kbd>.",
  "i.linux.btn": "Download for Linux (.AppImage)",
  "i.linux.1": "Make the file executable: Properties → Permissions → “Allow executing as program”. Or grab the <b>.deb</b> for Ubuntu/Debian from the release page.",
  "i.linux.2": "GNOME on Wayland doesn't give apps global shortcuts: bind the command <code>familiar --toggle</code> to keys in system settings.",
  "i.all": "All versions and files",
  "q.title": "FAQ",
  "q1.q": "Is it free?", "q1.a": "Yes. The app is free and open source. AI requests go through your own account or key, on that service's terms. Later the gallery will have paid character packs from artists; everything else stays free.",
  "q2.q": "Which AIs are supported?", "q2.a": "Claude (via Claude Code), ChatGPT (via Codex), Gemini (via Gemini CLI), any OpenAI-compatible API — OpenRouter, DeepSeek, Qwen — and a local Ollama. Familiar helps you install and sign in.",
  "q3.q": "Can you see my questions?", "q3.a": "No. Questions and answers go directly between your computer and the AI you chose. Our server only gets your email and settings, and only if you create an account. See the <a href=\"privacy.html\">privacy policy</a>.",
  "q4.q": "Can I make my own character?", "q4.a": "Yes: drop GIFs or images in settings, sort them by mood (idle, thinking, talking, happy) and you're done. Packs made by others install from a single .fampack file or from the gallery.",
  "q5.q": "Why does macOS warn me on first launch?", "q5.a": "An Apple signature costs $99 a year and the project doesn't have one yet. The app is safe: the source is open and builds run automatically on GitHub. See “Install”.",
  "foot.privacy": "Privacy",
};
const RU = {};
document.querySelectorAll("[data-i18n]").forEach((el) => (RU[el.dataset.i18n] = el.innerHTML));

let lang = "ru";
try {
  lang = localStorage.getItem("lang") || (navigator.language.startsWith("ru") ? "ru" : "en");
} catch {
  lang = navigator.language.startsWith("ru") ? "ru" : "en";
}
function applyLang() {
  const dict = lang === "en" ? EN : RU;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = dict[el.dataset.i18n];
    if (v) el.innerHTML = v;
  });
  document.getElementById("lang").textContent = lang === "en" ? "RU" : "EN";
  updateDownload();
}
document.getElementById("lang").addEventListener("click", () => {
  lang = lang === "en" ? "ru" : "en";
  try { localStorage.setItem("lang", lang); } catch {}
  applyLang();
  restartDemo();
});

// ───────── downloads ─────────
const ua = navigator.userAgent;
const os = /Mac/.test(ua) ? "mac" : /Win/.test(ua) ? "win" : /Linux|X11/.test(ua) ? "linux" : null;
const PICK = {
  mac: (n) => /\.dmg$/i.test(n),
  win: (n) => /setup\.exe$/i.test(n) || /\.exe$/i.test(n),
  linux: (n) => /\.AppImage$/i.test(n),
};
const LABEL = {
  ru: { mac: "Скачать для macOS", win: "Скачать для Windows", linux: "Скачать для Linux" },
  en: { mac: "Download for macOS", win: "Download for Windows", linux: "Download for Linux" },
};
let assets = [];
let version = "";

function updateDownload() {
  const link = (kind) => assets.find((a) => PICK[kind](a.name))?.browser_download_url;
  if (os) {
    document.getElementById("download-label").textContent = LABEL[lang][os] + (version ? ` · ${version}` : "");
    const url = link(os);
    if (url) document.getElementById("download").href = url;
  }
  document.querySelectorAll("[data-asset]").forEach((a) => {
    const url = link(a.dataset.asset);
    if (url) a.href = url;
  });
}

// Direct file links from the latest published release; without it the buttons open the releases page.
fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then((r) => (r.ok ? r.json() : null))
  .then((rel) => {
    if (!rel) return;
    assets = rel.assets || [];
    version = rel.tag_name || "";
    updateDownload();
  })
  .catch(() => {});

// ───────── install tabs ─────────
function showOs(id) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.os === id));
  document.querySelectorAll(".os").forEach((p) => (p.hidden = p.dataset.os !== id));
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showOs(b.dataset.os)));
if (os) showOs(os);

// ───────── demo ─────────
const FRAMES = { idle: [16, 110], thinking: [12, 130], talking: [8, 95], happy: [16, 55] };
// Preload every frame so the animation never flickers.
for (const [m, [n]] of Object.entries(FRAMES)) for (let i = 0; i < n; i++) new Image().src = frame(m, i);
function frame(mood, i) {
  return `assets/droplet/${mood}-${String(i).padStart(2, "0")}.png`;
}

const img = document.getElementById("droplet");
let mood = "idle";
let fi = 0;
function setMood(m) {
  mood = m;
  fi = 0;
}
(function animate() {
  const [n, ms] = FRAMES[mood];
  img.src = frame(mood, fi);
  fi++;
  if (fi >= n) fi = mood === "happy" ? n - 1 : 0;
  setTimeout(animate, ms);
})();

const SCRIPT = {
  ru: [
    ["Как сказать «спасибо» по-японски?", "**Arigatō** (ありがとう). Вежливее — *arigatō gozaimasu*, а совсем по-дружески — просто *dōmo*."],
    ["Переведи 72 °F в цельсии", "72 °F ≈ **22,2 °C**. Формула: (F − 32) × 5⁄9."],
    ["Придумай название для кота-программиста", "Как насчёт **Котлин**? Или **Мурсор** — курсор, который всегда возвращается к миске 🐾"],
  ],
  en: [
    ["How do you say “thank you” in Japanese?", "**Arigatō** (ありがとう). More polite: *arigatō gozaimasu*; casual: just *dōmo*."],
    ["Convert 72 °F to Celsius", "72 °F ≈ **22.2 °C**. Formula: (F − 32) × 5⁄9."],
    ["Name for a programmer cat?", "How about **Kitlin**? Or **Purrsor** — a cursor that always returns to the food bowl 🐾"],
  ],
};
const input = document.getElementById("demo-input");
const answer = document.getElementById("demo-answer");
let run = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");

async function demo(id) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (let k = 0; ; k = (k + 1) % SCRIPT[lang].length) {
    const [q, a] = SCRIPT[lang][k];
    input.dataset.placeholder = lang === "en" ? "Ask anything…" : "Спроси что угодно…";
    input.textContent = "";
    answer.classList.remove("on");
    answer.innerHTML = "";
    setMood("idle");
    await wait(1200);
    for (const ch of q) {
      if (id !== run) return;
      input.textContent += ch;
      await wait(reduce ? 0 : 45 + Math.random() * 50);
    }
    await wait(350);
    setMood("thinking");
    await wait(1400);
    if (id !== run) return;
    setMood("talking");
    answer.classList.add("on");
    const words = a.split(" ");
    for (let i = 1; i <= words.length; i++) {
      if (id !== run) return;
      answer.innerHTML = md(words.slice(0, i).join(" "));
      await wait(reduce ? 0 : 70);
    }
    setMood("happy");
    await wait(2800);
    if (id !== run) return;
  }
}
function restartDemo() {
  run++;
  demo(run);
}

applyLang();
restartDemo();
