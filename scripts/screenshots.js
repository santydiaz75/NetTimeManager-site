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

const VIEWPORT = {
  width: Number(process.env.NTM_WIDTH || 1440),
  height: Number(process.env.NTM_HEIGHT || 900),
};

const HEADLESS = (process.env.NTM_HEADLESS || 'true').toLowerCase() !== 'false';

// Rutas objetivo: ajusta según tu app
let routes = [
  { name: '01-home', path: '/', requiresAuth: false },
  { name: '02-login', path: LOGIN_PATH, requiresAuth: false },
  { name: '03-dashboard', path: '/dashboard', requiresAuth: true },
  { name: '04-reportes', path: '/reportes', requiresAuth: true },
];

// Permite sobreescribir rutas por variable JSON
if (process.env.NTM_ROUTES_JSON) {
  try {
    routes = JSON.parse(process.env.NTM_ROUTES_JSON);
    console.log('ℹ️ Usando rutas de NTM_ROUTES_JSON');
  } catch {
    console.log('⚠️ NTM_ROUTES_JSON inválido. Se usan rutas por defecto.');
  }
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

function fixAssetUrls(html) {
  // Convierte rutas relativas a absolutas según BASE_URL para que carguen en el HTML exportado
  const base = new URL(BASE_URL);
  const origin = base.origin;

  return html
    .replace(/(href|src)=["']\/([^"']+)["']/gi, (_, attr, p) => `${attr}="${origin}/${p}"`)
    .replace(/(href|src)=["']\.\/([^"']+)["']/gi, (_, attr, p) => `${attr}="${origin}/${p}"`);
}

async function saveHtml(page, outFile) {
  const html = await page.content();
  const fixed = fixAssetUrls(html);
  await fs.promises.writeFile(outFile, fixed, 'utf8');
}

async function tryAcceptCookies(page) {
  const candidates = [
    'button:has-text("Aceptar")',
    'button:has-text("Accept")',
    'button:has-text("Aceptar todo")',
    '[id*="accept"]',
    '[class*="accept"]',
  ];

  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 1000 });
        console.log(`🍪 Cookie banner aceptado con selector: ${sel}`);
        return;
      } catch {}
    }
  }
}

async function login(page) {
  if (!USER || !PASS) {
    console.log('ℹ️ NTM_USER/NTM_PASS no definidos. Se omite login.');
    return false;
  }

  const loginUrl = new URL(LOGIN_PATH, BASE_URL).toString();
  console.log(`🔐 Login en: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle' });
  await tryAcceptCookies(page);

  await page.waitForSelector(USER_SELECTOR, { timeout: 20000 });

  await page.fill(USER_SELECTOR, USER);
  await page.fill(PASS_SELECTOR, PASS);

  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click(SUBMIT_SELECTOR),
  ]);

  await page.waitForTimeout(1500);

  const stillUser = (await page.locator(USER_SELECTOR).count()) > 0;
  const stillLoginUrl = page.url().toLowerCase().includes(LOGIN_PATH.toLowerCase());
  const ok = !stillUser || !stillLoginUrl;

  console.log(ok ? `✅ Login OK (${page.url()})` : `⚠️ Login no confirmado (${page.url()})`);
  return ok;
}

(async () => {
  const runId = stamp();
  const outRoot = path.join(process.cwd(), 'export', runId);
  const htmlDir = path.join(outRoot, 'html');
  const pngDir = path.join(outRoot, 'png');

  await ensureDir(htmlDir);
  await ensureDir(pngDir);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  console.log(`🌐 BASE_URL: ${BASE_URL}`);
  const loggedIn = await login(page);

  const results = [];

  for (const r of routes) {
    if (r.requiresAuth && !loggedIn) {
      console.log(`⏭️ Omitiendo ${r.name} (requiere auth)`);
      continue;
    }

    const url = new URL(r.path, BASE_URL).toString();
    console.log(`→ Navegando: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle' });
    await tryAcceptCookies(page);
    await page.waitForTimeout(1200);

    const htmlPath = path.join(htmlDir, `${r.name}.html`);
    const pngPath = path.join(pngDir, `${r.name}.png`);

    await saveHtml(page, htmlPath);
    await page.screenshot({ path: pngPath, fullPage: true });

    results.push({ name: r.name, url, htmlPath, pngPath });
    console.log(`   ✅ HTML: ${htmlPath}`);
    console.log(`   ✅ PNG : ${pngPath}`);
  }

  const indexHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Export NetTimeManager</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f7f7f8; color: #111; }
    a { color: #0b57d0; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { line-height: 1.9; }
    .card { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 20px; max-width: 900px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Export NetTimeManager (${runId})</h1>
    <ul>
      ${results
        .map(
          r => `<li><strong>${r.name}</strong> — <a href="./html/${path.basename(r.htmlPath)}">HTML</a> | <a href="./png/${path.basename(r.pngPath)}">PNG</a> | <a href="${r.url}" target="_blank">Original</a></li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</body>
</html>`;

  await fs.promises.writeFile(path.join(outRoot, 'index.html'), indexHtml, 'utf8');

  await browser.close();

  console.log('\n✅ Proceso completado');
  console.log(`📁 Carpeta: ${outRoot}`);
  console.log(`📄 Índice:  ${path.join(outRoot, 'index.html')}`);
})();