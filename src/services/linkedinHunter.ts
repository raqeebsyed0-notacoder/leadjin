/**
 * LeadJin Hunter Module — Strategic Entity Discovery
 *
 * Regional Intelligence extraction for Saudi Arabian B2B ecosystem.
 * Discovers executive decision-makers from LinkedIn strategic entities.
 *
 * Modes:
 *   - Stealth Mode: Puppeteer with session authentication for deep access
 *   - Recon Mode: Google dorking fallback for public profile reconnaissance
 *
 * Language: "Strategic Entities", "Regional Intelligence", "Decision Architect"
 */

import puppeteer from 'puppeteer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutiveProfile {
  name: string;
  title: string;
  linkedinUrl: string;
  email?: string;
  phone?: string;
  company?: string;
  location?: string;
  confidence: number;
  source: 'linkedin_stealth' | 'linkedin_dork' | 'public_recon';
  /**
   * How the email address was obtained.
   * 'pattern-guess' = inferred via first.last@domain — treat as untrusted until verified.
   * 'scraped'       = found on a real source page (future).
   * 'api'           = returned by a paid enrichment API (future).
   */
  emailSource?: 'pattern-guess' | 'scraped' | 'api';
  /**
   * Highest verification rung the email has passed.
   * 'unverified' = no checks done yet.
   * 'mx_ok'      = domain has MX records but mailbox not confirmed.
   * 'probable'   = SMTP RCPT returned 250 on a non-catch-all domain.
   * 'verified'   = cross-referenced on a real source page.
   */
  emailVerification?: 'unverified' | 'mx_ok' | 'probable' | 'verified';
}

export interface HuntResult {
  domain: string;
  companyName?: string;
  executives: ExecutiveProfile[];
  intelligenceGatheredAt: string;
  durationMs: number;
  method: 'stealth' | 'recon' | 'hybrid';
  strategicEntityCount: number;
}

export interface HuntOptions {
  domain: string;
  linkedinCookie?: string;
  maxExecutives?: number;
  targetTitles?: string[];
}

// ---------------------------------------------------------------------------
// Regional Intelligence: Priority Titles for Saudi B2B
// ---------------------------------------------------------------------------

const STRATEGIC_TITLES_PRIORITY = [
  // C-Suite (Highest Priority)
  'CEO', 'Chief Executive Officer',
  'MD', 'Managing Director',
  'President',
  'Chairman', 'Chairperson',
  'Founder', 'Co-Founder',
  // Strategy & Growth
  'CCO', 'Chief Commercial Officer',
  'Chief Strategy Officer',
  'Chief Growth Officer',
  'Chief Business Development Officer',
  // Revenue & Marketing
  'CMO', 'Chief Marketing Officer',
  'Chief Revenue Officer',
  'VP Sales', 'Vice President Sales',
  'VP Business Development',
  'Head of Sales',
  'Sales Director',
  'Business Development Director',
  // Operations & Procurement
  'COO', 'Chief Operating Officer',
  'VP Operations',
  'Head of Procurement',
  'Procurement Director',
  'Chief Procurement Officer',
  // Technology & Digital
  'CTO', 'Chief Technology Officer',
  'Chief Digital Officer',
  'VP Engineering',
  'Head of IT',
  'IT Director',
  // Finance
  'CFO', 'Chief Financial Officer',
  'VP Finance',
  'Finance Director',
  // Regional Specific
  'Country Manager',
  'General Manager',
  'Regional Director',
  'KSA Manager',
  'Saudi Operations Lead',
];

// ---------------------------------------------------------------------------
// Retry Logic (from enrichmentEngine patterns)
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number; backoff?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoff = 2 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isLastAttempt = attempt === maxAttempts;
      console.warn(`[Hunter] Attempt ${attempt}/${maxAttempts} failed: ${error.message}${isLastAttempt ? ' (final)' : ''}`);
      
      if (!isLastAttempt) {
        const waitMs = delayMs * Math.pow(backoff, attempt - 1);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError || new Error('All retry attempts exhausted');
}

// ---------------------------------------------------------------------------
// Stealth Mode: Puppeteer with Cookie Authentication
// ---------------------------------------------------------------------------

async function extractExecutivesViaStealth(
  companyDomain: string,
  linkedinCookie: string,
  maxExecutives: number = 3
): Promise<ExecutiveProfile[]> {
  console.log(`[Hunter][Stealth] Initiating strategic entity discovery for ${companyDomain}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  try {
    const page = await browser.newPage();
    
    // Stealth headers
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Set LinkedIn session cookie
    await page.setCookie({
      name: 'li_at',
      value: linkedinCookie,
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true,
    });

    // Navigate to LinkedIn company page
    const companySlug = companyDomain.replace(/\.com\.sa$|\.com$|\.sa$/, '').replace(/\./g, '-');
    const searchUrl = `https://www.linkedin.com/company/${companySlug}/people/`;
    
    console.log(`[Hunter][Stealth] Navigating to ${searchUrl}`);

    await withRetry(async () => {
      const response = await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      if (!response || response.status() >= 400) {
        throw new Error(`LinkedIn returned status ${response?.status() || 'unknown'}`);
      }
    }, { maxAttempts: 2, delayMs: 2000 });

    // Wait for people section to load (use setTimeout instead of waitForTimeout)
    await new Promise(r => setTimeout(r, 3000));

    // Extract executive profiles
    const executives: ExecutiveProfile[] = await page.evaluate((priorityTitles) => {
      const profiles: ExecutiveProfile[] = [];
      const seenNames = new Set<string>();

      // Try multiple selector strategies for LinkedIn's dynamic UI
      const selectors = [
        '[data-test-id="people-list"] li',
        '.org-people-profile-card',
        '.artdeco-card .org-people-profile-card',
        '.scaffold-finite-scroll__content li',
        '[class*="profile-card"]',
        '.org-people-profile-card__profile-card',
      ];

      let cards: Element[] = [];
      for (const selector of selectors) {
        cards = Array.from(document.querySelectorAll(selector));
        if (cards.length > 0) break;
      }

      // Score each profile by title priority
      const scoredCards = cards.map(card => {
        const nameEl = card.querySelector('.org-people-profile-card__name, [data-test-id="people-list-name"], .artdeco-entity-lockup__title, h3, .name');
        const titleEl = card.querySelector('.org-people-profile-card__subtitle, [data-test-id="people-list-title"], .artdeco-entity-lockup__subtitle, .title, p');
        const linkEl = card.querySelector('a[href*="/in/"]');

        const name = nameEl?.textContent?.trim() || '';
        const title = titleEl?.textContent?.trim() || '';
        const href = linkEl?.getAttribute('href') || '';

        // Calculate priority score
        let score = 0;
        const titleLower = title.toLowerCase();
        for (let i = 0; i < priorityTitles.length; i++) {
          if (titleLower.includes(priorityTitles[i].toLowerCase())) {
            score = priorityTitles.length - i;
            break;
          }
        }

        return { name, title, href, score, card };
      });

      // Sort by priority score (highest first)
      scoredCards.sort((a, b) => b.score - a.score);

      for (const item of scoredCards) {
        if (!item.name || seenNames.has(item.name)) continue;
        if (profiles.length >= maxExecutives) break;

        seenNames.add(item.name);
        
        const linkedinUrl = item.href.startsWith('http') 
          ? item.href 
          : `https://www.linkedin.com${item.href}`;

        profiles.push({
          name: item.name,
          title: item.title,
          linkedinUrl: linkedinUrl,
          company: '',
          location: '',
          confidence: item.score > 0 ? 90 : 70,
          source: 'linkedin_stealth',
        } as ExecutiveProfile);
      }

      return profiles;
    }, STRATEGIC_TITLES_PRIORITY);

    console.log(`[Hunter][Stealth] Discovered ${executives.length} strategic entities`);
    return executives;

  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Recon Mode: Google Dorking for Public Profiles
// ---------------------------------------------------------------------------

async function extractExecutivesViaRecon(
  companyDomain: string,
  maxExecutives: number = 3
): Promise<ExecutiveProfile[]> {
  console.log(`[Hunter][Recon] Initiating public intelligence gathering for ${companyDomain}`);

  // Extract company name from domain
  const companyName = companyDomain
    .replace(/\.com\.sa$|\.com$|\.sa$/, '')
    .replace(/\./g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  // Google dork query
  const query = `site:linkedin.com/in "${companyName}" "Saudi Arabia" | "KSA"`;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  console.log(`[Hunter][Recon] Query: ${query}`);

  const executives: ExecutiveProfile[] = await withRetry(async () => {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
      },
    });

    if (!response.ok) {
      throw new Error(`Google search failed: ${response.status}`);
    }

    const html = await response.text();
    const profiles: ExecutiveProfile[] = [];
    const seenUrls = new Set<string>();

    // Extract LinkedIn profile URLs from search results
    const linkedInUrlPattern = /https:\/\/sa\.linkedin\.com\/in\/[^"\s<>]+/g;
    const linkedInComPattern = /https:\/\/www\.linkedin\.com\/in\/[^"\s<>]+/g;
    
    // Use array matching instead of iterator
    const saMatches = html.match(linkedInUrlPattern) || [];
    const comMatches = html.match(linkedInComPattern) || [];
    const allMatches = [...saMatches, ...comMatches];

    for (const url of allMatches.slice(0, maxExecutives * 2)) {
      const cleanUrl = url.replace(/&.*$/, ''); // Clean up URL
      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);

      // Extract name from URL slug
      const slug = cleanUrl.split('/in/')[1]?.replace(/-/g, ' ') || '';
      const name = slug
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      profiles.push({
        name: name || 'Unknown',
        title: 'Executive (title extraction requires profile access)',
        linkedinUrl: cleanUrl,
        company: companyName,
        confidence: 60,
        source: 'linkedin_dork',
      });

      if (profiles.length >= maxExecutives) break;
    }

    return profiles;
  }, { maxAttempts: 3, delayMs: 1500 });

  console.log(`[Hunter][Recon] Discovered ${executives.length} potential strategic entities`);
  return executives;
}

// ---------------------------------------------------------------------------
// Email Pattern Inference
// ---------------------------------------------------------------------------

function inferEmail(name: string, domain: string): string | undefined {
  if (!name || !domain) return undefined;
  
  const parts = name.toLowerCase().split(' ').filter(p => p.length > 1);
  if (parts.length < 2) return undefined;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  // Common Saudi corporate patterns
  const patterns = [
    `${firstName}.${lastName}@${domain}`,
    `${firstName[0]}${lastName}@${domain}`,
    `${firstName}@${domain}`,
  ];

  return patterns[0]; // Default to first.last pattern
}

// ---------------------------------------------------------------------------
// Main Hunter Function
// ---------------------------------------------------------------------------

export async function huntExecutives(
  companyDomain: string,
  linkedinCookie?: string,
  maxExecutives: number = 3
): Promise<HuntResult> {
  const startTime = Date.now();
  
  console.log(`[Hunter] Strategic entity hunt initiated for ${companyDomain}`);
  console.log(`[Hunter] Mode: ${linkedinCookie ? 'Stealth (authenticated)' : 'Recon (public intelligence)'}`);

  let executives: ExecutiveProfile[] = [];
  let method: 'stealth' | 'recon' | 'hybrid' = 'recon';

  // Attempt 1: Stealth mode if cookie provided
  if (linkedinCookie) {
    try {
      executives = await extractExecutivesViaStealth(companyDomain, linkedinCookie, maxExecutives);
      method = 'stealth';
      
      // If stealth yielded results, we're done
      if (executives.length > 0) {
        console.log(`[Hunter] Stealth extraction successful`);
      }
    } catch (error: any) {
      console.warn(`[Hunter] Stealth mode failed: ${error.message}`);
      console.log(`[Hunter] Falling back to reconnaissance mode`);
    }
  }

  // Attempt 2: Recon mode fallback (or primary if no cookie)
  if (executives.length === 0) {
    try {
      const reconExecutives = await extractExecutivesViaRecon(companyDomain, maxExecutives);
      executives = reconExecutives;
      method = method === 'stealth' ? 'hybrid' : 'recon';
    } catch (error: any) {
      console.warn(`[Hunter] Recon mode failed: ${error.message}`);
    }
  }

  // Enrich with inferred emails.
  // IMPORTANT: inferEmail() guesses the address via name-pattern — it is NOT verified.
  // Tag every guessed email with explicit provenance so downstream code can never
  // mistake it for a confirmed address.  A real, found/scraped email would carry
  // emailSource:'scraped' or 'api' and a higher confidence.
  const enrichedExecutives = executives.map(exec => {
    const guessedEmail = inferEmail(exec.name, companyDomain);
    if (guessedEmail) {
      return {
        ...exec,
        email: guessedEmail,
        emailSource: 'pattern-guess' as const,
        emailVerification: 'unverified' as const,
        // Cap confidence for any executive whose email is only a guess
        confidence: Math.min(exec.confidence, 40),
      };
    }
    // No email could be inferred — leave the exec as-is without email fields
    return exec;
  });

  const durationMs = Date.now() - startTime;
  const companyName = companyDomain.replace(/\.com\.sa$|\.com$/, '').replace(/\./g, ' ');

  const result: HuntResult = {
    domain: companyDomain,
    companyName: companyName.charAt(0).toUpperCase() + companyName.slice(1),
    executives: enrichedExecutives,
    intelligenceGatheredAt: new Date().toISOString(),
    durationMs,
    method,
    strategicEntityCount: enrichedExecutives.length,
  };

  console.log(`[Hunter] Hunt complete. Entities: ${result.strategicEntityCount}, Duration: ${durationMs}ms, Method: ${method}`);

  return result;
}

// ---------------------------------------------------------------------------
// Batch Hunt for Multiple Domains
// ---------------------------------------------------------------------------

export async function huntBatch(
  domains: string[],
  linkedinCookie?: string,
  maxExecutivesPerDomain: number = 3,
  concurrency: number = 2
): Promise<HuntResult[]> {
  const results: HuntResult[] = [];
  
  console.log(`[Hunter] Batch hunt initiated for ${domains.length} strategic entities`);

  // Process with limited concurrency
  const queue = [...domains];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const domain = queue.shift();
          if (!domain) break;

          try {
            const result = await huntExecutives(domain, linkedinCookie, maxExecutivesPerDomain);
            results.push(result);
          } catch (error: any) {
            console.error(`[Hunter] Failed to hunt ${domain}: ${error.message}`);
            results.push({
              domain,
              executives: [],
              intelligenceGatheredAt: new Date().toISOString(),
              durationMs: 0,
              method: 'recon',
              strategicEntityCount: 0,
            });
          }
        }
      })()
    );
  }

  await Promise.all(workers);
  return results;
}

export default huntExecutives;
