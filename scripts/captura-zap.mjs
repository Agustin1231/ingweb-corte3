import { chromium } from 'playwright';
import { join } from 'node:path';

const CHROMIUM = process.env.HOME + '/.cache/ms-playwright/chromium-portable/chrome-linux/chrome';
const OUT = '/home/agustin/proyectos/ingweb-corte3/docs/seguridad/capturas';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // Reporte ZAP del frontend
  await page.goto('file:///home/agustin/proyectos/ingweb-corte3/docs/seguridad/dast/zap_report.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '11_zap_report_frontend.png'), fullPage: false });

  // Reporte ZAP del backend hardened
  await page.goto('file:///home/agustin/proyectos/ingweb-corte3/docs/seguridad/dast/zap_api_report.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '12_zap_report_backend.png'), fullPage: false });

  await browser.close();
  console.log('Listo.');
})().catch(e => { console.error(e); process.exit(1); });
