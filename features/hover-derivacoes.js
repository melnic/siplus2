// ==UserScript==
// @name         SIPLUS - Hover de Derivações
// @namespace    http://tampermonkey.net/
// @version      26.01.01
// @description  Mostra tabela de serviços/derivações ao passar o mouse sobre uma data
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/vendor/waitForKeyElements.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/vendor/jquery.hotkeys.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/xhr-interceptor.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/dom-utils.js
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/hover-derivacoes.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/hover-derivacoes.js
// ==/UserScript==

/*
  Esta funcionalidade estava misturada dentro de carta_proposta.user.js
  (createHover, createTable, extractDateTime, applyStyles). Foi extraída
  para seu próprio módulo porque não tem relação direta com a geração da
  carta proposta — facilita revisão e permite ligar/desligar cada feature
  de forma independente.
*/

(function () {
  'use strict';

  const { escapeHtml } = window.SiplusDomUtils;
  const waitForKeyElements = window.waitForKeyElements;

  let acaoAtual = null;

  document.addEventListener('siplus:atividade-loaded', (evento) => {
    acaoAtual = evento.detail.data;
  });

  waitForKeyElements('#datas-list-container', iniciar);

  function extractDateTime(text) {
    const match = text.match(/(\d{2}\/\d{2}\/\d{4}), (\d{1,2}h\d{0,2})/);
    if (!match) return null;

    const date = match[1];
    let time = match[2];

    if (!time.includes('h')) {
      time = time.replace('h', ':00');
    } else if (!/\d{2}$/.test(time)) {
      time = time.replace('h', ':00');
    } else {
      time = time.replace('h', ':');
    }

    return `${date} ${time}`;
  }

  function createTable(servicos) {
    if (!servicos || servicos.length === 0) {
      return '<p>No matching data found.</p>';
    }

    let table = `
      <table>
        <thead>
          <tr>
            <th>Area Name</th><th>Local</th><th>Data Início</th>
            <th>A</th><th>Item</th><th>Descrição</th><th>Observação</th>
          </tr>
        </thead>
        <tbody>
    `;

    servicos.forEach((item) => {
      const quantidadeAnexos = item.arquivos ? item.arquivos.length : 0;
      table += `
        <tr>
          <td>${escapeHtml(item.areaNome)}</td>
          <td>${escapeHtml(item.dataSolicitacao.localSessaoNome)}</td>
          <td>${escapeHtml(item.dataSolicitacao.dataInicio)}</td>
          <td>${quantidadeAnexos || '-'}</td>
          <td>${escapeHtml(item.itemDescricao)}</td>
          <td>${escapeHtml(item.descricao)}</td>
          <td>${escapeHtml(item.observacao)}</td>
        </tr>
      `;
    });

    table += '</tbody></table>';
    return table;
  }

  function applyStyles() {
    const floatingDiv = document.getElementById('floatingDivDerivacoes');
    floatingDiv.style.display = 'none';
    floatingDiv.style.position = 'absolute';
    floatingDiv.style.backgroundColor = '#f9f9f9';
    floatingDiv.style.padding = '10px';
    floatingDiv.style.maxWidth = '1000px';
    floatingDiv.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.2)';
    floatingDiv.style.zIndex = '1000';

    const styleElement = document.createElement('style');
    styleElement.textContent = `
      #floatingDivDerivacoes th { text-align: left; }
      #floatingDivDerivacoes th, #floatingDivDerivacoes td {
        padding: 0 4px 0 0;
      }
      #floatingDivDerivacoes tr:nth-child(odd) { background-color: rgb(237,237,237); }
      #floatingDivDerivacoes td:nth-child(1) { width: 6em; }
      #floatingDivDerivacoes td:nth-child(2) { width: 5em; overflow:hidden; white-space:nowrap; }
      #floatingDivDerivacoes td:nth-child(3) { width: 6em; }
      #floatingDivDerivacoes td:nth-child(4) { width: 1em; color: red; }
      #floatingDivDerivacoes td:nth-child(5) { width: 9em; }
      #floatingDivDerivacoes td:nth-child(6) { width: 8em; }
    `;
    document.head.appendChild(styleElement);
  }

  function createHoverDiv() {
    let floatingDiv = document.getElementById('floatingDivDerivacoes');
    if (!floatingDiv) {
      floatingDiv = document.createElement('div');
      floatingDiv.id = 'floatingDivDerivacoes';
      document.body.appendChild(floatingDiv);
    }
  }

  function iniciar() {
    createHoverDiv();
    applyStyles();

    const floatingDiv = document.getElementById('floatingDivDerivacoes');
    const hoverElements = document.querySelectorAll('.data-text');

    hoverElements.forEach((element) => {
      element.addEventListener('mouseenter', () => {
        if (!acaoAtual) return;

        const dateTime = extractDateTime(element.textContent);
        if (!dateTime) return;

        const matchingData = acaoAtual.datas.find(
          (item) => item.dataAgenda.dataInicio === dateTime
        );

        floatingDiv.style.display = 'block';
        floatingDiv.innerHTML = matchingData
          ? createTable(matchingData.servicos)
          : '<p>No matching data found.</p>';

        const rect = element.getBoundingClientRect();
        floatingDiv.style.top = `${rect.bottom + window.scrollY}px`;
        floatingDiv.style.left = `${rect.left + window.scrollX - 100}px`;
      });

      element.addEventListener('mouseleave', () => {
        floatingDiv.style.display = 'none';
      });
    });
  }

  // Atalho para reprocessar hover manualmente (Ctrl+/), útil se a lista
  // de datas for recarregada dinamicamente e os listeners precisarem ser
  // reanexados.
  if (window.jQuery) {
    jQuery(document).bind('keydown', 'ctrl+/', iniciar);
  }

  console.log('[SIPLUS] features/hover-derivacoes.js carregado.');
})();
