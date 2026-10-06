'use strict';
/* Ajuda para testar telas no navegador (Playwright + Chromium já instalados no ambiente de desenvolvimento).
   Abre a demonstração local (web/index.html via file://) num contexto novo e entra como uma conta de exemplo.
   Contas: 'Ana Beatriz' (diretora, titular), 'Fernanda' (coordenadora), 'Rita' (secretária), 'Marcos' (professor Fund. II/EM),
   'Aline' (professora Ed. Infantil), 'Bruna' (auxiliar), 'Júlia' (psicóloga), 'Paulo' (tesoureiro), 'Juliana' (responsável).

   const pw = require('./tools/pw');
   const s = await pw.session('Marcos', { width: 390, height: 844 });
   await s.go('chamada'); console.log(await s.text()); await s.shot('/tmp/x.png');
   console.log(s.errors); await s.close(); await pw.done(); */
const path = require('node:path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const URL = 'file://' + path.resolve(__dirname, '../web/index.html');
let browser = null;

async function session(who, { width = 1280, height = 860, colorScheme = 'light', url = URL } = {}) {
  browser = browser || (await chromium.launch());
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', (d) => d.dismiss());
  await page.goto(url);
  await page.waitForSelector('.account-btn', { timeout: 15000 });
  if (who) {
    await page.click(`.account-btn:has-text("${who}")`);
    await page.waitForSelector('#app:not([hidden]) .page', { timeout: 15000 });
  }
  const go = async (route) => {
    await page.evaluate((r) => (location.hash = r), route);
    await page.waitForTimeout(200);
  };
  return {
    page,
    ctx,
    errors,
    go,
    /** Texto visível da área principal. */
    text: (sel = 'main') => page.$eval(sel, (m) => m.innerText),
    /** Pixels de rolagem horizontal (deve ser 0). */
    overflow: () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    shot: (file, full = false) => page.screenshot({ path: file, fullPage: full }),
    close: () => ctx.close(),
  };
}
async function done() {
  if (browser) await browser.close();
  browser = null;
}
module.exports = { session, done, URL };
