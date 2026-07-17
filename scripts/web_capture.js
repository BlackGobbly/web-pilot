#!/usr/bin/env node
/**
 * web_capture.js — Playwright-powered web page capture (Tier 2).
 *
 * Usage:
 *   node scripts/web_capture.js <url> [options]
 *
 * Options:
 *   --output <text|json|markdown|screenshot>   Output format (default: text)
 *   --timeout <ms>                              Navigation timeout (default: 30000)
 *   --wait <selector>                           Wait for a CSS selector before extracting
 *   --wait-time <ms>                            Extra wait time after page load (default: 1000)
 *   --viewport <width>x<height>                 Browser viewport (default: 1920x1080)
 *   --user-agent <string>                       Custom user agent string
 *   --extract <selector>                        Extract text from a specific CSS selector
 *   --full-page                                 Capture full-page screenshot
 *   --json-selectors <selectors>                Comma-separated CSS selectors as JSON
 *   --executable-path <path>                    Path to Chrome/Chromium executable
 *   --stealth                                   Enable compatibility tweaks for authorized testing
 *   --locale <locale>                           Browser locale (default: en-US)
 *   --timezone <timezone>                       Browser timezone (default: America/New_York)
 *   --max-length <chars>                        Max output chars in text mode (default: 10000)
 *   --quiet                                     Suppress stderr progress messages
 *   --headed                                    Show browser window (non-headless)
 *
 * Examples:
 *   node scripts/web_capture.js https://example.com
 *   node scripts/web_capture.js https://example.com --output json
 *   node scripts/web_capture.js https://example.com --output screenshot --full-page
 *   node scripts/web_capture.js https://example.com --stealth
 *   node scripts/web_capture.js https://example.com --executable-path /usr/bin/chromium
 */

const { chromium } = require('playwright');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HELP_TEXT = `
Usage:
  node scripts/web_capture.js <url> [options]

Options:
  --output <text|json|markdown|screenshot>   Output format (default: text)
  --timeout <ms>                              Navigation timeout (default: 30000)
  --wait <selector>                           Wait for a CSS selector before extracting
  --wait-time <ms>                            Extra wait after page load (default: 1000)
  --viewport <width>x<height>                 Browser viewport (default: 1920x1080)
  --user-agent <string>                       Custom user agent string
  --extract <selector>                        Extract text from a CSS selector
  --json-selectors <selectors>                Comma-separated CSS selectors as JSON
  --full-page                                 Capture full-page screenshot
  --headed                                    Show browser window
  --stealth                                   Compatibility tweaks for authorized testing
  --executable-path <path>                    Path to Chrome/Chromium executable
  --locale <locale>                           Browser locale (default: en-US)
  --timezone <timezone>                       Browser timezone (default: America/New_York)
  --max-length <chars>                        Max output chars in text mode (default: 10000)
  --quiet                                     Suppress progress messages on stderr
  -h, --help                                  Show this help

Examples:
  node scripts/web_capture.js https://example.com
  node scripts/web_capture.js https://example.com --output json
  node scripts/web_capture.js https://example.com --output screenshot --full-page
`.trim();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: null,
    output: 'text',
    timeout: 30000,
    wait: null,
    waitTime: 1000,
    viewport: '1920x1080',
    userAgent: null,
    extract: null,
    fullPage: false,
    jsonSelectors: null,
    headless: true,
    executablePath: null,
    stealth: false,
    locale: 'en-US',
    timezone: 'America/New_York',
    maxLength: 10000,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h':
      case '--help': opts.help = true; break;
      case '--output': opts.output = args[++i]; break;
      case '--timeout': opts.timeout = parseInt(args[++i], 10); break;
      case '--wait': opts.wait = args[++i]; break;
      case '--wait-time': opts.waitTime = parseInt(args[++i], 10); break;
      case '--viewport': opts.viewport = args[++i]; break;
      case '--user-agent': opts.userAgent = args[++i]; break;
      case '--extract': opts.extract = args[++i]; break;
      case '--json-selectors': opts.jsonSelectors = args[++i]; break;
      case '--executable-path': opts.executablePath = args[++i]; break;
      case '--stealth': opts.stealth = true; break;
      case '--locale': opts.locale = args[++i]; break;
      case '--timezone': opts.timezone = args[++i]; break;
      case '--max-length': opts.maxLength = parseInt(args[++i], 10); break;
      case '--quiet': opts.quiet = true; break;
      case '--full-page': opts.fullPage = true; break;
      case '--headed': opts.headless = false; break;
      default:
        if (!opts.url) opts.url = args[i];
        break;
    }
  }
  return opts;
}

// ── Optional compatibility init script (--stealth) ─────────────────

function getStealthScript() {
  return `
    // Override webdriver detection
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Override navigator properties
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Override chrome.runtime (if exists)
    window.chrome = { runtime: {} };

    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters)
    );
  `;
}

function log(msg, opts) {
  if (!opts.quiet) console.error(msg);
}

// ── Extractors ──────────────────────────────────────────────────────

async function extractText(page, opts) {
  if (opts.extract) {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.innerText.trim() : `[Selector "${sel}" not found]`;
    }, opts.extract);
  }
  return await page.evaluate(() => document.body.innerText.trim());
}

async function extractMarkdown(page, opts) {
  if (opts.extract) {
    const text = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.innerText.trim() : null;
    }, opts.extract);
    if (!text) return `[Selector "${opts.extract}" not found]`;
    return text;
  }

  return await page.evaluate(() => {
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    const sections = [];
    const headings = document.querySelectorAll('h1, h2, h3, h4');
    headings.forEach(h => {
      const section = { heading: h.innerText.trim(), level: h.tagName.toLowerCase(), content: [] };
      let sibling = h.nextElementSibling;
      while (sibling && !/^H[1-4]$/i.test(sibling.tagName)) {
        if (sibling.innerText?.trim()) section.content.push(sibling.innerText.trim());
        sibling = sibling.nextElementSibling;
      }
      if (section.heading || section.content.length) sections.push(section);
    });

    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map(p => p.innerText.trim())
      .filter(t => t.length > 20);

    return JSON.stringify({ title, metaDescription: metaDesc, sections, paragraphs: paragraphs.slice(0, 50) });
  });
}

async function extractJSON(page, opts) {
  if (opts.jsonSelectors) {
    const selectors = opts.jsonSelectors.split(',').map(s => s.trim());
    return await page.evaluate((sels) => {
      const result = {};
      sels.forEach(sel => {
        const elements = document.querySelectorAll(sel);
        result[sel] = Array.from(elements).map(el => el.innerText?.trim() || el.textContent?.trim() || '');
      });
      return JSON.stringify(result, null, 2);
    }, selectors);
  }

  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .slice(0, 50)
      .map(a => ({ text: a.innerText?.trim()?.substring(0, 100), href: a.href }));

    const images = Array.from(document.querySelectorAll('img[src]'))
      .slice(0, 20)
      .map(img => ({ alt: img.alt, src: img.src }));

    return JSON.stringify({
      title: document.title,
      url: window.location.href,
      meta: {
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') || '',
      },
      stats: {
        links: links.length,
        images: images.length,
        paragraphs: document.querySelectorAll('p').length,
      },
      links,
      images,
    }, null, 2);
  });
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (!opts.url) {
    console.error(HELP_TEXT);
    process.exit(1);
  }

  const viewport = opts.viewport.split('x').map(Number);
  const userAgent = opts.userAgent || DEFAULT_UA;

  let browser;
  try {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ];

    const launchOpts = {
      headless: opts.headless,
      args: launchArgs,
    };

    if (opts.executablePath) {
      launchOpts.executablePath = opts.executablePath;
    }

    browser = await chromium.launch(launchOpts);

    const context = await browser.newContext({
      userAgent,
      viewport: { width: viewport[0] || 1920, height: viewport[1] || 1080 },
      locale: opts.locale,
      timezoneId: opts.timezone,
      permissions: [],
    });

    const page = await context.newPage();

    // Apply compatibility script only when --stealth flag is set
    if (opts.stealth) {
      await page.addInitScript(getStealthScript());
      log('Compatibility mode enabled', opts);
    }

    // Navigate
    log(`🌐 Navigating to ${opts.url} ...`, opts);
    await page.goto(opts.url, {
      timeout: opts.timeout,
      waitUntil: 'domcontentloaded',
    });

    // Wait for optional selector
    if (opts.wait) {
      log(`⏳ Waiting for selector "${opts.wait}" ...`, opts);
      await page.waitForSelector(opts.wait, { timeout: opts.timeout });
    }

    // Extra wait for JS rendering
    if (opts.waitTime > 0) {
      await page.waitForTimeout(opts.waitTime);
    }

    const finalUrl = page.url();
    const title = await page.title();

    // Handle output
    switch (opts.output) {
      case 'json': {
        const data = await extractJSON(page, opts);
        const result = { url: finalUrl, title, capturedAt: new Date().toISOString(), data: JSON.parse(data) };
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'markdown': {
        const raw = await extractMarkdown(page, opts);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }

        if (parsed && parsed.title) {
          console.log(`# ${parsed.title}\n`);
          if (parsed.metaDescription) console.log(`> ${parsed.metaDescription}\n`);
          for (const section of parsed.sections || []) {
            console.log(`${'#'.repeat(parseInt(section.level.charAt(1)) + 1)} ${section.heading}\n`);
            for (const content of section.content) console.log(`${content}\n`);
          }
        } else {
          console.log(raw);
        }
        break;
      }
      case 'screenshot': {
        const timestamp = Date.now();
        const filename = `capture_${timestamp}.png`;
        const filepath = path.join(process.cwd(), filename);
        await page.screenshot({ path: filepath, fullPage: opts.fullPage });
        console.log(JSON.stringify({ url: finalUrl, title, screenshot: filepath }));
        break;
      }
      default: {
        const text = await extractText(page, opts);
        const maxLen = opts.maxLength > 0 ? opts.maxLength : Infinity;
        const truncated = text.length > maxLen
          ? text.substring(0, maxLen) + `\n\n[... ${text.length - maxLen} more chars truncated]`
          : text;
        console.log(`URL: ${finalUrl}`);
        console.log(`Title: ${title}`);
        console.log(`---CONTENT---`);
        console.log(truncated);
        break;
      }
    }

    log(`✅ Done: ${finalUrl}`, opts);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
