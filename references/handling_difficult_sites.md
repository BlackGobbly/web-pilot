# Handling Difficult Sites — Escalation Guide

## Overview

Some websites require escalating beyond simple HTTP fetching because their content is rendered dynamically, gated by authentication, or protected by access controls. This guide covers detection and handling strategies for authorized work only, following the web-pilot 3-tier escalation model.

## Detection Patterns

| Obstacle | Signs | Recommended Tier |
|----------|-------|:----------------:|
| **JS-rendered content** | Empty containers, "loading..." text, minimal HTML, SPA framework markers (React root, Vue app) | Tier 2 |
| **Bot detection** | 403/429 responses, CAPTCHA redirect, "Please enable JavaScript" messages | Tier 2 → Tier 3 |
| **Login wall** | Redirect to login page, auth modal, 401 response | Tier 3 |
| **CAPTCHA** | "Are you a robot?", "请稍候…", reCAPTCHA widget | Tier 3 (manual) |
| **Rate limiting** | 429 Too Many Requests, progressively slower responses, temporary IP blocks | Tier 2 (with delays) |
| **Lazy-loaded data** | Content appears on scroll, "Load more" buttons, infinite scroll | Tier 2 (scroll/click) |
| **API-backed data** | Network requests populate the page after initial load | Tier 2 (API sniffing) |

---

## Pattern-Specific Tactics

### 1. JS-Rendered Content

**Tier 2 approach** (`web_capture.js`):

```bash
# Basic approach — wait for content to render
node scripts/web_capture.js https://example.com --wait .content-class --wait-time 3000

# If specific selectors are known
node scripts/web_capture.js https://example.com --extract ".article-body"

# Extract multiple selectors as JSON
node scripts/web_capture.js https://example.com --json-selectors "h1,.price,.description"
```

**If an authorized target mis-detects automation:**
```bash
# Enable compatibility mode for authorized testing
node scripts/web_capture.js https://example.com --stealth
```

**If the site still blocks access, stop unless the user confirms authorization and manual browser use is appropriate.**

### 2. CAPTCHA / "Are You a Robot?"

CAPTCHA requires **human intervention**. It cannot be solved programmatically.

**Tier 3 approach (CDP real browser):**

1. Start Chrome with remote debugging:
   ```bash
   # macOS
   open -na "Google Chrome" --args --remote-debugging-port=9223 --no-first-run

   # Windows (Git Bash)
   "/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9223 --no-first-run
   ```

2. Connect via agent-browser and navigate to the target URL:
   ```bash
   agent-browser connect http://127.0.0.1:9223
   agent-browser open "https://example.com/search?q=test"
   ```

3. **The user** manually completes the CAPTCHA in the real Chrome window.

4. After verification, the session persists — continue with the same CDP session:
   ```bash
   agent-browser snapshot
   agent-browser eval "document.title"
   ```

### 3. Login / Authentication

**Tier 3 approach:**

Some sites require login. The CDP session preserves cookies, so you only need to log in once.

```bash
# Connect and navigate to login page
agent-browser connect http://127.0.0.1:9223
agent-browser open "https://example.com/login"

# User fills in credentials manually in the real Chrome window
# After successful login, navigate to the target page
agent-browser open "https://example.com/protected-data"

# Session cookies are preserved for subsequent requests
agent-browser snapshot
```

**Session persistence:** Using the same `AGENT_BROWSER_SESSION` name preserves cookies across sessions:
```bash
export AGENT_BROWSER_SESSION=my-session-name
```

### 4. Rate Limiting

When a site returns 429 or starts throttling:

```bash
# In Tier 2: add delays between requests
node scripts/web_capture.js https://example.com --wait-time 5000

# In Tier 3: wait between operations
agent-browser wait 5
```

**General guidelines:**
- Start with 2-3 second delays
- On 429 responses, back off exponentially (5s → 10s → 20s)
- Add jitter (randomize delay by ±30%) to avoid pattern detection
- Respect `Retry-After` headers

### 5. Pagination

Three common pagination patterns and how to handle each:

**URL-based pagination:**
```
https://example.com/news?page=2
https://example.com/news/index_2.html
```
Use `scraper_worker.js` with `url:index_{page}.html` pattern.

**Click-based pagination ("Next" button):**
```html
<a class="next-page" href="?page=2">Next</a>
```
Use `scraper_worker.js` with `click:.next-page`.

**Infinite scroll / "Load More":**
Use Tier 3 CDP with repeated scroll-and-snapshot cycles:
```bash
agent-browser eval "window.scrollTo(0, document.body.scrollHeight)"
agent-browser wait 2
agent-browser snapshot
```

---

## Case Study: ScienceDirect (Elsevier)

ScienceDirect employs heavy anti-scraping measures including CAPTCHA and JS-based content loading.

### Strategy: Tier 3 only

```bash
# Connect CDP
agent-browser connect http://127.0.0.1:9223

# Search with optimized parameters
agent-browser open "https://www.sciencedirect.com/search?qs=<keywords>&date=2024-2026&show=100"
```

### Key CSS selectors

| Element | Selector | Notes |
|---------|----------|-------|
| Result items | `.ResultItem` | `<li>` elements, one per result |
| Title | `.anchor-text` | Inside `<h2>` within each result |
| DOI | `data-doi` attribute | On the `.ResultItem` element |
| Authors | `.author` | `<span>` elements |
| Journal | `.subtype-srctitle-link .anchor-text` | Journal/conference name |
| Date | `.srctitle-date-fields` | Publication year |
| Abstract | `.abstract-section` | Requires clicking Abstract button to load |
| Abstract button | `.preview-button` | textContent contains "Abstract" |

### Extraction workflow

```bash
# 1. Handle any CAPTCHA manually
# 2. Wait for results to load
sleep 6

# 3. Expand all abstracts
agent-browser click "Abstract" --all
sleep 5

# 4. Extract results via JavaScript
agent-browser eval "(() => {
  const items = document.querySelectorAll('.ResultItem');
  const results = [];
  for(let i = 0; i < Math.min(items.length, 100); i++) {
    const item = items[i];
    const titleEl = item.querySelector('.anchor-text');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const doi = item.getAttribute('data-doi') || '';
    const authorEls = item.querySelectorAll('.author');
    const authors = Array.from(authorEls).map(a => a.textContent.trim()).join('; ');
    const journalEl = item.querySelector('.subtype-srctitle-link .anchor-text');
    const journal = journalEl ? journalEl.textContent.trim() : '';
    const dateEl = item.querySelector('.srctitle-date-fields');
    const date = dateEl ? dateEl.textContent.trim() : '';
    if(title) results.push({ doi, title, authors, journal, date });
  }
  return JSON.stringify(results, null, 2);
})()"
```

### Pagination

ScienceDirect limits results to ~1200 per query. Use `&show=100` for max items per page, navigate with offset:

```bash
agent-browser open "https://www.sciencedirect.com/search?qs=<keywords>&date=2024-2026&show=100&offset=100"
```

### Known limitations
- Abstracts require clicking each item's Abstract button (or use `--all` flag)
- Some institutional networks may be blocked due to past scraping activity
- Results may be capped at ~1200 per query
- Session persistence helps avoid repeated CAPTCHA challenges

---

## Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Empty content returned | JS-rendered page | Upgrade to Tier 2, add `--wait` |
| "Please enable JavaScript" | SPA without SSR | Tier 2 Playwright |
| 403 / "Access denied" | IP blocked / restricted access | Stop unless automated access is authorized; otherwise use official APIs or request access |
| CAPTCHA page | Anti-bot trigger | Tier 3 CDP + manual solve |
| Redirect to login | Auth required | Tier 3 CDP + manual login |
| 429 Too Many Requests | Rate limited | Add delays, exponential backoff |
| Results truncated | Pagination needed | Add `pages=0` or `pagination` config |
| Browser detected as automated | Automation not accepted by target site | Stop unless authorized; for owned/test environments, try `--stealth` or Tier 3 CDP |
| Script timeout | Page too slow / JS-heavy | Increase `--timeout` or switch to Tier 3 |

---

## Alternative Sources

When a site is persistently blocked, consider these alternatives:

| Target | Alternative | Access Method |
|--------|------------|---------------|
| ScienceDirect | Semantic Scholar, arXiv, Unpaywall | Tier 1 WebFetch / API |
| Google Scholar | Semantic Scholar API, CrossRef API | Tier 1 WebFetch |
| News sites | RSS feeds, Google News, archive.is | Tier 1 |
| E-commerce | Official APIs, Google Shopping, price aggregators | Varies |
| Social media | Official APIs (where available) | API |

---

> Last updated: 2026-07-16
