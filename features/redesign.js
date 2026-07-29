// ==UserScript==
// @name         SIPLUS - Redesign Sistemas Sesc
// @namespace    http://tampermonkey.net/
// @version      26.01.03
// @description  Ajustes visuais gerais da interface SIPLAN
// @match        http://webapps.sorocaba.sescsp.org.br/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/redesign.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/redesign.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/dom-utils.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.03: Removida a dependência de jQuery por completo (e o
    waitForKeyElements vendorizado, que dependia dele). Motivo: mesmo sem
    trazer nossa própria cópia de jQuery via @require (correção da versão
    anterior), ainda dependíamos do jQuery que a PRÓPRIA página do SIPLAN
    carrega — o que é frágil (se a ordem de carregamento mudar, ou se
    rodarmos numa página sem jQuery, quebra). Trocado por waitForElement(),
    uma função própria baseada em MutationObserver, sem nenhuma dependência
    externa. Todo o código que usava métodos jQuery (jNode.css(),
    jNode.hide(), jNode.on(), $(...)) foi reescrito para DOM puro
    (element.style, element.style.display, element.addEventListener,
    document.querySelector[All]).
  - 26.01.02: corrigido conflito de jQuery duplicado (ver git log).
  - 26.01.01: nomes de função mais descritivos, comentários.
*/

(function () {
  'use strict';

  const { waitForElement } = window.SiplusDomUtils;

  let jaFechouQuadroResumo = false;

  waitForElement('.textododca', ajustarCaixaTexto);
  waitForElement('.intrasesc-nav', ocultar);
  waitForElement('.page-header', ocultar);
  waitForElement(
    '#module-container > div > div > div.span10 > div:nth-child(2) > a',
    ajustarCalendario
  );

  waitForElement('#container-btn-filtros', ocultar);
  waitForElement('#agenda-box-informacoes', ocultar);
  waitForElement(
    '#module-container > div > div.row-fluid > div.span10 > div:nth-child(1)',
    ocultar
  );

  waitForElement('.navbar-inner', () => {
    // Ajusta estilo das divs de ação no calendário
    document.querySelectorAll('.fc-event').forEach((el) => {
      el.style.borderRadius = '5px';
      el.style.color = 'rgba(0, 0, 0, 0.75)';
    });
    document.body.style.background = '#f3f3f3';
  });

  // Oculta/mostra o filtro da agenda ao clicar no título
  waitForElement('#container-filters-summary > div > div.box-title', toggleFilter);

  function toggleFilter(node) {
    const painel = document.querySelector('#container-filters-summary > div > div.well.no-radius');
    if (!painel) return;

    const toggle = () => {
      painel.style.display = painel.style.display === 'none' ? '' : 'none';
    };
    toggle();
    node.addEventListener('click', toggle);
  }

  function ajustarCaixaTexto(node) {
    node.style.width = '300pt';
    node.style.fontSize = '12pt';
  }

  function ajustarCalendario() {
    const el = document.querySelector('#module-container > div > div > div.span10');
    if (el) el.style.marginTop = '5em';
  }

  function ocultar(node) {
    node.style.display = 'none';
  }

  // Mantido do original para uso futuro (ex: fechar automaticamente o
  // quadro-resumo na primeira abertura), atualmente sem chamador ativo.
  function fecharUmaVez(node) {
    if (!jaFechouQuadroResumo) {
      node.click();
      jaFechouQuadroResumo = true;
    }
  }

  console.log('[SIPLUS] features/redesign.js carregado.');
})();
