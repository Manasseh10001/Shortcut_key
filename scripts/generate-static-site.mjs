/** Generate crawlable documents and SEO files from the supplied shortcut database.
 * Run: SITE_URL=https://example.com node scripts/generate-static-site.mjs
 */
import { mkdir, writeFile, rm, cp } from "node:fs/promises";
import { APPS, CATEGORY_META } from "../data/apps.js";

const siteUrl = (process.env.SITE_URL || "https://shortcutssheet.com").replace(/\/$/, "");
const out = new URL("../dist/", import.meta.url);
const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const url = (path) => `${siteUrl}${path}`;
const pathFor = (app) => `/shortcuts/${encodeURIComponent(app.id)}`;

function documentShell({ title, description, path, body, robots = "index,follow", structuredData }) {
  const canonical = url(path);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:site_name" content="ShortcutSheet">
<link rel="stylesheet" href="/styles.css">${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>` : ""}</head>
<body class="shortcut-ai"><header class="topbar"><div class="topbar-inner"><a class="brand" href="/"><span class="brand-mark">⌘</span> ShortcutSheet</a><nav class="nav" aria-label="Primary"><a href="/">Home</a><a href="/apps">Apps</a><a href="/learn">Learn</a><a href="/favorites">Favorites</a></nav></div></header>
<main class="main">${body}</main><footer class="site-footer"><span>ShortcutSheet — a shortcut reference and learning tool.</span><span><a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/admin">Admin</a></span></footer><script type="module" src="/app.js"></script></body></html>`;
}

function combo(keys) { return keys?.length ? esc(keys.join(" + ")) : "Not available"; }
function appPage(app) {
  const path = pathFor(app);
  const description = `Browse ${app.name} keyboard shortcuts for macOS and Windows, including searchable actions and key combinations.`;
  const rows = app.shortcuts.map((shortcut) => `<tr><th scope="row">${esc(shortcut.name)}</th><td>${esc(shortcut.description)}</td><td>${combo(shortcut.mac)}</td><td>${combo(shortcut.win)}</td></tr>`).join("");
  const body = `<article class="page"><nav aria-label="Breadcrumb"><a href="/apps">All apps</a> / ${esc(app.name)}</nav><header class="page-head"><h1>${esc(app.name)} keyboard shortcuts</h1><p class="page-sub">${esc(app.description || description)}</p></header><section aria-labelledby="shortcuts"><h2 id="shortcuts">${app.shortcuts.length} shortcuts</h2><p class="data-note">This reference is generated from the supplied database. Shortcuts may vary by app version, operating system, settings, keyboard layout, and context. Confirm critical commands in official documentation.</p><div class="shortcut-table-wrap"><table class="shortcut-table"><thead><tr><th>Action</th><th>Description</th><th>macOS</th><th>Windows</th></tr></thead><tbody>${rows}</tbody></table></div></section></article>`;
  return documentShell({ title: `${app.name} Keyboard Shortcuts | ShortcutSheet`, description, path, body, structuredData: { "@context": "https://schema.org", "@type": "TechArticle", headline: `${app.name} Keyboard Shortcuts`, description, mainEntityOfPage: url(path), about: { "@type": "SoftwareApplication", name: app.name } } });
}

function staticPage({ slug, title, description, body, robots }) {
  return documentShell({ title: `${title} | ShortcutSheet`, description, path: slug === "home" ? "/" : `/${slug}`, body, robots });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL("../app.js", import.meta.url), new URL("app.js", out));
await cp(new URL("../styles.css", import.meta.url), new URL("styles.css", out));
await cp(new URL("../data", import.meta.url), new URL("data", out), { recursive: true });

const count = APPS.length;
const home = `<section class="page home"><header class="hero"><h1>Keyboard shortcuts for the apps you use.</h1><p class="hero-sub">Search ${count} applications, save useful shortcuts, and practise on macOS or Windows.</p><p><a class="btn-primary" href="/apps">Browse all applications</a></p></header></section>`;
await writeFile(new URL("index.html", out), documentShell({ title: "ShortcutSheet — Keyboard Shortcuts for Everyday Apps", description: `Find keyboard shortcuts for ${count} apps on macOS and Windows.`, path: "/", body: home }));

const appLinks = APPS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((app) => `<li><a href="${pathFor(app)}">${esc(app.name)}</a> <span>${esc(CATEGORY_META[app.category]?.label || app.category)} · ${app.shortcuts.length} shortcuts</span></li>`).join("");
await mkdir(new URL("apps/", out), { recursive: true });
await writeFile(new URL("apps/index.html", out), staticPage({ slug: "apps", title: "All applications", description: `Browse ${count} applications with keyboard shortcut references.`, body: `<section class="page"><header class="page-head"><h1>All applications</h1><p class="page-sub">Browse every app in the ShortcutSheet directory.</p></header><ul class="app-link-list">${appLinks}</ul></section>` }));

const legal = {
  about: ["About ShortcutSheet", "ShortcutSheet is a focused reference and learning space for people who want to work with more speed, confidence, and flow.", "Our purpose", [["Built for the moment you need it", "A shortcut is most valuable when it is easy to find, easy to understand, and ready to use. We bring app-specific commands, platform controls, search, favourites, and practice into one calm, useful place."], ["Designed with care", "We favour clear hierarchy, readable type, and low-friction interactions over noise. The goal is simple: less hunting, more momentum."], ["An honest reference", "Shortcuts can vary by version, operating system, keyboard layout, settings, and context. Our catalogue is a reference, not a substitute for official documentation when a task is important."]]],
  contact: ["Contact", "Found an incorrect shortcut, want to suggest an app, or have a question about the site? We welcome precise, useful feedback.", "Get in touch", [["Report a shortcut", "Include the app name, version, operating system, keyboard layout, and the command you expected. A link to official documentation is especially helpful."], ["Business and copyright", "For partnership, copyright, or other business enquiries, clearly identify the material or concern so it can be reviewed promptly."], ["What to expect", "We review feedback in good faith. Reports with clear reproduction details are the quickest to assess."]]],
  privacy: ["Privacy", "ShortcutSheet is designed to be useful without requiring an account or collecting more information than the experience needs.", "Privacy", [["Local browser storage", "Favorites, theme choice, platform selection, and learning progress are stored in your browser using local storage. They stay on that device unless your browser synchronises them under its own settings."], ["No account required", "You can browse and use ShortcutSheet without creating an account."], ["Future services", "If analytics, advertising, forms, or other third-party services are added, this policy will be updated before they are enabled."], ["Your choices", "You can clear locally stored preferences at any time through your browser's site-data controls."]]],
  terms: ["Terms of use", "By using ShortcutSheet, you agree to use it responsibly and understand the limits of a general shortcut reference.", "Terms of use", [["Reference material", "Commands can differ by app release, operating system, permissions, settings, keyboard layout, and context. Confirm important actions in official documentation."], ["Your responsibility", "You are responsible for checking whether a shortcut is suitable for your task and for protecting your work before taking an action that could change or remove data."], ["Acceptable use", "Do not misuse the service, interfere with its operation, scrape it at a harmful rate, or use it in a way that infringes another person's rights or breaks applicable law."], ["Changes", "We may update the site, its content, or these terms as the product evolves."]]],
  learn: ["Learn mode", "Practise keyboard shortcuts from the supplied database. Your progress is saved locally in your browser.", "Learn mode", []],
  favorites: ["Favorites", "Your saved shortcuts are stored locally on this device.", "Favorites", []],
};
for (const [slug, [title, copy, eyebrow, sections]] of Object.entries(legal)) {
  await mkdir(new URL(`${slug}/`, out), { recursive: true });
  const cards = sections.map(([heading, text]) => `<section class="legal-card"><h2>${heading}</h2><p>${text}</p></section>`).join("");
  const body = `<article class="page legal-page page-reveal"><header class="legal-hero"><span class="legal-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></header>${cards ? `<div class="legal-grid">${cards}</div><p class="legal-updated">Last updated September 18, 2026.</p>` : ""}</article>`;
  await writeFile(new URL(`${slug}/index.html`, out), staticPage({ slug, title, description: copy, body, robots: slug === "favorites" ? "noindex,follow" : undefined }));
}

await mkdir(new URL("admin/", out), { recursive: true });
await writeFile(new URL("admin/index.html", out), staticPage({ slug: "admin", title: "Admin feedback inbox", description: "Password-protected ShortcutSheet feedback inbox.", robots: "noindex,nofollow", body: `<article class="page legal-page"><header class="legal-hero"><span class="legal-eyebrow">Admin</span><h1>Feedback inbox</h1><p>Sign in to review Contact submissions.</p></header></article>` }));

for (const app of APPS) {
  const directory = new URL(`shortcuts/${encodeURIComponent(app.id)}/`, out);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("index.html", directory), appPage(app));
}

const paths = ["/", "/apps", "/about", "/contact", "/privacy", "/terms", "/learn", ...APPS.map(pathFor)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${url(path)}</loc><changefreq>${path.startsWith("/shortcuts/") ? "monthly" : "weekly"}</changefreq><priority>${path.startsWith("/shortcuts/") ? "0.8" : "1.0"}</priority></url>`).join("\n")}\n</urlset>\n`;
await writeFile(new URL("sitemap.xml", out), sitemap);
await writeFile(new URL("robots.txt", out), `User-agent: *\nAllow: /\nDisallow: /favorites\nSitemap: ${url("/sitemap.xml")}\n`);
await writeFile(new URL("404.html", out), documentShell({ title: "Page not found | ShortcutSheet", description: "The requested page could not be found.", path: "/404", robots: "noindex,follow", body: `<section class="page"><header class="page-head"><h1>Page not found</h1><p class="page-sub">Try the application directory to find the shortcut reference you need.</p><p><a class="btn-primary" href="/apps">Browse all applications</a></p></header></section>` }));
await writeFile(new URL("_redirects", out), "/shortcuts/* /shortcuts/:splat/index.html 200\n/* /404.html 404\n");
await writeFile(new URL("vercel.json", out), JSON.stringify({ cleanUrls: true, trailingSlash: false }, null, 2));
await writeFile(new URL("BUILD-INFO.json", out), JSON.stringify({ generatedAt: new Date().toISOString(), siteUrl, apps: APPS.length, shortcuts: APPS.reduce((total, app) => total + app.shortcuts.length, 0), note: "Data is copied from the supplied project; generation does not independently verify shortcut accuracy." }, null, 2));
console.log(`Generated ${count} crawlable app pages in ${out.pathname}`);
