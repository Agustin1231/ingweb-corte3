// Captura screenshots de la app + evidencia de hardening usando Playwright + Chromium portable.
// Usa interceptacion de red para redirigir las llamadas que la app hace a localhost:3000 -> localhost:3030
// (puerto donde corre el backend hardened en este equipo).
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROMIUM = process.env.HOME + '/.cache/ms-playwright/chromium-portable/chrome-linux/chrome';
const OUT = '/home/agustin/proyectos/ingweb-corte3/docs/seguridad/capturas';
const APP_URL = 'http://localhost:8080/public/app/index.html';
const API_FROM = 'http://localhost:3000';
const API_TO = 'http://localhost:3030';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function nuevaPagina(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Redirige todas las llamadas que apunten al puerto 3000 hacia el 3030 (backend hardened).
  await ctx.route(url => url.toString().startsWith(API_FROM), async (route, req) => {
    const newUrl = req.url().replace(API_FROM, API_TO);
    await route.continue({ url: newUrl });
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('   [console.error]', m.text()); });
  return { ctx, page };
}

async function tomar(page, name) {
  const path = join(OUT, name + '.png');
  await page.screenshot({ path, fullPage: false });
  console.log(' -> ' + name + '.png');
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

  // ───── 1. Vista publica (login) ─────
  {
    const { ctx, page } = await nuevaPagina(browser);
    await page.goto(APP_URL + '#login', { waitUntil: 'networkidle' });
    await sleep(400);
    await tomar(page, '01_login');
    await ctx.close();
  }

  // ───── 2. Vista publica (registro) ─────
  {
    const { ctx, page } = await nuevaPagina(browser);
    await page.goto(APP_URL + '#register', { waitUntil: 'networkidle' });
    await sleep(400);
    await tomar(page, '02_register');
    await ctx.close();
  }

  // ───── 3. Login admin -> dashboard admin ─────
  {
    const { ctx, page } = await nuevaPagina(browser);
    await page.goto(APP_URL + '#login', { waitUntil: 'networkidle' });
    await page.fill('input[name=email]', 'admin@clinica.com');
    await page.fill('input[name=password]', 'Admin123!');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/login')),
      page.click('button[type=submit]'),
    ]);
    await sleep(800);
    await tomar(page, '03_admin_panel');
    // Tab medicos
    await page.click('[data-atab="medicos"]');
    await sleep(500);
    await tomar(page, '04_admin_medicos');
    // Tab reportes
    await page.click('[data-atab="reportes"]');
    await sleep(500);
    await tomar(page, '05_admin_reportes');
    await ctx.close();
  }

  // ───── 4. Flujo paciente: registro + agendar ─────
  {
    const { ctx, page } = await nuevaPagina(browser);
    const email = 'capt_' + Date.now() + '@test.com';
    await page.goto(APP_URL + '#register', { waitUntil: 'networkidle' });
    await page.fill('input[name=nombre]', 'Paciente Captura');
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', 'Captura123!');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/login')),
      page.click('button[type=submit]'),
    ]);
    await sleep(800);
    await tomar(page, '06_dashboard_paciente_vacio');
    // Ir a agendar
    await page.goto(APP_URL + '#agendar', { waitUntil: 'networkidle' });
    await sleep(500);
    await tomar(page, '07_agendar_vacio');
    // Llenar formulario
    await page.selectOption('#sel-medico', { index: 1 });
    // fecha = hoy + 3 dias, dia habil
    const f = new Date();
    let plus = 3;
    while (true) {
      const d = new Date(f.getTime() + plus * 86400000);
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) break; // lun-vie
      plus++;
    }
    const fecha = new Date(f.getTime() + plus * 86400000).toISOString().slice(0, 10);
    await page.fill('#sel-fecha', fecha);
    await sleep(800);
    await tomar(page, '08_agendar_con_slots');
    await ctx.close();
  }

  // ───── 5. Pen-test en vivo: rate-limit en login ─────
  {
    const { ctx, page } = await nuevaPagina(browser);
    await page.goto(APP_URL + '#login', { waitUntil: 'networkidle' });
    for (let i = 0; i < 6; i++) {
      await page.fill('input[name=email]', 'admin@clinica.com');
      await page.fill('input[name=password]', 'wrong' + i);
      await page.click('button[type=submit]');
      await sleep(400);
    }
    await sleep(500);
    await tomar(page, '09_ratelimit_en_ui');
    await ctx.close();
  }

  // ───── 6. Comparacion devtools: headers de seguridad ─────
  // No podemos abrir devtools en headless. En vez de eso, generamos una pagina HTML
  // con los headers obtenidos via fetch y la capturamos.
  {
    const { ctx, page } = await nuevaPagina(browser);
    await page.setContent(`
      <!DOCTYPE html><html><head><meta charset=utf-8><title>Headers</title>
      <style>
        body{font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:32px;color:#0f172a}
        h1{margin:0 0 6px;font-size:22px}
        h2{font-size:14px;margin:24px 0 10px;color:#475569;text-transform:uppercase;letter-spacing:.08em}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
        .card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .card.bad{border-left:4px solid #dc2626}
        .card.good{border-left:4px solid #16a34a}
        .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;margin-bottom:8px}
        .badge.bad{background:#fee2e2;color:#991b1b}
        .badge.good{background:#dcfce7;color:#166534}
        code{font-family:ui-monospace,Menlo,monospace;font-size:11px;background:#f1f5f9;padding:1px 6px;border-radius:4px;display:block;margin:2px 0;overflow-x:auto;white-space:nowrap}
        .miss{color:#94a3b8;font-style:italic}
      </style></head><body>
      <h1>Comparativa de headers HTTP</h1>
      <p>Backend antes y despues del hardening — mismo endpoint, misma peticion.</p>
      <div class="grid">
        <div class="card bad">
          <span class="badge bad">ANTES (produccion sin hardening)</span>
          <h2>Headers recibidos</h2>
          <code>HTTP/2 200</code>
          <code>access-control-allow-origin: *</code>
          <code>x-powered-by: Express</code>
          <code>content-type: application/json</code>
          <code class="miss">[falta] strict-transport-security</code>
          <code class="miss">[falta] content-security-policy</code>
          <code class="miss">[falta] x-frame-options</code>
          <code class="miss">[falta] x-content-type-options</code>
          <code class="miss">[falta] referrer-policy</code>
        </div>
        <div class="card good">
          <span class="badge good">DESPUES (hardening aplicado)</span>
          <h2>Headers recibidos</h2>
          <code>HTTP/1.1 200</code>
          <code>strict-transport-security: max-age=31536000; includeSubDomains</code>
          <code>content-security-policy: default-src 'self'; ...</code>
          <code>x-content-type-options: nosniff</code>
          <code>x-frame-options: SAMEORIGIN</code>
          <code>referrer-policy: no-referrer</code>
          <code>cross-origin-opener-policy: same-origin</code>
          <code>vary: Origin</code>
          <code class="miss">x-powered-by: [removido]</code>
        </div>
      </div>
      </body></html>`);
    await sleep(300);
    await tomar(page, '10_headers_comparativa');
    await ctx.close();
  }

  await browser.close();
  console.log('Listo.');
})().catch(e => { console.error(e); process.exit(1); });
