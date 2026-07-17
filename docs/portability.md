# Platform Compatibility Guide

web-pilot is platform-agnostic at its core: the shared scripts in `scripts/`, the Node.js dependencies in `package.json`, the Python dependency in `requirements.txt`, and the guidance in `references/` can be used by any ai-agent workflow that can run shell commands.

This document only describes compatibility notes for Claude Code, Codex, and Workbuddy. The main README stays agent-neutral.

---

## Shared Components

| File | Purpose | Platform dependency |
|------|---------|---------------------|
| `scripts/web_capture.js` | Tier 2 Playwright capture CLI | None beyond Node.js |
| `scripts/scraper_worker.js` | JSON-driven batch scraping worker | None beyond Node.js |
| `scripts/scraper.py` | Excel-driven Python orchestrator | Python + `openpyxl` |
| `package.json` | Node.js dependency and test scripts | Standard npm |
| `requirements.txt` | Python dependency declaration | Standard pip |
| `references/handling_difficult_sites.md` | Authorized difficult-site handling guidance | Plain Markdown |

Install the shared runtime dependencies with:

```bash
npm install
npm run install:browsers
pip install -r requirements.txt
```

Verify the shared script layer with:

```bash
node scripts/web_capture.js https://example.com --max-length 200
node scripts/web_capture.js https://example.com --output json --quiet
```

---

## Claude Code Compatibility

Claude Code can use the included skill package at:

```text
.claude/skills/web-pilot/SKILL.md
```

Use this layout when you want Claude Code to auto-load the web-pilot instructions from a project:

```text
project/
├── .claude/skills/web-pilot/SKILL.md
├── .claude/skills/web-pilot/references/handling_difficult_sites.md
├── scripts/
├── package.json
└── requirements.txt
```

Typical copy flow:

```bash
mkdir -p .claude/skills
cp -r /path/to/web-pilot/.claude/skills/web-pilot .claude/skills/web-pilot
cp -r /path/to/web-pilot/scripts .
cp /path/to/web-pilot/package.json .
cp /path/to/web-pilot/requirements.txt .
```

Compatibility notes:

- Claude Code uses `SKILL.md` with YAML frontmatter and Markdown instructions.
- The `triggers`, `risk`, `tools`, and `tags` fields are Claude Code-specific metadata.
- Tier 1 should use whatever fetch capability is available in the active Claude Code environment.
- Tier 2 and Tier 3 use the shared scripts and `agent-browser` workflow described in the skill.

---

## Codex Compatibility

Codex can use web-pilot as ordinary project tooling. Place the shared scripts in the repo and add project instructions in `CODEX.md`.

Example `CODEX.md`:

```markdown
# web-pilot: Web Capture & Browser Automation

Use the shared scripts in `scripts/` for authorized web capture and browser automation.

## Available Commands

- `node scripts/web_capture.js <url>` — Playwright page capture
- `node scripts/web_capture.js <url> --output json` — structured capture
- `node scripts/web_capture.js <url> --output screenshot` — screenshot capture
- `echo '[{...}]' | node scripts/scraper_worker.js` — JSON-driven batch scraping
- `python scripts/scraper.py --excel config.xlsx` — Excel-driven scraping workflow

## Escalation Strategy

1. Static fetch for simple pages and APIs.
2. Playwright rendering for JavaScript-rendered pages.
3. User-supervised real-browser CDP only when the user is authorized to access the page.

## Safety Rules

- Respect robots.txt, site terms, API policies, rate limits, and privacy rules.
- Do not bypass login walls, paywalls, CAPTCHA, security pages, age gates, IP blocks, or other access controls.
- Stop when access is denied unless the user confirms authorization and provides an approved path.
```

Compatibility notes:

- Codex reads ordinary project instructions such as `CODEX.md`; it does not use Claude Code skill frontmatter.
- Codex can run the same Node.js and Python commands from the project root.
- If no agent-native fetch tool is available, use `curl`, a small script, or the Playwright capture command for Tier 1/2.

---

## Workbuddy Compatibility

Workbuddy and similar agent-workspace tools can use web-pilot through a plain instruction file, commonly `.workbuddy/instructions.md`.

Example `.workbuddy/instructions.md`:

```text
# web-pilot

Use `scripts/web_capture.js` and `scripts/scraper_worker.js` for authorized web capture.

## Common Commands

node scripts/web_capture.js <url>
node scripts/web_capture.js <url> --output json
node scripts/web_capture.js <url> --output screenshot

## Responsible Use

- Use only for pages the user owns, is authorized to test, or may lawfully access.
- Respect robots.txt, site terms, rate limits, and privacy requirements.
- Do not bypass access controls, CAPTCHA, paywalls, login walls, or security checks.
```

Compatibility notes:

- Workbuddy generally uses plain Markdown instructions rather than skill metadata.
- Keep script paths relative to the project root.
- The shared `references/handling_difficult_sites.md` file can be linked from the instruction file.

---

## Compatibility Matrix

| Capability | Claude Code | Codex | Workbuddy |
|------------|-------------|-------|-----------|
| Shared Node.js scripts | Yes | Yes | Yes |
| Shared Python script | Yes | Yes | Yes |
| Auto-loaded skill metadata | Yes, via `.claude/skills/.../SKILL.md` | No | No |
| Plain project instructions | Optional | Yes, via `CODEX.md` | Yes, via `.workbuddy/instructions.md` |
| Tier 1 static fetch | Environment-dependent | Environment-dependent | Environment-dependent |
| Tier 2 Playwright capture | Yes | Yes | Yes |
| Tier 3 CDP browser workflow | Yes, if `agent-browser` is installed | Yes, if `agent-browser` is installed | Yes, if `agent-browser` is installed |

---

> Last updated: 2026-07-17
