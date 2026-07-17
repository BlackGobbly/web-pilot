# Platform Portability Guide

This document explains how to adapt the web-pilot skill for use with **Codex CLI** and **Workbuddy**. The core content (3-tier escalation methodology, CLI scripts, website patterns) is platform-agnostic — only the configuration format differs.

---

## Contents Shared Across All Platforms

Regardless of platform, these files are universally usable:

| File | Purpose | Format |
|------|---------|--------|
| `scripts/web_capture.js` | Tier 2 Playwright capture (standalone Node.js CLI) | Standard JS |
| `scripts/scraper_worker.js` | Config-driven batch scraping engine | Standard JS |
| `scripts/scraper.py` | Python orchestrator for Excel-driven scraping | Standard Python |
| `package.json` | Node.js dependencies | Standard NPM |
| `references/handling_difficult_sites.md` | Difficult-site handling patterns and authorized-testing escalation guidance | Plain Markdown |

All scripts accept standard CLI arguments — no platform-specific dependencies.

---

## Codex CLI

[Codex CLI](https://github.com/openai/codex) is OpenAI's agentic coding tool. It reads project-level instructions from a `CODEX.md` file at the project root.

### Installation

```bash
cd your-project
# Copy web-pilot scripts into your project
cp -r /path/to/web-pilot/scripts .
cp /path/to/web-pilot/package.json .
npm install
npm run install:browsers
pip install -r requirements.txt
```

### Setup: `CODEX.md`

Create `CODEX.md` at your project root:

```markdown
# web-pilot: Web Capture & Browser Automation

You have access to Playwright-based web scraping scripts in `scripts/`.
Use these for JS-rendered pages, structured data extraction, and multi-page scraping.

## Available Scripts

- `node scripts/web_capture.js <url>` — Tier 2 page capture (supports --output json/markdown/screenshot, --stealth, --wait)
- `echo '[{...}]' | node scripts/scraper_worker.js` — Config-driven batch scraping from stdin JSON
- `python scripts/scraper.py --excel config.xlsx` — Python orchestrator for Excel-based configs

## Three-Tier Escalation Strategy

1. **Tier 1 (WebFetch)**: For static HTML, articles, API responses. Use your built-in fetch tool.
2. **Tier 2 (Playwright)**: For JS-rendered pages, SPAs, and authorized testing where a real renderer is needed. Use `scripts/web_capture.js`.
3. **Tier 3 (CDP real browser)**: For CAPTCHA, login, complex interaction. Requires manual Chrome + agent-browser CLI.

## Anti-Bot Handling

- `--stealth` applies compatibility tweaks for authorized testing; it must not be used to defeat access controls
- For aggressive blocking, use Tier 3 with real Chrome CDP
- See `references/handling_difficult_sites.md` for CAPTCHA/login/pagination tactics

## Ethical Guidelines

- Respect robots.txt and Terms of Service
- Add delays between requests; respect 429 responses
- Do not bypass login walls, paywalls, CAPTCHA, security pages, age gates, IP blocks, or other access controls
- Cite sources when republishing scraped data
```

### Key Differences from Claude Code

| Feature | Claude Code SKILL.md | Codex CLI CODEX.md |
|---------|---------------------|-------------------|
| Format | YAML frontmatter + Markdown | Plain Markdown |
| Triggers | `triggers:` field for auto-invoke | Not supported |
| Tools list | `tools:` field declaring compatible IDEs | Not supported |
| Risk level | `risk:` field | Not supported |
| Escalation logic | AI reads SKILL.md and decides tier itself | AI reads CODEX.md and decides tier itself |

### Notes

- Codex CLI runs scripts autonomously — ensure you review file operations before execution.
- Codex has no built-in `WebFetch` equivalent; use `curl` or a fetch polyfill for Tier 1.

---

## Workbuddy

[Workbuddy](https://github.com/nicholasgriffintn/workbuddy) (or compatible agent-workspace tools) typically uses instruction files to guide AI behavior.

### Setup: `.workbuddy/instructions.md`

Place this file at `.workbuddy/instructions.md` in your project:

```markdown
# web-pilot for Workbuddy

You are a web capture and browser automation assistant using a 3-tier escalation strategy.

## Tier 1 — Static Fetch
Use your built-in HTTP fetch for simple pages. Best for articles, docs, API responses.

## Tier 2 — Playwright Capture
When content requires JavaScript rendering, use:
```
node scripts/web_capture.js <url> [--output json|markdown|screenshot] [--stealth] [--wait .selector]
```

Options:
- `--output json`: Structured data with links and metadata
- `--output markdown`: Heading-parsed content
- `--output screenshot`: Full-page or viewport PNG
- `--stealth`: Compatibility tweaks for authorized testing; do not use it to defeat access controls
- `--wait .selector`: Wait for element before extraction
- `--executable-path /path/to/chrome`: Custom browser binary

## Tier 3 — Real Browser (CDP)
For CAPTCHA, login, or complex UI interaction:
1. User starts Chrome: `chrome --remote-debugging-port=9223`
2. Connect: `agent-browser connect http://127.0.0.1:9223`
3. Navigate: `agent-browser open <url>`
4. Snapshot → Interact → Extract

## Batch Scraping
For multi-site scraping, prepare a JSON config and pipe to the worker:
```json
[{"url":"https://site.com","container":"ul.list","item":"li","pagination":"click:.next"}]
```
Then: `echo '...' | node scripts/scraper_worker.js`

## Ethical Rules
- Respect robots.txt and site ToS
- Rate-limit: 2-5s delays between requests, backoff on 429
- No programmatic CAPTCHA, paywall, login-wall, security-page, age-gate, IP-block, or access-control circumvention
- Manual CAPTCHA resolution only via Tier 3 (real browser)
```

### Key Differences from Claude Code

| Feature | Claude Code SKILL.md | Workbuddy instructions.md |
|---------|---------------------|--------------------------|
| File location | `.claude/skills/<name>/SKILL.md` | `.workbuddy/instructions.md` |
| Auto-trigger | `triggers:` frontmatter | Manual invocation only |
| Script references | Relative from skill dir | Relative from project root |
| Multi-file | Single SKILL.md + references | Usually flat instruction file |

### Notes

- Workbuddy may have different tool-calling capabilities than Claude Code — adjust Tier 1 strategy accordingly.
- The `references/handling_difficult_sites.md` file can be referenced directly in instructions.

---

## Maintaining Cross-Platform Compatibility

If you maintain this skill across multiple platforms:

```
project/
├── .claude/skills/web-pilot/SKILL.md    # Claude Code
├── CODEX.md                              # Codex CLI (copy from docs/)
├── .workbuddy/instructions.md            # Workbuddy (copy from docs/)
├── docs/portability.md                   # This guide
├── scripts/                              # Shared — works everywhere
│   ├── web_capture.js
│   ├── scraper_worker.js
│   └── scraper.py
└── references/
    └── handling_difficult_sites.md       # Shared — works everywhere
```

The **scripts/** and **references/** directories are platform-agnostic. Only the configuration/instruction files differ.

---

## Verification Checklist

After setting up on any platform, verify:

```bash
# Test Tier 2 script
node scripts/web_capture.js https://example.com --max-length 200

# Test stealth mode
node scripts/web_capture.js https://example.com --stealth --max-length 200

# Test JSON output  
node scripts/web_capture.js https://example.com --output json --quiet
```

All three should return content without hardcoded path errors.

---

> Last updated: 2026-07-16
