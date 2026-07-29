// ==UserScript==
// @name         SIPLUS - Hover de Derivações
// @namespace    http://tampermonkey.net/
// @version      26.01.05
// @description  Mostra tabela de serviços/derivações ao passar o mouse sobre uma data
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/hover-derivacoes.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/hover-derivacoes.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/xhr-interceptor.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/dom-utils.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.05: Corrigido o bug real por trás de "não funciona depois de
    salvar": ao salvar, o SIPLAN dispara uma segunda requisição para
    .../atividade/<id>/sessoes, que também batia com o regex antigo do
    interceptor (api/atividade/96...) mas devolve um JSON SEM o campo
    `datas` — isso sobrescrevia acaoAtual com dados incompletos e o hover
    quebrava com "Cannot read properties of undefined (reading 'find')".
    Duas correções: (1) o regex do interceptor agora exige que o ID da
    atividade seja seguido de "?" ou fim da string, excluindo sub-rotas
    como /sessoes; (2) blindagem extra no listener de
    'siplus:atividade-loaded', que só aceita a resposta se ela realmente
    tiver `datas` como array — assim, mesmo que apareça outro sub-endpoint
    parecido no futuro, não quebra mais.
  - 26.01.04-debug (removida): versão com console.log temporários usados
    para diagnosticar o problema acima.
  - 26.01.03: Corrigido: o hover só era religado nos elementos '.data-text'
    que existiam no exato momento em que '#datas-list-container' aparecia
    pela primeira vez (um "retrato" único via querySelectorAll). Quando a
    lista de datas era re-renderizada — por exemplo ao abrir a ação de
    novo ou depois de salvar — os elementos antigos eram substituídos por
    elementos NOVOS sem listener nenhum, e o hover parava de funcionar
    silenciosamente (sem erro no console). Agora observamos '.data-text'
    diretamente com waitForElement(), que chama attachHover() para CADA
    elemento novo que aparecer, então o hover se religa sozinho sempre que
    a página troca esses elementos. Ctrl+/ continua disponível como reforço
    manual, mas não deveria mais ser necessário no dia a dia.
  - 26.01.02: Removida a dependência de jQuery (waitForKeyElements e
    jquery.hotkeys vendorizados, e o @require de jQuery externo). Trocado
    por waitForElement() (MutationObserver puro) e o atalho Ctrl+/ agora é
    um listener de 'keydown' vanilla, sem depender do plugin jQuery Hotkeys.

  Esta funcionalidade estava misturada dentro de carta_proposta.user.js
  (createHover, createTable, extractDateTime, applyStyles). Foi extraída
  para seu próprio módulo porque não tem relação direta com a geração da
  carta proposta — facilita revisão e permite ligar/desligar cada feature
  de forma independente.
*/



/*
  Esta funcionalidade estava misturada dentro de carta_proposta.user.js
  (createHover, createTable, extractDateTime, applyStyles). Foi extraída
  para seu próprio módulo porque não tem relação direta com a geração da
  carta proposta — facilita revisão e permite ligar/desligar cada feature
  de forma independente.
*/

(function () {
  'use strict';

  const { escapeHtml, waitForElement } = window.SiplusDomUtils;

  let acaoAtual = null;
  let floatingDivEl = null;

  document.addEventListener('siplus:atividade-loaded', (evento) => {
    const dados = evento.detail.data;
    // Blindagem: o regex do interceptor já foi apertado para não pegar
    // sub-endpoints como .../sessoes, mas mantemos esta checagem como
    // segunda camada de defesa — só aceitamos a resposta se ela realmente
    // tiver o formato esperado (com a lista de datas).
    if (dados && Array.isArray(dados.datas)) {
      acaoAtual = dados;
    }
  });

  // Configura o div flutuante uma única vez.
  createHoverDiv();
  applyStyles();
  floatingDivEl = document.getElementById('floatingDivDerivacoes');

  // Em vez de esperar o container aparecer UMA VEZ e pegar um "retrato"
  // dos .data-text existentes naquele instante (o que fazia o hover parar
  // de funcionar depois de abrir/salvar a ação, quando a lista de datas é
  // re-renderizada com elementos NOVOS), observamos '.data-text'
  // diretamente. waitForElement chama o callback para CADA elemento novo
  // que aparecer, então o hover é religado automaticamente sempre que a
  // página troca esses elementos — sem precisar de Ctrl+/ manual.
  waitForElement('.data-text', attachHover);

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

  function attachHover(element) {
    element.addEventListener('mouseenter', () => {
      if (!acaoAtual) return;

      const dateTime = extractDateTime(element.textContent);
      if (!dateTime) return;

      const matchingData = acaoAtual.datas.find(
        (item) => item.dataAgenda.dataInicio === dateTime
      );

      floatingDivEl.style.display = 'block';
      floatingDivEl.innerHTML = matchingData
        ? createTable(matchingData.servicos)
        : '<p>No matching data found.</p>';

      const rect = element.getBoundingClientRect();
      floatingDivEl.style.top = `${rect.bottom + window.scrollY}px`;
      floatingDivEl.style.left = `${rect.left + window.scrollX - 100}px`;
    });

    element.addEventListener('mouseleave', () => {
      floatingDivEl.style.display = 'none';
    });
  }

  // Mantido como fallback manual (Ctrl+/): força um novo scan imediato de
  // '.data-text', útil caso algum elemento tenha escapado da observação
  // automática por algum motivo.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '/') {
      document.querySelectorAll('.data-text').forEach(attachHover);
    }
  });

  console.log('[SIPLUS] features/hover-derivacoes.js carregado.');
})();
