const puppeteer = require('puppeteer');
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errs.push('CONSOLE: ' + msg.text().substring(0, 200)); });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle2', timeout: 20000 });

  // Register fresh
  const resp = await page.evaluate(async () => {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'antest' + Date.now() + '@t.dev', password: 'Test2026!' }) });
    return r.json();
  });
  console.log('Auth:', resp.token ? 'OK' : JSON.stringify(resp).substring(0, 100));

  if (!resp.token) {
    // Try login with existing
    const login = await page.evaluate(async () => {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'analytics-test-1774625106@t.dev', password: 'Test2026!' }) });
      return r.json();
    });
    console.log('Login fallback:', login.token ? 'OK' : JSON.stringify(login).substring(0, 100));
    if (login.token) resp.token = login.token;
  }

  await page.evaluate(token => {
    localStorage.setItem('leadjin_token', token);
    localStorage.setItem('leadgin_onboarded', 'true');
  }, resp.token);

  await page.reload({ waitUntil: 'networkidle2' });
  await delay(3000);

  // Navigate to Analytics
  await page.evaluate(() => { for (const b of document.querySelectorAll('button,a')) if (b.textContent.trim() === 'Analytics') { b.click(); break; } });
  await delay(3000);

  // Screenshot
  await page.screenshot({ path: '/tmp/test-analytics-result.png' });

  // Check what's rendered
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Page text includes "Engine Intelligence":', bodyText.includes('Engine Intelligence'));
  console.log('Page text includes "TOTAL LEADS":', bodyText.includes('TOTAL LEADS'));
  console.log('Page text includes "Something went wrong":', bodyText.includes('Something went wrong'));
  console.log('Analytics view visible:', bodyText.includes('Intelligence') || bodyText.includes('analytics'));

  // Check what analyticsData looks like in React state
  const stateCheck = await page.evaluate(() => {
    // Check if there's any content in the analytics area
    const mainContent = document.querySelector('main') || document.querySelector('[class*="flex-1"]');
    return {
      mainInner: mainContent ? mainContent.innerText.substring(0, 200) : 'no main element',
      hasCharts: !!document.querySelector('svg.recharts-surface'),
      divCount: document.querySelectorAll('div').length,
    };
  });
  console.log('State check:', JSON.stringify(stateCheck));

  console.log('\nErrors (' + errs.length + '):');
  errs.forEach(e => console.log('  ' + e.substring(0, 200)));

  await browser.close();
})().catch(e => console.error('FATAL:', e.message));
