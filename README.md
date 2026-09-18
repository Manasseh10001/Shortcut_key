# ShortcutSheet

A static keyboard-shortcut directory for macOS and Windows, generated from the supplied local database.

## Production build

Generate the deployable site from the source database:

```sh
SITE_URL=https://your-domain.example node scripts/generate-static-site.mjs
```

Upload the generated `dist/` directory to any static host. It contains a pre-rendered document for each app at `/shortcuts/<app-id>`, plus `sitemap.xml`, `robots.txt`, a 404 page, and hosting configuration for Vercel/Netlify-style deployments.

For canonical URLs, always set `SITE_URL` to the real production origin before publishing. The default is `https://shortcutssheet.com` only as a placeholder.

## Local preview

Use the included server, which understands the generated clean URLs:

```sh
npm start
```

Then open `http://127.0.0.1:3000`. Do not serve the source folder with a server that only knows `/index.html`; it will return `Cannot GET /shortcuts/<app>` on a refreshed or directly visited app page.

## Feedback inbox and admin access

Contact includes a feedback form and `/admin` is the password-protected inbox. Feedback is stored as Issues in a **private** GitHub repository, so it is available in both the site admin area and GitHub without exposing visitor messages publicly.

Before deploying the server, add these private environment variables in your host (the names are in `.env.example`):

- `GITHUB_OWNER` and `GITHUB_REPO`: your private feedback repository.
- `GITHUB_TOKEN`: a fine-grained GitHub token limited to that repository with **Issues: Read and write** permission.
- `ADMIN_PASSWORD`: a long, unique password for `/admin`.

The token never reaches the browser. GitHub Pages cannot run this secure feedback server by itself; deploy this project to a Node-capable host or add an equivalent serverless API to your host.

## Features retained

- App and shortcut search
- Category directory and filtering
- macOS/Windows controls and comparison
- Favorites and learning progress stored locally in the browser
- Command palette, dark mode, and keyboard help

## Data scope

The database is preserved from the supplied project. It does not include per-record official source URLs, app versions, or verification status, so this project deliberately does not claim that shortcut entries are verified. Shortcut behavior can vary by version, operating system, keyboard layout, settings, and context.
