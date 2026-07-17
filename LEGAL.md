# Legal and Responsible Use

web-pilot is a browser automation and web capture toolkit for authorized testing, research, QA, documentation, and data extraction workflows. It is not designed or intended to defeat access controls, evade site restrictions, or collect data unlawfully.

This document is not legal advice. Laws, contracts, and platform rules vary by jurisdiction and target site. Review the target site's terms, robots.txt, API policies, and applicable law before use.

## Permitted Use

- Pages, systems, and applications you own or are authorized to test.
- Publicly available pages where automated access is allowed by the site's terms, robots.txt, API policy, or written permission.
- QA, accessibility, preview validation, screenshot capture, and regression testing for systems under your control.
- Good-faith security testing only when authorized and conducted in a way designed to avoid harm.
- Research and archival workflows that respect privacy, rate limits, attribution, and applicable platform policies.

## Prohibited Use

- Bypassing or defeating login walls, paywalls, CAPTCHA, age gates, security pages, IP blocks, rate limits, or other access controls.
- Using credentials, cookies, sessions, or accounts without authorization.
- Collecting, selling, or using personal data without a lawful basis and required notices or consent.
- Sending spam, unsolicited outreach, phishing, fraud, harassment, or coordinated inauthentic activity.
- Ignoring cease-and-desist notices, account revocation, explicit denial of authorization, or other clear access restrictions.
- Overloading services or causing operational harm through excessive request volume.
- Republishing copyrighted or licensed content without permission, a valid exception, or proper attribution.

## Operational Safeguards

- Prefer official APIs and data exports when available.
- Check robots.txt and site terms before automated collection.
- Use conservative request rates, jitter, and backoff; respect `429` and `Retry-After`.
- Minimize personal data collection; avoid sensitive data unless clearly authorized.
- Store collected data securely and delete it when no longer needed.
- Stop immediately when a site blocks access, presents a security challenge, or communicates that automation is not authorized.
- Document authorization for any testing against systems you do not own.

## CAPTCHA and Login Guidance

Tier 3 supports user-supervised browser sessions for cases where the user is legitimately authorized to access a page. It must not be used to solve, defeat, or outsource CAPTCHA or to bypass login, payment, geographic, age, or security restrictions. If a challenge appears, the user may manually proceed only when they are authorized to do so.
