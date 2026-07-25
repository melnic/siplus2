// ==UserScript==
// @name         SIPLUS - Pintar Feriados no Calendário
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Pinta as células do calendário SIPLAN com base nos feriados
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @match        https://webapps.sorocaba.sescsp.org.br/siplan/*
// @run-at       document-end
// ==/UserScript==

/*
  CHANGELOG
  - 2.0.0: BREAKING (na organização, não no comportamento visual):
    A lista de feriados/eventos deixou de ficar hardcoded neste arquivo e
    passou a ser carregada de data/feriados.json (fetch). Antes existiam
    DUAS fontes de dados divergentes: um array grande aqui dentro do
    .user.js e um feriados.json separado com apenas um subconjunto das
    datas. Agora data/feriados.json é a fonte única (ver comentário lá).

    Isso também facilita: (a) atualizar as datas sem editar/republicar o
    userscript, (b) reaproveitar o mesmo arquivo de dados numa futura
    extensão de navegador.

    Requisito: este arquivo precisa rodar em contexto onde `fetch` consegue
    acessar data/feriados.json (mesma origem do Tampermonkey/extensão, ou
    via @resource no caso de Tampermonkey puro — ver nota abaixo).

  NOTA sobre Tampermonkey + fetch de arquivo local:
  Em Tampermonkey, para carregar um JSON local sem CORS, a forma recomendada
  é declarar:
    // @resource     feriadosData data/feriados.json
  e ler com GM_getResourceText('feriadosData') em vez de fetch(). Deixei o
  fetch() como implementação porque é o que funcionará diretamente quando
  isto virar uma extensão de navegador (manifest com web_accessible_resources
  ou apenas fetch(chrome.runtime.getURL(...))). Se for manter como
  Tampermonkey por enquanto, troque carregarFeriados() pela versão com
  GM_getResourceText (comentada abaixo da função).
*/

(function () {
  'use strict';

  const CORES = {
    fechada: {
      backgroundColor: '#555555',
      borderColor: '#757575',
      titleColor: '#424242'
    },
    aberta: {
      backgroundColor: '#e0f7fa',
      borderColor: '#00acc1',
      titleColor: '#006064'
    }
  };

  let feriadosPorData = {}; // { 'AAAA-MM-DD': {tipo, descricao} }

  async function carregarFeriados() {
    try {
      const resp = await fetch('data/feriados.json');
      const json = await resp.json();
      feriadosPorData = {};
      (json.datas || []).forEach((f) => {
        feriadosPorData[f.data] = f;
      });
      console.log(`[SIPLUS/feriados] ${json.datas.length} feriados carregados.`);
    } catch (err) {
      console.error('[SIPLUS/feriados] Falha ao carregar data/feriados.json:', err);
    }
  }

  // --- Alternativa para Tampermonkey puro (sem servidor), caso o fetch
  // acima não funcione por causa de CORS/file://. Descomente e use
  // GM_getResourceText no lugar do fetch, adicionando ao cabeçalho:
  //   // @resource feriadosData data/feriados.json
  //   // @grant    GM_getResourceText
  //
  // function carregarFeriados() {
  //   const json = JSON.parse(GM_getResourceText('feriadosData'));
  //   feriadosPorData = {};
  //   json.datas.forEach((f) => { feriadosPorData[f.data] = f; });
  // }

  function converterDataISOparaBR(dataISO) {
    const partes = dataISO.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataISO;
  }

  function pintarCelula(cell, feriado) {
    const cor = CORES[feriado.tipo];
    if (!cor) return;

    cell.style.backgroundColor = cor.backgroundColor;
    cell.style.border = `1px solid ${cor.borderColor}`;

    const dayNumber = cell.querySelector('.fc-day-number');
    if (dayNumber) {
      dayNumber.style.color = cor.titleColor;
      dayNumber.style.fontWeight = 'bold';
    }

    const legenda =
      feriado.descricao + (feriado.tipo === 'fechada' ? '\n UO Fechada' : '\n UO Aberta');

    cell.setAttribute('title', legenda);
    cell.setAttribute('data-feriado', feriado.tipo);
    cell.setAttribute('data-feriado-desc', legenda);

    cell.classList.add('feriado-pintado', `feriado-${feriado.tipo}`);

    if (feriado.tipo === 'fechada' && dayNumber && !dayNumber.querySelector('.lock')) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'lock';
      lockIcon.textContent = ' 🔒';
      lockIcon.style.fontSize = '11px';
      lockIcon.style.marginLeft = '4px';
      lockIcon.title = 'Unidade fechada';
      dayNumber.appendChild(lockIcon);
    }
  }

  function processarCelulas() {
    const cells = document.querySelectorAll('td[data-date]');
    let count = 0;

    cells.forEach((cell) => {
      const dataISO = cell.getAttribute('data-date');
      const feriado = feriadosPorData[dataISO];
      if (feriado) {
        pintarCelula(cell, feriado);
        count++;
      }
    });

    if (count > 0) {
      console.log(`[SIPLUS/feriados] ${count} células pintadas com feriados`);
    }
  }

  function adicionarEstilos() {
    const style = document.createElement('style');
    style.textContent = `
      .feriado-pintado { transition: background-color 0.2s; }
      .feriado-pintado:hover { filter: brightness(0.95); cursor: help; }
      .feriado-fechada { background-color: ${CORES.fechada.backgroundColor} !important; }
      .feriado-aberta { background-color: ${CORES.aberta.backgroundColor} !important; }
      .lock { display: inline-block; }
    `;
    document.head.appendChild(style);
  }

  function observarMudancas() {
    const observer = new MutationObserver((mutations) => {
      const deveProcessar = mutations.some((mutation) =>
        [...mutation.addedNodes].some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            ((node.matches && node.matches('td[data-date]')) ||
              (node.querySelector && node.querySelector('td[data-date]')))
        )
      );

      if (deveProcessar) {
        setTimeout(processarCelulas, 100);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  async function init() {
    adicionarEstilos();
    await carregarFeriados();
    processarCelulas();
    observarMudancas();

    ['btn-prev', 'btn-next'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => setTimeout(processarCelulas, 300));
    });

    ['select-month', 'select-year'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => setTimeout(processarCelulas, 300));
    });

    console.log('[SIPLUS] features/feriados.js inicializado.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
