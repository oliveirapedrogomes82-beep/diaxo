'use strict';
/* Testes de navegador (Playwright) na demonstração local: para cada conta de exemplo, abre todas as telas do
   menu, as abas da ficha de um aluno, a busca e cada ação do menu "Novo", em computador (1280) e celular (390).
   Falha se houver erro de JavaScript, erro no console, rolagem horizontal ou tela de erro.
   Uso: npm run test:browser  [-- --only=Marcos] [-- --shots=pasta] */
const pw = require('./pw');
const fs = require('node:fs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ACCOUNTS = ['Ana Beatriz', 'Fernanda', 'Rita', 'Marcos', 'Aline', 'Bruna', 'Júlia', 'Paulo', 'Juliana'].filter((a) => !args.only || a.startsWith(args.only));
const VIEWPORTS = [
  { width: 1280, height: 860, colorScheme: 'light' },
  { width: 390, height: 844, colorScheme: 'dark' },
];
const problems = [];
const note = (who, vp, where, msg) => problems.push(`[${who} ${vp.width}] ${where}: ${msg}`);

async function checkPage(s, who, vp, where) {
  const over = await s.overflow();
  if (over > 1) note(who, vp, where, `rolagem horizontal de ${over}px`);
  const bad = await s.page.evaluate(() => {
    const t = document.querySelector('main') ? document.querySelector('main').innerText : '';
    return /Não foi possível abrir esta tela|Tela não encontrada|undefined|\[object Object\]|NaN/.test(t) ? t.match(/Não foi possível abrir esta tela|Tela não encontrada|undefined|\[object Object\]|NaN/)[0] : null;
  });
  if (bad) note(who, vp, where, `texto suspeito: ${bad}`);
  if (args.shots) await s.shot(`${args.shots}/${who.split(' ')[0]}-${vp.width}-${where.replace(/[^a-z0-9]+/gi, '_')}.png`);
}

(async () => {
  if (args.shots) fs.mkdirSync(args.shots, { recursive: true });
  for (const who of ACCOUNTS) {
    for (const vp of VIEWPORTS) {
      const s = await pw.session(who, vp);
      const routes = await s.page.$$eval('#nav a.side-link', (as) => as.map((a) => a.getAttribute('href').slice(1)));
      if (!routes.length) note(who, vp, 'menu', 'menu vazio');
      for (const r of routes) {
        await s.go(r);
        await s.page.waitForTimeout(150);
        await checkPage(s, who, vp, r);
      }
      // ficha de um aluno e todas as abas
      if (routes.includes('alunos')) {
        await s.go('alunos');
        const sid = await s.page.evaluate(() => (Q.students()[0] || {}).id);
        if (sid) {
          const tabs = await s.page.evaluate((id) => App.studentTabs(Q.student(id)).map((t) => t.id), sid);
          for (const t of tabs) {
            await s.go(`alunos/${sid}/${t}`);
            await s.page.waitForTimeout(150);
            await checkPage(s, who, vp, `ficha/${t}`);
          }
        }
      }
      // ações do menu Novo (abre e fecha cada uma)
      if (vp.width > 500) {
        const actions = await s.page.evaluate(() => App.actions().map((a) => a.id));
        for (const id of actions) {
          await s.go(routes[0] || '');
          await s.page.evaluate((aid) => App.actions().find((a) => a.id === aid).run(), id);
          await s.page.waitForTimeout(250);
          const open = await s.page.$('.overlay');
          if (open) {
            await s.page.keyboard.press('Escape');
            await s.page.waitForTimeout(100);
            const confirm = await s.page.$('.overlay [data-ok]');
            if (confirm) await s.page.click('.overlay [data-ok]');
            await s.page.evaluate(() => UI.closeAll());
          }
        }
        // busca rápida
        await s.page.keyboard.press('Control+k');
        await s.page.waitForTimeout(150);
        await s.page.keyboard.type('a');
        await s.page.waitForTimeout(150);
        await s.page.keyboard.press('Escape');
      }
      for (const e of s.errors) note(who, vp, 'console', e);
      await s.close();
      console.log(`ok: ${who} ${vp.width}px — ${routes.length} telas`);
    }
  }
  await pw.done();
  if (problems.length) {
    console.log('\nPROBLEMAS:\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('\nTudo certo.');
})().catch(async (e) => {
  console.error(e);
  await pw.done();
  process.exit(1);
});
