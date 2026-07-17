#!/usr/bin/env node
/**
 * scraper_worker.js — Config-driven batch scraping engine.
 *
 * Reads JSON configs from stdin, executes them via Playwright, and outputs
 * results as JSON to stdout. Designed to be called by scraper.py or used
 * directly in pipes.
 *
 * Config schema (per site):
 *   url         - Target URL (required)
 *   source      - Site name for attribution
 *   container   - CSS selector for the list container
 *   item        - CSS selector for each item row
 *   title       - CSS selector for the title element within an item
 *   date        - CSS selector for the date element within an item
 *   link        - CSS selector + attribute (e.g. "a@href")
 *   pagination  - "click:<selector>" or "url:<pattern>" (see below)
 *   pages       - Number of pages to scrape (0 = all pages)
 *   mode        - "list" (default) or "table"
 *   preclick    - Pipe-separated tree node labels to expand before scraping
 *   filterWords - Array of navigation words to exclude (default: English)
 *   locale      - Browser locale (default: en-US)
 *
 * Pagination modes:
 *   click:.next-page   - Click a "next page" button/link
 *   url:index_{page}.html - Build paginated URLs with {page} placeholder
 *
 * Usage:
 *   echo '[{"url":"https://example.com","container":"ul.news-list","item":"li"}]' | node scraper_worker.js
 */

const { chromium } = require('playwright');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', async () => {
    try {
        const configs = JSON.parse(input);
        const results = await runAll(configs);
        console.log(JSON.stringify(results));
    } catch (err) {
        console.error(JSON.stringify({ error: err.message }));
        process.exit(1);
    }
});

async function runAll(configs) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const allResults = [];

    for (const cfg of configs) {
        try {
            process.stderr.write(`[worker] ${cfg.source || cfg.url}... `);
            const items = await scrapeSite(browser, cfg);
            allResults.push(...items);
            process.stderr.write(`${items.length} items\n`);
        } catch (err) {
            process.stderr.write(`[error] ${err.message}\n`);
        }
    }

    await browser.close();
    return allResults;
}

// ---- Parse pagination config ----
function parsePagination(cfg) {
    const p = (cfg.pagination || '').trim();
    if (!p) return { mode: 'none' };

    if (p.startsWith('click:')) {
        return { mode: 'click', selector: p.slice(6).trim() };
    }
    if (p.startsWith('url:')) {
        return { mode: 'url', pattern: p.slice(4).trim() };
    }
    // Bare CSS selector defaults to click mode
    return { mode: 'click', selector: p };
}

// ---- Build paginated URL ----
function buildPageUrl(baseUrl, pattern, pageNum) {
    if (pageNum === 0) return baseUrl;

    const urlObj = new URL(baseUrl);
    const dir = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
    const filename = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1);
    let newFilename;

    if (pattern.includes('{page}')) {
        newFilename = pattern.replace('{page}', String(pageNum));
    } else {
        const dotIdx = filename.lastIndexOf('.');
        const base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
        const ext = dotIdx > 0 ? filename.substring(dotIdx) : '';
        newFilename = `${base}_${pageNum}${ext}`;
    }

    urlObj.pathname = dir + newFilename;
    return urlObj.href;
}

// ---- Detect total pages ----
function detectTotalPages(page) {
    return page.evaluate(() => {
        // 1) Try generic pagination link patterns
        const pageLinks = document.querySelectorAll('.pagination a, .pagenav a, [aria-label*="page" i], a[rel="next"], a[rel="last"]');
        if (pageLinks.length > 0) {
            const nums = [];
            pageLinks.forEach(a => {
                const n = parseInt(a.textContent.trim());
                if (!isNaN(n)) nums.push(n);
            });
            if (nums.length > 0) return Math.max(...nums);
        }

        // 2) Try common text patterns: "Page X of Y", "1 / 20", "共X页"
        const bodyText = document.body.innerText || '';
        const pageOf = bodyText.match(/page\s*\d+\s*of\s*(\d+)/i);
        if (pageOf) return parseInt(pageOf[1]);

        const slash = bodyText.match(/\/\s*(\d+)\s*(?:页|page)?/i);
        if (slash) return parseInt(slash[1]);

        const total = bodyText.match(/共\s*(\d+)\s*页/);
        if (total) return parseInt(total[1]);

        // 3) Check for createPageHTML (common in older Chinese CMS)
        const html = document.body.innerHTML || '';
        const createPage = html.match(/createPageHTML\s*\(\s*(\d+)/);
        if (createPage) return parseInt(createPage[1]);

        return 0;
    });
}

// ---- Extract list items ----
async function extractItems(page, cfg) {
    return await page.evaluate((cfg) => {
        const container = cfg.container ? document.querySelector(cfg.container) : document.body;
        if (!container) return [];

        let itemEls;
        if (cfg.item) {
            itemEls = container.querySelectorAll(cfg.item);
        } else {
            itemEls = container.querySelectorAll('li, .item, .news-item, tr, div[class*="item"]');
        }

        // Fallback: extract all links if no items found
        if (!itemEls || itemEls.length === 0) {
            const links = container.querySelectorAll('a[href]');
            return Array.from(links)
                .filter(a => { const t = (a.textContent || '').trim().replace(/\s+/g, ' '); return t.length >= 4; })
                .map(a => {
                    let d = '';
                    let p = a.parentElement;
                    for (let i = 0; i < 3 && p; i++) {
                        const txt = p.textContent;
                        const m = txt.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/);
                        if (m) { d = m[1]; break; }
                        p = p.parentElement;
                    }
                    return { t: (a.textContent || '').trim().replace(/\s+/g, ' '), d, h: a.getAttribute('href') || '' };
                });
        }

        return Array.from(itemEls).map(el => {
            let titleEl = cfg.title ? el.querySelector(cfg.title) : el.querySelector('a[href]');
            if (!titleEl) titleEl = el;
            let t = titleEl.getAttribute('title') || titleEl.textContent || '';
            t = t.trim().replace(/\s+/g, ' ');

            let d = '';
            if (cfg.date) {
                const dateEl = el.querySelector(cfg.date);
                if (dateEl) {
                    const txt = dateEl.textContent.trim();
                    const m = txt.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/);
                    if (m) d = m[1];
                }
            } else {
                const txt = el.textContent;
                const m = txt.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/);
                if (m) d = m[1];
            }

            let h = '';
            const linkSel = cfg.link ? cfg.link.split('@')[0] : 'a[href]';
            let linkEl = cfg.link ? el.querySelector(linkSel) : el.querySelector('a[href]');
            if (!linkEl && el.matches && el.matches('a[href]')) linkEl = el;
            if (linkEl) {
                const attr = cfg.link && cfg.link.includes('@') ? cfg.link.split('@')[1] : 'href';
                h = linkEl.getAttribute(attr) || '';
            }

            return { t, d, h };
        });
    }, cfg);
}

function dedupAndFilter(items, seenTitles, filterWords) {
    // Default filter words: English navigation terms
    const words = filterWords || ['Previous', 'Next', 'First', 'Last', 'Page', 'Go', 'Home'];
    const result = [];
    for (const it of items) {
        if (!it.t || it.t.length < 4) continue;
        if (words.some(w => it.t.toLowerCase().includes(w.toLowerCase()))) continue;
        const key = it.t.slice(0, 30);
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        result.push(it);
    }
    return result;
}

function normalizeItems(items, cfg) {
    const source = cfg.source || '';
    return items.map(it => {
        let link = it.h;
        if (link && !link.startsWith('http') && !link.startsWith('javascript:') && link !== '#') {
            try { link = new URL(link, cfg.url).href; } catch(e) { link = ''; }
        } else if (!link || link.startsWith('javascript:') || link === '#') {
            link = '';
        }

        let date = it.d || '';
        if (!date && link) {
            const urlDate = link.match(/t(\d{4})(\d{2})(\d{2})/);
            if (urlDate) date = `${urlDate[1]}-${urlDate[2]}-${urlDate[3]}`;
            else {
                const urlDate2 = link.match(/(\d{4})(\d{2})(\d{2})/);
                if (urlDate2 && urlDate2[1] >= '2000') date = `${urlDate2[1]}-${urlDate2[2]}-${urlDate2[3]}`;
            }
        }

        const dm = date.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (dm) date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`;
        else date = '';

        return { date, source, title: it.t, link };
    });
}

// ---- Table data extraction ----
async function extractTable(page, cfg) {
    const tableSel = cfg.container || 'table';
    return await page.evaluate((sel) => {
        const table = document.querySelector(sel);
        if (!table) return [];

        const rows = table.querySelectorAll('tr');
        if (rows.length < 2) return [];

        const headers = [];
        const headerCells = rows[0].querySelectorAll('th, td');
        headerCells.forEach(h => headers.push((h.textContent || '').trim()));

        const result = [];
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length === 0) continue;

            const rowData = {};
            let title = '', date = '', link = '';
            cells.forEach((cell, j) => {
                const key = headers[j] || `col${j}`;
                let val = (cell.textContent || '').trim().replace(/\s+/g, ' ');
                const anchor = cell.querySelector('a');
                rowData[key] = val;
                if (anchor) rowData[key + '_link'] = anchor.getAttribute('href') || '';

                // Smart column detection: match title columns by keyword
                if (/name|title|headline|topic|subject|标准名称|名称|标题/i.test(key) && !title) title = val;
                // Date columns
                if (/date|published|日期|发布|date/i.test(key) && !date) {
                    const dm = val.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
                    if (dm) date = dm[1];
                }
                if (anchor && !link) link = anchor.getAttribute('href') || '';
            });

            if (!title && rowData[headers[0]]) title = rowData[headers[0]];

            const extraFields = {};
            for (const [k, v] of Object.entries(rowData)) {
                if (k.endsWith('_link')) continue;
                extraFields[k] = v;
            }

            if (title) {
                result.push({ t: title, d: date, h: link, extra: extraFields, rowData });
            }
        }
        return result;
    }, tableSel);
}

// ---- Generic table pagination (next-page navigation) ----
async function tableNextPage(page) {
    return await page.evaluate(() => {
        // Strategy 1: aria-label="Next page" or rel="next"
        const nextByAttr = document.querySelector('a[aria-label="Next page"], a[aria-label="Next"], a[rel="next"], button[aria-label="Next page"]');
        if (nextByAttr && !nextByAttr.disabled && !nextByAttr.classList.contains('disabled')) {
            if (nextByAttr.tagName === 'A') {
                const href = nextByAttr.getAttribute('href');
                if (href && href !== '#') return null; // return null to signal URL-based navigation
            }
            nextByAttr.click();
            return true;
        }

        // Strategy 2: standard pagination links (Chinese CMS pattern: a.pagingNormal[title="下一页"])
        const nextLink = document.querySelector('a.pagingNormal[title*="Next" i], a.pagingNormal[title*="下一页"]');
        if (nextLink && !nextLink.classList.contains('pagingDisable')) {
            const onclick = nextLink.getAttribute('onclick') || '';
            const m = onclick.match(/value=(\d+)/);
            if (m) {
                const input = document.getElementById('currentPage');
                if (input) input.value = m[1];
                const form = input.form;
                if (form) { form.submit(); return true; }
            }
            nextLink.click();
            return true;
        }

        // Strategy 3: generic "next" text match
        const allLinks = document.querySelectorAll('a, button');
        for (const el of allLinks) {
            const text = (el.textContent || '').trim();
            if (/^(next|下一页|下页|后页|»|›|>)$/i.test(text) && !el.disabled && !el.classList.contains('disabled')) {
                el.click();
                return true;
            }
        }

        return false;
    });
}

// ---- Scrape a single site ----
async function scrapeSite(browser, cfg) {
    const pagination = parsePagination(cfg);
    const scrapeAll = !cfg.pages || cfg.pages === 0 || cfg.pages === '0';
    let maxPages = scrapeAll ? 9999 : (parseInt(cfg.pages) || 1);
    if (scrapeAll && pagination.mode === 'click' && maxPages > 50) maxPages = 50;

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: cfg.locale || 'en-US',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const allItems = [];
    const seenTitles = new Set();

    // Page 1
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Pre-click: expand tree nodes (legacy support for Chinese CMS layui-tree)
    const preclick = cfg.preclick || '';
    if (preclick) {
        const names = preclick.split('|').map(s => s.trim());
        for (const name of names) {
            try {
                const clicked = await page.evaluate((n) => {
                    const spans = document.querySelectorAll('.layui-tree-txt');
                    for (const s of spans) {
                        if (s.textContent.trim().includes(n)) {
                            const entry = s.closest('.layui-tree-entry');
                            if (entry) {
                                entry.click();
                                const icon = entry.querySelector('.layui-tree-iconClick');
                                if (icon) icon.click();
                            }
                            return true;
                        }
                    }
                    return false;
                }, name);
                if (clicked) process.stderr.write(`[click:${name}] `);
                await page.waitForTimeout(1500);
            } catch(e) {
                process.stderr.write(`[tree click failed:${e.message}] `);
            }
        }
    }

    let items, newItems;
    const filterWords = cfg.filterWords;
    if (cfg.mode === 'table') {
        items = await extractTable(page, cfg);
        newItems = items.filter(it => { const k = it.t.slice(0, 30); if (seenTitles.has(k)) return false; seenTitles.add(k); return true; });
    } else {
        items = await extractItems(page, cfg);
        newItems = dedupAndFilter(items, seenTitles, filterWords);
    }
    allItems.push(...newItems);
    process.stderr.write(`p1:${newItems.length} `);

    // Detect total pages for URL pagination
    let totalPages = 0;
    if (scrapeAll && pagination.mode === 'url') {
        try {
            totalPages = await detectTotalPages(page);
            if (totalPages > 0) { maxPages = totalPages; process.stderr.write(`(${totalPages} pages) `); }
        } catch(e) {}
    }

    // Pages 2+
    for (let pn = 2; pn <= maxPages; pn++) {
        if (pagination.mode === 'click') {
            let clicked = false;
            try {
                clicked = await page.evaluate((sel) => {
                    let btn = null;
                    // 1) Standard CSS selector
                    try { btn = document.querySelector(sel); } catch(e) {}
                    // 2) XPath text match
                    if (!btn) {
                        const texts = sel.replace(/^text:/, '').split('|');
                        for (const t of texts) {
                            const xpath = `//a[contains(text(), '${t}')] | //button[contains(text(), '${t}')] | //span[contains(text(), '${t}')]`;
                            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                            if (result.singleNodeValue) { btn = result.singleNodeValue; break; }
                        }
                    }
                    // 3) Full text search fallback
                    if (!btn) {
                        const text = sel.replace(/^text:/, '');
                        const all = document.querySelectorAll('a, button, span, div, li');
                        for (const el of all) {
                            if (el.textContent.trim().includes(text) && el.offsetParent !== null) {
                                btn = el; break;
                            }
                        }
                    }
                    if (!btn) return false;
                    if (btn.getAttribute('onclick')) {
                        const fn = new Function(btn.getAttribute('onclick'));
                        fn.call(btn);
                        return true;
                    }
                    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
                    btn.click(); return true;
                }, pagination.selector);
            } catch(e) {}
            if (!clicked) break;
            await page.waitForTimeout(3000);
            try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch(e) {}

        } else if (pagination.mode === 'url') {
            if (totalPages > 0 && pn > totalPages) break;
            if (totalPages === 0 && pn > 50) break;
            try {
                await page.goto(buildPageUrl(cfg.url, pagination.pattern || '', pn - 1), { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(1500);
            } catch(e) { break; }
        } else {
            break;
        }

        // Extract current page
        if (cfg.mode === 'table') {
            items = await extractTable(page, cfg);
            newItems = items.filter(it => { const k = it.t.slice(0, 30); if (seenTitles.has(k)) return false; seenTitles.add(k); return true; });
        } else {
            items = await extractItems(page, cfg);
            newItems = dedupAndFilter(items, seenTitles, filterWords);
        }

        if (newItems.length === 0) {
            if (cfg.mode === 'table') break;
            break;
        }
        allItems.push(...newItems);
        process.stderr.write(`p${pn}:${newItems.length} `);
    }

    await context.close();
    return normalizeItems(allItems, cfg);
}
