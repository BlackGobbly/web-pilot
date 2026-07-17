# web-pilot

A **3-tier web capture and browser automation AI-agent skill**. Intelligently escalates from lightweight static fetching to full browser automation when needed.

## Tier Overview

| Tier | Method | Use Case | Speed | Success Rate |
|:----:|:-------|:---------|:-----:|:------------:|
| **1** | WebFetch | Static HTML, articles, API responses | ⚡ Fast | ~60% |
| **2** | Node.js + Playwright (`scripts/web_capture.js`) | JS-rendered pages (SPA/React/Vue), resilient rendering for authorized testing | 🚀 Fast | ~85% |
| **3** | CDP real browser (`agent-browser` CLI) | CAPTCHA, login, complex interaction, QA testing | 🐢 Slow | ~95% |

## Installation

### As an AI agent Skill (Auto-Load)

This repo **is already a valid skill package** — `.ai-agent/skills/web-pilot/` contains the skill definition. To use it:

**Option A — Use directly (if you cloned this repo):**
```bash
# You're already in the repo — ai-agent will auto-load the skill
# Just install the script dependencies:
npm install
npm run install:browsers
pip install -r requirements.txt
```

**Option B — Install into another project:**
```bash
cd /your/project
mkdir -p .ai-agent/skills
cp -r /path/to/web-pilot/.ai-agent/skills/web-pilot .ai-agent/skills/web-pilot

# Also copy the scripts and package.json:
cp /path/to/web-pilot/scripts/*.js scripts/
cp /path/to/web-pilot/package.json .
npm install
npm run install:browsers
pip install -r requirements.txt
```

After installation, AI-agent will auto-load the skill when you use keywords like "browser", "scrape", or "screenshot".

### Verify

```bash
node scripts/web_capture.js https://example.com --max-length 200
```

If you see "Example Domain" in the output, everything is working.

### Tier 1 — Static Fetch (no setup needed)

Use AI-agent's built-in `WebFetch` tool directly:

```
WebFetch(url="https://example.com", prompt="Extract the article title and body")
```

### Tier 2 — Playwright Capture

```bash
# Basic text capture
node scripts/web_capture.js https://example.com

# JSON output with links and metadata
node scripts/web_capture.js https://example.com --output json

# Screenshot
node scripts/web_capture.js https://example.com --output screenshot

# Compatibility mode for authorized testing
node scripts/web_capture.js https://example.com --stealth
```

### Tier 3 — Real Browser via CDP

```bash
# Start Chrome with remote debugging
# macOS:
open -na "Google Chrome" --args --remote-debugging-port=9223 --no-first-run

# Windows (Git Bash):
"/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9223

# Connect via agent-browser
agent-browser connect http://127.0.0.1:9223
agent-browser open https://example.com
agent-browser snapshot
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/web_capture.js` | Standalone Playwright page capture (Tier 2) |
| `scripts/scraper_worker.js` | Config-driven batch scraping engine (stdin JSON → stdout JSON) |
| `scripts/scraper.py` | Python orchestrator: Excel config → Node.js worker → formatted Excel output |

## Ethical Guidelines

- **Authorized use only** — Use this project for pages you own, are authorized to test, or may lawfully access
- **Respect robots.txt** — Check target site crawling policies before automated collection
- **Rate limiting** — Add delays between requests; respect 429 responses and `Retry-After` headers
- **No access-control circumvention** — Do not bypass login walls, paywalls, CAPTCHA, security checks, age gates, IP blocks, or other access controls
- **Human intervention only for CAPTCHA** — Tier 3 can continue after the user manually completes a challenge in their own browser; it does not solve or defeat CAPTCHA
- **Data privacy** — Be cautious with personal data and comply with applicable privacy laws
- **Terms of Service** — Review and comply with each target site's terms and API policies
- **Attribution** — Cite sources when republishing scraped data

## Legal Notice

This project is a browser automation and capture toolkit, not legal advice. Website automation can create legal, contractual, privacy, or platform-policy risk depending on the target site, jurisdiction, data type, request volume, and authorization. Review the target site's terms, robots.txt, API rules, and applicable law before use. See [LEGAL.md](LEGAL.md) for responsible-use boundaries.

## License

MIT — see [LICENSE](LICENSE) for details.
