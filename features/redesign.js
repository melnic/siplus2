// ==UserScript==
// @name         SIPLUS - Redesign Sistemas Sesc
// @namespace    http://tampermonkey.net/
// @version      26.01.01
// @description  Ajustes visuais gerais da interface SIPLAN
// @match        http://webapps.sorocaba.sescsp.org.br/*
// @grant        none
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/vendor/waitForKeyElements.js
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/redesign.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/redesign.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.01: sem mudanças de comportamento; apenas nomes de função mais
    descritivos (jaFechouQuadroResumo em vez de flag solta `fechado`) e
    comentários. Mantido o @require do jQuery 1.7.2, pois waitForKeyElements
    entrega os nós como objetos jQuery (jNode.css(...), não jNode.style).
    O @require de jquery.hotkeys e do JotForm.js foi removido deste arquivo
    por não serem usados aqui (nenhum atalho de teclado nem formulário
    JotForm aparece neste script) — se alguma outra feature específica
    precisar deles, deve declará-los no seu próprio cabeçalho.
*/

(function () {
  'use strict';

  let jaFechouQuadroResumo = false;

  waitForKeyElements('.textododca', ajustarCaixaTexto);
  waitForKeyElements('.intrasesc-nav', ocultar);
  waitForKeyElements('.page-header', ocultar);
  waitForKeyElements(
    '#module-container > div > div > div.span10 > div:nth-child(2) > a',
    ajustarCalendario
  );

  waitForKeyElements('#container-btn-filtros', ocultar);
  waitForKeyElements('#agenda-box-informacoes', ocultar);
  waitForKeyElements(
    '#module-container > div > div.row-fluid > div.span10 > div:nth-child(1)',
    ocultar
  );

  waitForKeyElements('.navbar-inner', () => {
    // Ajusta estilo das divs de ação no calendário
    const divs = $('.fc-event');
    divs.css('border-radius', '5px');
    divs.css('color', 'rgba(0, 0, 0, 0.75)');
    document.body.style.background = '#f3f3f3';
  });

  // Oculta/mostra o filtro da agenda ao clicar no título
  waitForKeyElements('#container-filters-summary > div > div.box-title', toggleFilter);

  function toggleFilter(jNode) {
    const d = $('#container-filters-summary > div > div.well.no-radius');
    d.toggle();
    jNode.on('click', function () {
      d.toggle();
    });
  }

  function ajustarCaixaTexto(jNode) {
    jNode.css('width', '300pt');
    jNode.css('font-size', '12pt');
  }

  function ajustarCalendario() {
    $('#module-container > div > div > div.span10').css('margin-top', '5em');
  }

  function ocultar(jNode) {
    jNode.hide();
  }

  // Mantido do original para uso futuro (ex: fechar automaticamente o
  // quadro-resumo na primeira abertura), atualmente sem chamador ativo.
  function fecharUmaVez(jNode) {
    if (!jaFechouQuadroResumo) {
      jNode.click();
      jaFechouQuadroResumo = true;
    }
  }

  console.log('[SIPLUS] features/redesign.js carregado.');
})();
