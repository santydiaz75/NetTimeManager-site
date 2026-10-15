const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://nettimemanager.com';
const LOGIN_PATH = process.env.NTM_LOGIN_PATH || '/Account/Login';

const USER = process.env.NTM_USER || '';
const PASS = process.env.NTM_PASS || '';

const USER_SELECTOR = process.env.NTM_USER_SELECTOR || '#emailOrUsername';
const PASS_SELECTOR = process.env.NTM_PASS_SELECTOR || '#password';
const SUBMIT_SELECTOR = process.env.NTM_SUBMIT_SELECTOR || 'button.btn-login';

let routes = [
  { name: 'index', path: '/' },
  { name: 'login', path: LOGIN_PATH },
  { name: 'dashboard', path: '/dashboard', requiresAuth: true },
  { name: 'reportes', path: '/reportes', requiresAuth: true },
];

if (process.env.NTM_ROUTES_JSON) {
  try { routes = JSON.parse(process.env.NTM_ROUTES_JSON); } catch {}
}

function stamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function saveHtml(page, outFile) {
  const html = await page.content(); // DOM final renderizado
  await fs.promises.writeFile(outFile, html, 'utf8');
}

async function tryLogin(page) {
  if (!USER || !PASS) return false;

  const loginUrl = new URL(LOGIN_PATH, BASE_URL).toString();
  await page.goto(loginUrl, { waitUntil: 'networkidle' });

  try {
    await page.waitForSelector(USER_SELECTOR, { timeout: 15000 });
    await page.fill(USER_SELECTOR, USER);
    await page.fill(PASS_SELECTOR, PASS);

    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.click(SUBMIT_SELECTOR),
    ]);
  } catch {
    return false;
  }

  await page.waitForTimeout(1200);
  const stillHasUserField = (await page.locator(USER_SELECTOR).count()) > 0;
  const stillOnLogin = page.url().toLowerCase().includes(LOGIN_PATH.toLowerCase());
  return !stillHasUserField || !stillOnLogin;
}

(async () => {
  const outRoot = path.join(process.cwd(), 'html-export', stamp());
  await ensureDir(outRoot);

  const headless = (process.env.NTM_HEADLESS || 'true').toLowerCase() !== 'false';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const loggedIn = await tryLogin(page);

  for (const r of routes) {
    if (r.requiresAuth && !loggedIn) continue;

    const url = new URL(r.path, BASE_URL).toString();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const outFile = path.join(outRoot, `${r.name}.html`);
    await saveHtml(page, outFile);
    console.log(`Guardado: ${outFile}`);
  }

  await browser.close();
  console.log(`✅ Export HTML completado en: ${outRoot}`);
})();