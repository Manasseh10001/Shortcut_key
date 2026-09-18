// ShortcutSheet — vanilla JS app. No build step, no framework, no dependencies.
// Runs directly when served over http(s) (GitHub Pages, or `npx serve` locally).

import { CATEGORY_META, APPS as BASE_APPS } from "/data/apps.js";
import { CUSTOM_APPS } from "/data/custom-apps.js";

/* ============================================================
   MERGE base data with the user's custom-apps.js additions
   ============================================================ */

function buildApps() {
  const byId = new Map();
  BASE_APPS.forEach((app) => byId.set(app.id, { ...app, shortcuts: [...app.shortcuts] }));

  let nextId = 100000; // custom shortcuts get ids starting here so they never collide with base data
  CUSTOM_APPS.forEach((entry) => {
    const normalized = (entry.shortcuts || []).map((s) => ({
      id: `c${nextId++}`,
      name: s.name,
      description: s.description || "",
      cat: s.cat || "General",
      mac: s.mac || null,
      win: s.win || null,
      popular: !!s.popular,
    }));
    if (byId.has(entry.id)) {
      byId.get(entry.id).shortcuts.push(...normalized);
    } else {
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name || entry.id,
        category: entry.category || "productivity",
        mono: entry.mono || (entry.name || entry.id).slice(0, 2).toUpperCase(),
        tint: entry.tint || "#2451FF",
        description: entry.description || "",
        platforms: entry.platforms || ["mac", "win"],
        shortcuts: normalized,
      });
    }
  });
  return Array.from(byId.values());
}

const APPS = buildApps();
const ALL_SHORTCUTS = APPS.flatMap((app) =>
  app.shortcuts.map((s) => ({ ...s, appId: app.id, appName: app.name, appTint: app.tint }))
);
const POPULAR_SHORTCUTS = ALL_SHORTCUTS.filter((s) => s.popular);
const appById = (id) => APPS.find((a) => a.id === id);
const HOME_POPULAR_IDS = ["chrome", "vscode", "photoshop", "figma", "excel", "word", "notion", "slack"];

/* ============================================================
   PERSISTENCE — plain localStorage, works anywhere including GitHub Pages
   ============================================================ */

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best effort — private browsing etc. */
  }
}

const state = {
  platform: lsGet("ks-platform", "mac"),
  theme: lsGet("ks-theme", window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  favorites: new Set(lsGet("ks-favorites", [])),
  learn: lsGet("ks-learn", { score: 0, streak: 0, answered: 0 }),
  navOpen: false,
  paletteOpen: false,
  dirQuery: "", dirCategory: "all", dirPlatform: "all", dirSort: "popular",
  appQuery: "", appCategory: "all", appCompare: false,
  learnQuestion: null, learnPicked: null,
  adminAuth: null,
};

/* ============================================================
   SMALL HELPERS
   ============================================================ */

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function comboText(keys) {
  return (keys || []).join(" + ");
}
function comboHtml(keys, size) {
  if (!keys) return `<span class="combo-na">—</span>`;
  const caps = keys.map((k) => `<span class="keycap">${esc(k)}</span>`).join(`<span class="combo-plus">+</span>`);
  return `<span class="combo combo-${size || "md"}">${caps}</span>`;
}
function dayIndex(mod) {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000) % mod;
}
function matchShortcut(s, appName, query) {
  const q = query.toLowerCase();
  return (
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.cat.toLowerCase().includes(q) ||
    appName.toLowerCase().includes(q) ||
    comboText(s.mac).toLowerCase().includes(q) ||
    comboText(s.win).toLowerCase().includes(q)
  );
}
function monoBadge(app, size) {
  const px = size || 34;
  return `<span class="mono-badge" style="background:${app.tint};width:${px}px;height:${px}px;font-size:${Math.round(px * 0.38)}px">${esc(app.mono)}</span>`;
}

/* ============================================================
   ROUTING
   ============================================================ */

function parseHash() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(location.search);
  const app = path.match(/^\/shortcuts\/([^/]+)$/);
  if (app) return { route: "app", appId: decodeURIComponent(app[1]), shortcutId: params.get("s") };
  if (path === "/apps") return { route: "directory", category: params.get("cat") || "all" };
  if (path === "/favorites") return { route: "favorites" };
  if (path === "/learn") return { route: "learn" };
  if (["/about", "/contact", "/privacy", "/terms", "/admin"].includes(path)) return { route: path.slice(1) };
  if (path === "/404") return { route: "not-found" };
  return { route: "home" };
}

window.addEventListener("popstate", render);
window.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  render();
});

/* ============================================================
   ACTIONS — exposed on window so inline HTML handlers can call them
   ============================================================ */

const KS = {
  nav(target) {
    state.navOpen = false;
    // Accept old hash-route callers while sending users to crawlable URLs.
    const url = target.replace(/^#\/?apps\/([^?]+)(.*)$/, "/shortcuts/$1$2")
      .replace(/^#\/?apps(.*)$/, "/apps$1")
      .replace(/^#\/?/, "/");
    if (`${location.pathname}${location.search}` === url) render();
    else {
      // Keep navigation working even when a simple local development server
      // does not yet know how to serve pretty URLs. Production pages are
      // still pre-rendered under dist/ for direct visits and crawlers.
      history.pushState({}, "", url);
      window.scrollTo({ top: 0, behavior: "auto" });
      render();
    }
  },
  setPlatform(p) {
    state.platform = p;
    lsSet("ks-platform", p);
    render();
  },
  setTheme(t) {
    state.theme = t;
    lsSet("ks-theme", t);
    applyTheme();
    render();
  },
  toggleNav() {
    state.navOpen = !state.navOpen;
    render();
  },
  toggleFavorite(appId, shortcutId) {
    const key = `${appId}:${shortcutId}`;
    if (state.favorites.has(key)) state.favorites.delete(key);
    else state.favorites.add(key);
    lsSet("ks-favorites", Array.from(state.favorites));
    render();
  },
  async copyCombo(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const icon = btn.querySelector(".copy-icon");
      if (icon) {
        icon.textContent = "✓";
        icon.classList.add("ok");
        setTimeout(() => {
          icon.textContent = "⧉";
          icon.classList.remove("ok");
        }, 1100);
      }
    } catch {
      /* clipboard unavailable — fail silently */
    }
  },
  openPalette() {
    state.paletteOpen = true;
    render();
    setTimeout(() => document.getElementById("palette-input")?.focus(), 20);
  },
  closePalette() {
    state.paletteOpen = false;
    render();
  },
  async submitFeedback(form) {
    const status = document.getElementById("feedback-status");
    const submit = form.querySelector("button[type=submit]");
    const payload = Object.fromEntries(new FormData(form));
    if (status) status.textContent = "Sending your feedback…";
    if (submit) submit.disabled = true;
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not send your feedback.");
      form.reset();
      if (status) status.textContent = "Thank you — your feedback has been received.";
    } catch (error) {
      if (status) status.textContent = error.message || "We could not send your feedback. Please try again later.";
    } finally { if (submit) submit.disabled = false; }
  },
  async adminLogin(form) {
    const status = document.getElementById("admin-status");
    const password = new FormData(form).get("password");
    state.adminAuth = `Basic ${btoa(`admin:${password}`)}`;
    if (status) status.textContent = "Checking access…";
    await loadAdminFeedback();
  },
  paletteSearch(value) {
    const box = document.getElementById("palette-results");
    if (box) box.innerHTML = paletteResultsHtml(value);
  },
  dirSearch(value) {
    state.dirQuery = value;
    const grid = document.getElementById("dir-grid");
    if (grid) grid.innerHTML = directoryGridHtml();
  },
  dirSetCategory(cat) {
    state.dirCategory = cat;
    const url = cat === "all" ? "/apps" : `/apps?cat=${encodeURIComponent(cat)}`;
    if (`${location.pathname}${location.search}` === url) render();
    else {
      history.pushState({}, "", url);
      render();
    }
  },
  dirSetPlatform(p) {
    state.dirPlatform = p;
    const grid = document.getElementById("dir-grid");
    if (grid) grid.innerHTML = directoryGridHtml();
  },
  dirSetSort(s) {
    state.dirSort = s;
    const grid = document.getElementById("dir-grid");
    if (grid) grid.innerHTML = directoryGridHtml();
  },
  appSearch(value) {
    state.appQuery = value;
    const list = document.getElementById("app-list");
    if (list) list.innerHTML = appListHtml(appById(parseHash().appId));
  },
  appSetCategory(cat) {
    state.appCategory = cat;
    const list = document.getElementById("app-list");
    if (list) list.innerHTML = appListHtml(appById(parseHash().appId));
    document.querySelectorAll(".chip-row [data-cat]").forEach((el) => {
      el.classList.toggle("active", el.dataset.cat === cat);
    });
  },
  appToggleCompare() {
    state.appCompare = !state.appCompare;
    const list = document.getElementById("app-list");
    if (list) list.innerHTML = appListHtml(appById(parseHash().appId));
    document.getElementById("compare-btn")?.classList.toggle("active", state.appCompare);
  },
  learnBuildQuestion() {
    const hasPlatform = (s) => !!(state.platform === "mac" ? s.mac : s.win);
    const platformPool = ALL_SHORTCUTS.filter(hasPlatform);
    const popularPlatformPool = POPULAR_SHORTCUTS.filter(hasPlatform);
    const pool = popularPlatformPool.length >= 8 ? popularPlatformPool : platformPool;
    if (!pool.length) {
      state.learnQuestion = null;
      state.learnPicked = null;
      const card = document.getElementById("quiz-card");
      if (card) card.innerHTML = `<div class="empty">No shortcuts are available for this platform yet.</div>`;
      return;
    }
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const distractorPool = platformPool.filter((s) => s.id !== correct.id);
    const shuffled = [...distractorPool].sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correct, ...shuffled].sort(() => Math.random() - 0.5);
    state.learnQuestion = { correct, options };
    state.learnPicked = null;
    const card = document.getElementById("quiz-card");
    if (card) card.innerHTML = quizCardHtml();
  },
  learnPick(id) {
    if (state.learnPicked) return;
    const opt = state.learnQuestion.options.find((o) => o.id === id);
    state.learnPicked = opt;
    const correct = opt.id === state.learnQuestion.correct.id;
    state.learn = {
      score: state.learn.score + (correct ? 1 : 0),
      streak: correct ? state.learn.streak + 1 : 0,
      answered: state.learn.answered + 1,
    };
    lsSet("ks-learn", state.learn);
    render();
  },
};
window.KS = KS;

// Allow internal links in the static footer and pre-rendered documents to
// work in a basic local server as well as on the production static host.
// External links, new-tab clicks, downloads, and modified clicks keep their
// normal browser behavior.
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[href]");
  if (!link || link.target || link.hasAttribute("download")) return;
  const destination = new URL(link.href, location.href);
  if (destination.origin !== location.origin || !destination.pathname.startsWith("/")) return;
  event.preventDefault();
  KS.nav(`${destination.pathname}${destination.search}${destination.hash}`);
});

function applyTheme() {
  document.body.classList.toggle("dark", state.theme === "dark");
}

/* ============================================================
   PALETTE (command search)
   ============================================================ */

function paletteResultsHtml(query) {
  const q = (query || "").trim();
  if (!q) return `<div class="palette-hint">Try "Photoshop", "copy", or "save"</div>`;
  const ql = q.toLowerCase();
  const apps = APPS.filter((a) => a.name.toLowerCase().includes(ql)).slice(0, 5);
  const shortcuts = ALL_SHORTCUTS.filter((s) => matchShortcut(s, s.appName, ql)).slice(0, 8);
  if (!apps.length && !shortcuts.length) return `<div class="palette-hint">No matches for "${esc(q)}"</div>`;
  let html = "";
  if (apps.length) {
    html += `<div class="palette-group"><div class="palette-group-label">Applications</div>`;
    html += apps.map((a) => `
      <button class="palette-row" onclick="KS.closePalette();KS.nav('/shortcuts/${a.id}')">
        ${monoBadge(a, 26)}<span>${esc(a.name)}</span>
      </button>`).join("");
    html += `</div>`;
  }
  if (shortcuts.length) {
    html += `<div class="palette-group"><div class="palette-group-label">Shortcuts</div>`;
    html += shortcuts.map((s) => {
      const combo = state.platform === "mac" ? s.mac : s.win;
      return `<button class="palette-row" onclick="KS.closePalette();KS.nav('/shortcuts/${s.appId}?s=${s.id}')">
        <span class="palette-row-text">${esc(s.appName)} — ${esc(s.name)}</span>${comboHtml(combo, "sm")}
      </button>`;
    }).join("");
    html += `</div>`;
  }
  return html;
}

function paletteHtml() {
  if (!state.paletteOpen) return "";
  return `
    <div class="palette-overlay" onclick="KS.closePalette()">
      <div class="palette" onclick="event.stopPropagation()">
        <div class="palette-input-row">
          <span class="palette-icon">🔍</span>
          <input id="palette-input" placeholder="Search apps or shortcuts…"
            oninput="KS.paletteSearch(this.value)"
            onkeydown="if(event.key==='Escape')KS.closePalette()" />
          <button class="palette-close" onclick="KS.closePalette()">✕</button>
        </div>
        <div class="palette-body" id="palette-results">${paletteResultsHtml("")}</div>
      </div>
    </div>`;
}

/* ============================================================
   SHARED PIECES
   ============================================================ */

function platformToggleHtml(compact) {
  return `
    <div class="platform-toggle ${compact ? "compact" : ""}">
      <button class="${state.platform === "mac" ? "active" : ""}" onclick="KS.setPlatform('mac')">macOS</button>
      <button class="${state.platform === "win" ? "active" : ""}" onclick="KS.setPlatform('win')">Windows</button>
    </div>`;
}

function appCardHtml(app) {
  const mac = app.platforms.includes("mac") ? `<span class="plat-dot">Mac</span>` : "";
  const win = app.platforms.includes("win") ? `<span class="plat-dot">Win</span>` : "";
  return `
    <button class="app-card" onclick="KS.nav('/shortcuts/${app.id}')">
      <div class="app-card-top">${monoBadge(app)}<div class="app-card-platforms">${mac}${win}</div></div>
      <div class="app-card-name">${esc(app.name)}</div>
      <div class="app-card-meta">${esc(CATEGORY_META[app.category]?.label || app.category)} · ${app.shortcuts.length} shortcuts</div>
      <span class="app-card-cta">View shortcuts →</span>
    </button>`;
}

function shortcutRowHtml(s, showApp) {
  const combo = state.platform === "mac" ? s.mac : s.win;
  const available = !!combo;
  const key = `${s.appId}:${s.id}`;
  const isFav = state.favorites.has(key);
  return `
    <div class="s-row" id="s-${s.id}">
      <div class="s-row-main">
        <div class="s-row-top">
          <span class="s-name">${esc(s.name)}</span>
          <span class="s-cat-tag">${esc(s.cat)}</span>
          ${showApp ? `<span class="s-app-tag">${esc(s.appName)}</span>` : ""}
        </div>
        <p class="s-desc">${esc(s.description)}</p>
      </div>
      <div class="s-row-actions">
        <button class="combo-btn ${available ? "" : "disabled"}" ${available ? `onclick="KS.copyCombo('${esc(comboText(combo)).replace(/'/g, "\\'")}', this)"` : "disabled"}>
          ${available ? comboHtml(combo) : `<span class="combo-na">Not available</span>`}
          ${available ? `<span class="copy-icon">⧉</span>` : ""}
        </button>
        <button class="fav-btn ${isFav ? "active" : ""}" onclick="KS.toggleFavorite('${s.appId}','${s.id}')">${isFav ? "★" : "☆"}</button>
      </div>
    </div>`;
}

/* ============================================================
   HOME PAGE
   ============================================================ */

function homeHtml() {
  const popularApps = HOME_POPULAR_IDS.map(appById).filter(Boolean);
  const sod = POPULAR_SHORTCUTS[dayIndex(POPULAR_SHORTCUTS.length)];
  const sodCombo = sod ? (state.platform === "mac" ? sod.mac : sod.win) : null;
  return `
    <div class="page home">
      <section class="hero">
        <h1>Master any app with keyboard shortcuts.</h1>
        <p class="hero-sub">Discover keyboard shortcuts for the apps you use every day. Search once, learn faster.</p>
        <button class="home-search" onclick="KS.openPalette()">
          <span>🔍</span><span>Search apps or shortcuts…</span>
          <span class="home-search-kbd"><span class="keycap">⌘</span><span class="keycap">K</span></span>
        </button>
        <div class="hero-platform">
          <span class="hero-platform-label">Your platform</span>
          ${platformToggleHtml()}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Popular apps</h2>
          <button class="text-link" onclick="KS.nav('/apps')">Browse all →</button>
        </div>
        <div class="app-grid">${popularApps.map(appCardHtml).join("")}</div>
      </section>

      ${sod ? `
      <section class="section">
        <div class="sod-card">
          <div class="sod-label">Shortcut of the day</div>
          <div class="sod-body">
            <div>
              <div class="sod-app">${esc(sod.appName)}</div>
              <div class="sod-name">${esc(sod.name)}</div>
              <p class="sod-desc">${esc(sod.description)}</p>
            </div>
            ${comboHtml(sodCombo, "lg")}
          </div>
          <button class="text-link" onclick="KS.nav('/shortcuts/${sod.appId}?s=${sod.id}')">View in ${esc(sod.appName)} →</button>
        </div>
      </section>` : ""}

      <section class="section">
        <h2>Browse by category</h2>
        <div class="cat-chips">
          ${Object.entries(CATEGORY_META).map(([key, meta]) => `
            <button class="cat-chip" style="--tint:${meta.tint}" onclick="KS.nav('/apps?cat=${key}')">${esc(meta.label)}</button>`).join("")}
        </div>
      </section>
    </div>`;
}

/* ============================================================
   DIRECTORY PAGE
   ============================================================ */

function directoryGridHtml() {
  let apps = APPS.filter((a) => {
    if (state.dirCategory !== "all" && a.category !== state.dirCategory) return false;
    if (state.dirPlatform !== "all" && !a.platforms.includes(state.dirPlatform)) return false;
    if (state.dirQuery.trim() && !a.name.toLowerCase().includes(state.dirQuery.trim().toLowerCase())) return false;
    return true;
  });
  if (state.dirSort === "az") apps = [...apps].sort((a, b) => a.name.localeCompare(b.name));
  else if (state.dirSort === "most") apps = [...apps].sort((a, b) => b.shortcuts.length - a.shortcuts.length);
  else apps = [...apps].sort((a, b) => b.shortcuts.filter((s) => s.popular).length - a.shortcuts.filter((s) => s.popular).length);
  if (!apps.length) return `<div class="empty">No applications match those filters.</div>`;
  return apps.map(appCardHtml).join("");
}

function directoryHtml(category) {
  state.dirCategory = category || "all";
  return `
    <div class="page">
      <div class="page-head"><h1>All applications</h1>
        <p class="page-sub">${APPS.length} applications and growing — search any of them below.</p></div>
      <div class="dir-search"><span>🔍</span>
        <input placeholder="Search applications…" value="${esc(state.dirQuery)}" oninput="KS.dirSearch(this.value)" /></div>
      <div class="dir-filters">
        <div class="chip-row">
          <button class="chip ${state.dirCategory === "all" ? "active" : ""}" onclick="KS.dirSetCategory('all')">All</button>
          ${Object.entries(CATEGORY_META).map(([key, meta]) => `
            <button class="chip ${state.dirCategory === key ? "active" : ""}" onclick="KS.dirSetCategory('${key}')">${esc(meta.label)}</button>`).join("")}
        </div>
        <div class="dir-controls">
          <select onchange="KS.dirSetPlatform(this.value)">
            <option value="all">All platforms</option>
            <option value="mac" ${state.dirPlatform === "mac" ? "selected" : ""}>macOS</option>
            <option value="win" ${state.dirPlatform === "win" ? "selected" : ""}>Windows</option>
          </select>
          <select onchange="KS.dirSetSort(this.value)">
            <option value="popular">Sort: Popular</option>
            <option value="az">Sort: A–Z</option>
            <option value="most">Sort: Most shortcuts</option>
          </select>
        </div>
      </div>
      <div class="app-grid" id="dir-grid">${directoryGridHtml()}</div>
    </div>`;
}

/* ============================================================
   APP DETAIL PAGE
   ============================================================ */

function appListHtml(app) {
  const categories = ["all", "popular", ...Array.from(new Set(app.shortcuts.map((s) => s.cat)))];
  const filtered = app.shortcuts.filter((s) => {
    if (state.appCategory === "popular" && !s.popular) return false;
    if (state.appCategory !== "all" && state.appCategory !== "popular" && s.cat !== state.appCategory) return false;
    if (state.appQuery.trim() && !matchShortcut(s, app.name, state.appQuery.trim())) return false;
    return true;
  }).map((s) => ({ ...s, appId: app.id, appName: app.name }));

  if (state.appCompare) {
    const rows = filtered.map((s) => `
      <div class="compare-row">
        <span class="compare-name">${esc(s.name)}</span>
        <span>${s.mac ? comboHtml(s.mac, "sm") : `<span class="combo-na">—</span>`}</span>
        <span>${s.win ? comboHtml(s.win, "sm") : `<span class="combo-na">—</span>`}</span>
      </div>`).join("");
    return `
      <div class="compare-table">
        <div class="compare-row compare-head"><span>Action</span><span>macOS</span><span>Windows</span></div>
        ${rows || `<div class="empty">No shortcuts match your search.</div>`}
      </div>`;
  }
  return `<div class="s-list">${filtered.length ? filtered.map((s) => shortcutRowHtml(s)).join("") : `<div class="empty">No shortcuts match your search.</div>`}</div>`;
}

function appDetailHtml(appId, shortcutId) {
  const app = appById(appId);
  if (!app) return `<div class="page">Application not found. <button class="text-link" onclick="KS.nav('/apps')">Browse all apps →</button></div>`;
  state.appQuery = ""; state.appCategory = "all"; state.appCompare = false;
  const effectivePlatform = app.platforms.includes(state.platform) ? state.platform : app.platforms[0];
  const categories = ["all", "popular", ...Array.from(new Set(app.shortcuts.map((s) => s.cat)))];

  setTimeout(() => {
    if (shortcutId) document.getElementById(`s-${shortcutId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 30);

  return `
    <div class="page">
      <div class="app-header">${monoBadge(app, 44)}
        <div><h1>${esc(app.name)} shortcuts</h1><p class="page-sub">${esc(app.description)}</p></div>
      </div>
      <div class="app-header-controls">
        ${app.platforms.length > 1 ? platformToggleHtml() : `<span class="mac-only-badge">${app.platforms[0] === "mac" ? "macOS" : "Windows"} only</span>`}
        <button id="compare-btn" class="compare-toggle" onclick="KS.appToggleCompare()">⇄ Compare Mac / Windows</button>
      </div>
      <div class="dir-search"><span>🔍</span>
        <input placeholder="Search ${esc(app.name)} shortcuts…" oninput="KS.appSearch(this.value)" /></div>
      <div class="chip-row">
        ${categories.map((c) => `<button class="chip ${c === "all" ? "active" : ""}" data-cat="${esc(c)}" onclick="KS.appSetCategory('${esc(c)}')">${c === "all" ? "All" : c === "popular" ? "Popular" : esc(c)}</button>`).join("")}
      </div>
      <div id="app-list">${appListHtml(app)}</div>
      <div class="data-note">Shortcut data is supplied as a reference and may vary by app version, settings, and operating system. Check the app's official documentation when accuracy is critical.</div>
    </div>`;
}

/* ============================================================
   FAVORITES PAGE
   ============================================================ */

function favoritesHtml() {
  const items = Array.from(state.favorites).map((key) => {
    const [appId, shortcutId] = key.split(":");
    const app = appById(appId);
    const s = app && app.shortcuts.find((sh) => sh.id === shortcutId);
    return s ? { ...s, appId, appName: app.name } : null;
  }).filter(Boolean);
  return `
    <div class="page">
      <div class="page-head"><h1>Favorites</h1><p class="page-sub">Shortcuts you've starred, saved on this device.</p></div>
      ${items.length
        ? `<div class="s-list">${items.map((s) => shortcutRowHtml(s, true)).join("")}</div>`
        : `<div class="empty-state"><div style="font-size:28px">🔖</div><p>No favorites yet. Star any shortcut to save it here.</p></div>`}
    </div>`;
}

/* ============================================================
   LEARN PAGE
   ============================================================ */

function quizCardHtml() {
  const q = state.learnQuestion;
  if (!q) return "";
  const combo = (s) => (state.platform === "mac" ? s.mac : s.win);
  const picked = state.learnPicked;
  const options = q.options.map((opt) => {
    const isCorrect = opt.id === q.correct.id;
    let cls = "";
    if (picked) cls = isCorrect ? "correct" : opt.id === picked.id ? "wrong" : "muted";
    return `<button class="quiz-option ${cls}" ${picked ? "disabled" : ""} onclick="KS.learnPick('${opt.id}')">${comboHtml(combo(opt), "sm")}</button>`;
  }).join("");
  const feedback = picked ? `
    <div class="quiz-feedback">
      <span class="${picked.id === q.correct.id ? "ok" : "no"}">${picked.id === q.correct.id ? "Correct" : "Not quite"}</span>
      <p>${esc(q.correct.description)}</p>
      <button class="btn-primary" onclick="KS.learnBuildQuestion()">Next question →</button>
    </div>` : "";
  return `
    <div class="quiz-q">What's the shortcut for <strong>${esc(q.correct.name)}</strong> in <strong>${esc(q.correct.appName)}</strong>?</div>
    <div class="quiz-options">${options}</div>
    ${feedback}`;
}

function learnHtml() {
  if (!state.learnQuestion) {
    const hasPlatform = (s) => !!(state.platform === "mac" ? s.mac : s.win);
    const platformPool = ALL_SHORTCUTS.filter(hasPlatform);
    const popularPlatformPool = POPULAR_SHORTCUTS.filter(hasPlatform);
    const pool = popularPlatformPool.length >= 8 ? popularPlatformPool : platformPool;
    if (!pool.length) {
      return `<div class="page learn"><div class="page-head"><h1>Learn mode</h1><p class="page-sub">No shortcuts are available for this platform yet.</p></div></div>`;
    }
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const distractorPool = platformPool.filter((s) => s.id !== correct.id);
    const shuffled = [...distractorPool].sort(() => Math.random() - 0.5).slice(0, 3);
    state.learnQuestion = { correct, options: [correct, ...shuffled].sort(() => Math.random() - 0.5) };
    state.learnPicked = null;
  }
  return `
    <div class="page learn">
      <div class="page-head"><h1>Learn mode</h1><p class="page-sub">Test yourself on shortcuts for the apps you use.</p></div>
      <div class="learn-stats">
        <div><span class="learn-stat-value">${state.learn.score}</span><span class="learn-stat-label">Correct</span></div>
        <div><span class="learn-stat-value">${state.learn.streak}</span><span class="learn-stat-label">Streak</span></div>
        <div><span class="learn-stat-value">${state.learn.answered}</span><span class="learn-stat-label">Answered</span></div>
      </div>
      <div class="quiz-card" id="quiz-card">${quizCardHtml()}</div>
    </div>`;
}

function feedbackFormHtml() {
  return `<section class="feedback-panel" aria-labelledby="feedback-heading"><div><span class="legal-eyebrow">Feedback</span><h2 id="feedback-heading">Share your experience</h2><p>Your feedback goes directly to the ShortcutSheet team.</p></div><form id="feedback-form" class="feedback-form"><label>Name <span>Optional</span><input name="name" maxlength="80" autocomplete="name" placeholder="Your name" /></label><label>Email <span>Optional</span><input name="email" type="email" maxlength="160" autocomplete="email" placeholder="you@example.com" /></label><label>Type of feedback<select name="category"><option>General feedback</option><option>Shortcut correction</option><option>App suggestion</option><option>Bug report</option><option>Partnership or copyright</option></select></label><label>Message<textarea name="message" required minlength="10" maxlength="4000" placeholder="Tell us what would make ShortcutSheet better…"></textarea></label><button class="btn-primary" type="submit">Send feedback</button><p id="feedback-status" class="form-status" aria-live="polite"></p></form></section>`;
}

function adminPageHtml() {
  return `<article class="page legal-page page-reveal"><header class="legal-hero"><span class="legal-eyebrow">Admin</span><h1>Feedback inbox</h1><p>Review messages submitted through ShortcutSheet Contact.</p></header><section class="admin-panel"><form id="admin-login" class="admin-login"><label>Admin password<input type="password" name="password" required autocomplete="current-password" placeholder="Enter your password" /></label><button class="btn-primary" type="submit">Open inbox</button><p id="admin-status" class="form-status" aria-live="polite">Sign in to view feedback.</p></form><div id="admin-results" aria-live="polite"></div></section></article>`;
}

async function loadAdminFeedback() {
  const status = document.getElementById("admin-status");
  const results = document.getElementById("admin-results");
  if (!state.adminAuth || !results) return;
  try {
    const response = await fetch("/api/feedback", { headers: { Authorization: state.adminAuth } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load feedback.");
    if (status) status.textContent = `${data.length} feedback item${data.length === 1 ? "" : "s"}.`;
    results.innerHTML = data.length ? `<div class="feedback-list">${data.map((item) => `<article class="feedback-item"><div class="feedback-item-top"><strong>${esc(item.title)}</strong><time datetime="${esc(item.createdAt)}">${esc(new Date(item.createdAt).toLocaleDateString())}</time></div><p>${esc(item.message)}</p><div class="feedback-meta">${esc(item.category)}${item.name ? ` · ${esc(item.name)}` : ""}${item.email ? ` · ${esc(item.email)}` : ""}</div><a href="${esc(item.url)}" target="_blank" rel="noopener">Open in GitHub →</a></article>`).join("")}</div>` : `<p class="empty-state">No feedback has been received yet.</p>`;
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to load feedback.";
  }
}

function infoPageHtml(page) {
  if (page === "admin") return adminPageHtml();
  const content = {
    about: {
      eyebrow: "Our purpose", title: "Make everyday software feel effortless.", lead: "ShortcutSheet is a focused reference and learning space for people who want to work with more speed, confidence, and flow.",
      sections: [["Built for the moment you need it", "A shortcut is most valuable when it is easy to find, easy to understand, and ready to use. We bring app-specific commands, platform controls, search, favourites, and practice into one calm, useful place."], ["Designed with care", "We favour clear hierarchy, readable type, and low-friction interactions over noise. The goal is simple: less hunting, more momentum."], ["An honest reference", "Shortcuts can vary by version, operating system, keyboard layout, settings, and context. Our catalogue is a reference, not a substitute for official documentation when a task is important."]]
    },
    contact: {
      eyebrow: "Get in touch", title: "Help us make ShortcutSheet better.", lead: "Found an incorrect shortcut, want to suggest an app, or have a question about the site? We welcome precise, useful feedback.",
      sections: [["Report a shortcut", "Please include the app name, version, operating system, keyboard layout, and the command you expected. A link to the app's official documentation is especially helpful."], ["Business and copyright", "For partnership, copyright, or other business enquiries, clearly identify the material or concern so it can be reviewed promptly."], ["What to expect", "We review feedback in good faith. We cannot guarantee a reply to every message, but reports with clear reproduction details are the quickest to assess."]]
    },
    privacy: {
      eyebrow: "Privacy", title: "Your preferences stay on your device.", lead: "ShortcutSheet is designed to be useful without requiring an account or collecting more information than the experience needs.",
      sections: [["Local browser storage", "Favorites, theme choice, platform selection, and learning progress are stored in your browser using local storage. They stay on that device unless your browser synchronises them under its own settings."], ["No account required", "You can browse and use ShortcutSheet without creating an account. We do not currently ask you for a name, email address, or password to use core features."], ["Future services", "If analytics, advertising, forms, or other third-party services are added, this policy will be updated before they are enabled. Those providers may handle information under their own privacy notices."], ["Your choices", "You can clear locally stored preferences at any time through your browser's site-data controls. Blocking scripts or deleting site data may affect saved favourites and learning progress."]]
    },
    terms: {
      eyebrow: "Terms of use", title: "A straightforward agreement for using ShortcutSheet.", lead: "By using ShortcutSheet, you agree to use it responsibly and understand the limits of a general shortcut reference.",
      sections: [["Reference material", "ShortcutSheet is provided for general information. Commands can differ by app release, operating system, permissions, settings, keyboard layout, and context. Confirm important actions in official documentation."], ["Your responsibility", "You are responsible for checking whether a shortcut is suitable for your task and for protecting your work before taking an action that could change or remove data."], ["Acceptable use", "Do not misuse the service, interfere with its operation, scrape it at a harmful rate, or use it in a way that infringes another person's rights or breaks applicable law."], ["Changes", "We may update the site, its content, or these terms as the product evolves. Continued use after an update means you accept the revised terms."]]
    },
  };
  const item = content[page];
  if (!item) return `<div class="page legal-page"><div class="page-head"><h1>Page not found</h1><p class="page-sub">The page you requested is not available.</p></div></div>`;
  return `<article class="page legal-page page-reveal"><header class="legal-hero"><span class="legal-eyebrow">${item.eyebrow}</span><h1>${item.title}</h1><p>${item.lead}</p></header><div class="legal-grid">${item.sections.map(([heading, body]) => `<section class="legal-card"><h2>${heading}</h2><p>${body}</p></section>`).join("")}</div>${page === "contact" ? feedbackFormHtml() : ""}<p class="legal-updated">Last updated September 18, 2026.</p></article>`;
}

/* ============================================================
   ROOT RENDER
   ============================================================ */

function render() {
  const parsed = parseHash();
  const navLinks = document.getElementById("nav-links");
  const topPlatform = document.getElementById("platform-toggle-top");
  const favCount = document.getElementById("fav-count");
  const main = document.getElementById("main");
  const paletteRoot = document.getElementById("palette-root");
  if (!navLinks || !topPlatform || !favCount || !main || !paletteRoot) return;
  navLinks.classList.toggle("open", state.navOpen);
  document.querySelectorAll("#nav-links button").forEach((b) => b.classList.remove("active"));
  document.getElementById(`nav-${parsed.route === "app" ? "directory" : parsed.route}`)?.classList.add("active");
  topPlatform.innerHTML = platformToggleHtml(true);
  favCount.textContent = state.favorites.size ? ` ${state.favorites.size}` : "";
  favCount.style.display = state.favorites.size ? "inline" : "none";

  let html = "";
  let title = "ShortcutSheet — Keyboard Shortcuts";
  if (parsed.route === "home") { html = homeHtml(); }
  else if (parsed.route === "directory") { html = directoryHtml(parsed.category); title = "All Applications — ShortcutSheet"; }
  else if (parsed.route === "app") {
    html = appDetailHtml(parsed.appId, parsed.shortcutId);
    const app = appById(parsed.appId);
    if (app) title = `${app.name} Keyboard Shortcuts — ShortcutSheet`;
  }
  else if (parsed.route === "favorites") { html = favoritesHtml(); title = "Favorites — ShortcutSheet"; }
  else if (parsed.route === "learn") { html = learnHtml(); title = "Learn Mode — ShortcutSheet"; }
  else if (["about", "contact", "privacy", "terms", "admin", "not-found"].includes(parsed.route)) { html = infoPageHtml(parsed.route); title = `${parsed.route === "not-found" ? "Page not found" : parsed.route[0].toUpperCase() + parsed.route.slice(1)} — ShortcutSheet`; }
  main.innerHTML = html;
  document.title = title;

  document.getElementById("feedback-form")?.addEventListener("submit", (event) => { event.preventDefault(); KS.submitFeedback(event.currentTarget); });
  document.getElementById("admin-login")?.addEventListener("submit", (event) => { event.preventDefault(); KS.adminLogin(event.currentTarget); });

  paletteRoot.innerHTML = paletteHtml();
}

// Global keyboard shortcuts: Cmd/Ctrl+K or "/" opens the command palette
window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    KS.openPalette();
  } else if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
    e.preventDefault();
    KS.openPalette();
  } else if (e.key === "Escape" && state.paletteOpen) {
    KS.closePalette();
  }
});


/* ============================================================
   KEYBOARD HELP — global shortcuts for ShortcutSheet itself
   ============================================================ */
function keysheetHelpHtml() {
  return `
    <div class="palette-overlay" onclick="KS.closeHelp()">
      <div class="palette keyboard-help" onclick="event.stopPropagation()">
        <div class="palette-input-row">
          <strong>ShortcutSheet shortcuts</strong>
          <button class="palette-close" onclick="KS.closeHelp()">✕</button>
        </div>
        <div class="palette-body">
          <div class="compare-row"><span>Search / command palette</span>${comboHtml(["⌘","K"],"sm")}</div>
          <div class="compare-row"><span>Search / command palette</span>${comboHtml(["Ctrl","K"],"sm")}</div>
          <div class="compare-row"><span>Open search</span>${comboHtml(["/"],"sm")}</div>
          <div class="compare-row"><span>Close dialogs</span>${comboHtml(["Esc"],"sm")}</div>
          <div class="compare-row"><span>Show this help</span>${comboHtml(["?"],"sm")}</div>
        </div>
      </div>
    </div>`;
}
KS.openHelp = () => {
  state.helpOpen = true;
  render();
};
KS.closeHelp = () => {
  state.helpOpen = false;
  render();
};
const originalPaletteHtml = paletteHtml;
paletteHtml = function() {
  return `${originalPaletteHtml()}${state.helpOpen ? keysheetHelpHtml() : ""}`;
};
state.helpOpen = false;

window.removeEventListener("keydown", window.__keysheetKeyHandler);
window.__keysheetKeyHandler = (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault(); KS.openPalette(); return;
  }
  if (!typing && e.key === "/") {
    e.preventDefault(); KS.openPalette(); return;
  }
  if (!typing && e.key === "?") {
    e.preventDefault(); KS.openHelp(); return;
  }
  if (e.key === "Escape") {
    if (state.helpOpen) { KS.closeHelp(); return; }
    if (state.paletteOpen) { KS.closePalette(); return; }
    if (state.navOpen) { state.navOpen = false; render(); }
  }
};
window.addEventListener("keydown", window.__keysheetKeyHandler);
