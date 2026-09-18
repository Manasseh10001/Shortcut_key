// ShortcutSheet server: static site, secure feedback relay, and admin inbox.
// Keep GITHUB_TOKEN and ADMIN_PASSWORD in your host's secret environment.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const types = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8" };
const required = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN", "ADMIN_PASSWORD"];
const configured = () => required.every((key) => Boolean(process.env[key]));
const clean = (value, max) => String(value || "").trim().replace(/[\u0000-\u001F]/g, " ").slice(0, max);

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}
async function requestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Feedback is too long.");
  }
  return JSON.parse(body || "{}");
}
function adminAuthorised(request) {
  const expected = Buffer.from(`admin:${process.env.ADMIN_PASSWORD || ""}`);
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const supplied = Buffer.from(header.slice(6), "base64");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2026-03-10", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "GitHub could not process the request.");
  return data;
}
async function fileFor(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/\\/g, "/");
  if (cleanPath.includes("..")) return null;
  const requested = normalize(join(root, cleanPath === "/" ? "index.html" : cleanPath.replace(/^\//, "")));
  if (!requested.startsWith(root)) return null;
  try { if ((await stat(requested)).isFile()) return requested; } catch {}
  try { if ((await stat(join(requested, "index.html"))).isFile()) return join(requested, "index.html"); } catch {}
  return null;
}

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  try {
    if (pathname === "/api/feedback" && request.method === "POST") {
      if (!configured()) return sendJson(response, 503, { error: "Feedback is not configured yet. Please try again later." });
      const input = await requestBody(request);
      const message = clean(input.message, 4000);
      const category = clean(input.category, 60) || "General feedback";
      const name = clean(input.name, 80);
      const email = clean(input.email, 160);
      if (message.length < 10) return sendJson(response, 400, { error: "Please enter at least 10 characters of feedback." });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(response, 400, { error: "Please enter a valid email address." });
      const issue = await github(`/repos/${encodeURIComponent(process.env.GITHUB_OWNER)}/${encodeURIComponent(process.env.GITHUB_REPO)}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `[Feedback] ${category}: ${message.slice(0, 72)}`, body: `## ${category}\n\n${message}\n\n---\n**Name:** ${name || "Not provided"}\n**Email:** ${email || "Not provided"}\n**Submitted:** ${new Date().toISOString()}` }) });
      return sendJson(response, 201, { ok: true, id: issue.number });
    }
    if (pathname === "/api/feedback" && request.method === "GET") {
      if (!configured()) return sendJson(response, 503, { error: "Admin feedback is not configured yet." });
      if (!adminAuthorised(request)) return sendJson(response, 401, { error: "Incorrect admin password." });
      const issues = await github(`/repos/${encodeURIComponent(process.env.GITHUB_OWNER)}/${encodeURIComponent(process.env.GITHUB_REPO)}/issues?state=all&per_page=100&sort=created&direction=desc`);
      return sendJson(response, 200, issues.filter((issue) => !issue.pull_request && /^\[Feedback\]/.test(issue.title)).map((issue) => {
        const body = issue.body || "";
        const message = body.split(/\n\n---\n/)[0].replace(/^## .*\n\n/, "").trim();
        const name = body.match(/\*\*Name:\*\*\s*(.*)/)?.[1]?.trim() || "";
        const email = body.match(/\*\*Email:\*\*\s*(.*)/)?.[1]?.trim() || "";
        return { title: issue.title.replace(/^\[Feedback\]\s*/, ""), message, category: body.match(/^##\s*(.*)$/m)?.[1] || "Feedback", name: name === "Not provided" ? "" : name, email: email === "Not provided" ? "" : email, createdAt: issue.created_at, url: issue.html_url };
      }));
    }
    const file = await fileFor(pathname);
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(join(root, "404.html")));
      return;
    }
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch (error) {
    if (pathname.startsWith("/api/")) return sendJson(response, 500, { error: error.message || "Something went wrong." });
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Server error");
  }
}).listen(process.env.PORT || 3000, process.env.HOST || "127.0.0.1", () => console.log(`ShortcutSheet: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}`));
