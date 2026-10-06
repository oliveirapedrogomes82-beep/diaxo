'use strict';
/* Painel (provisório para testar a casca) */
App.page({ id: 'painel', label: 'Painel', icon: 'home', group: 'Dia a dia', order: 1, tab: 1, render: () => html`<div class="page-head"><div><h1>Olá, ${U.firstName(Store.me.name)}</h1><p class="lead">${Store.me.roleLabel}</p></div></div><p>${Store.me.perms.length} permissões · ${Store.state.students.length} alunos visíveis</p>` });
App.page({ id: 'inicio', label: 'Início', icon: 'home', family: true, order: 1, tab: 1, render: () => html`<h1>Olá, ${U.firstName(Store.me.name)}</h1><p>${Q.myChildren().map((s) => s.name).join(', ')}</p>` });
