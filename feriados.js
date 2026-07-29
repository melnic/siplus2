// ==UserScript==
// @name         SIPLUS - Pintar Feriados no Calendário
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Pinta as células do calendário SIPLAN com base nos feriados
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @match        https://webapps.sorocaba.sescsp.org.br/siplan/*
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/feriados.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/feriados.js
// ==/UserScript==

/*
  CHANGELOG
  - 2.1.0: Revertido o fetch() remoto de data/feriados.json introduzido na
    2.0.0. Ele funcionava em teoria, mas causou (ou é suspeito de causar)
    travamento de página em branco ao ser combinado com outros @require
    remotos num ambiente de rede mais restrito. Os dados voltaram a ficar
    embutidos no próprio arquivo (como no script .user.js original),
    eliminando qualquer dependência de rede durante o carregamento da
    página. Se no futuro migrar para extensão de navegador, ainda vale a
    pena reaproveitar data/feriados.json via chrome.runtime.getURL(...),
    que não tem esse tipo de restrição de rede.
  - 2.0.0 (histórico): tentativa de usar data/feriados.json como fonte
    única via fetch remoto.
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

  // Dados embutidos diretamente aqui (fonte original: data/feriados.json do
  // repositório). Antes esta lista vinha de um fetch() remoto ao GitHub —
  // trocado por dados locais para eliminar qualquer dependência de rede
  // durante o carregamento da página do SIPLAN.
  const FERIADOS =   [
    {
      "data": "2026-06-04",
      "tipo": "aberta",
      "descricao": "Corpus Christi"
    },
    {
      "data": "2026-06-13",
      "tipo": "aberta",
      "descricao": "Jogo Brasil: 19h"
    },
    {
      "data": "2026-06-19",
      "tipo": "aberta",
      "descricao": "Jogo Brasil: 21h30. Unidade Fecha 19h"
    },
    {
      "data": "2026-06-24",
      "tipo": "aberta",
      "descricao": "Jogo Brasil: 19h"
    },
    {
      "data": "2026-06-29",
      "tipo": "fechada",
      "descricao": "Jogo Brasil: 14h"
    },
    {
      "data": "2026-07-05",
      "tipo": "aberta",
      "descricao": "Oitavas de Final: 17h"
    },
    {
      "data": "2026-07-11",
      "tipo": "aberta",
      "descricao": "Quartas de Final: 18h"
    },
    {
      "data": "2026-07-15",
      "tipo": "aberta",
      "descricao": "Semifinal: 16h"
    },
    {
      "data": "2026-07-19",
      "tipo": "aberta",
      "descricao": "Final: 16h"
    },
    {
      "data": "2026-07-09",
      "tipo": "aberta",
      "descricao": "Revolução Constitucionalista"
    },
    {
      "data": "2026-08-15",
      "tipo": "aberta",
      "descricao": "Aniversário de Sorocaba"
    },
    {
      "data": "2026-09-07",
      "tipo": "aberta",
      "descricao": "Independência do Brasil"
    },
    {
      "data": "2026-09-08",
      "tipo": "fechada",
      "descricao": "Independência do Brasil"
    },
    {
      "data": "2026-10-04",
      "tipo": "fechada",
      "descricao": "Primeiro Turno"
    },
    {
      "data": "2026-10-25",
      "tipo": "fechada",
      "descricao": "Fecha se tiver segundo turno"
    },
    {
      "data": "2026-10-12",
      "tipo": "aberta",
      "descricao": "Nossa Senhora Aparecida"
    },
    {
      "data": "2026-10-13",
      "tipo": "fechada",
      "descricao": "Nossa Senhora Aparecida"
    },
    {
      "data": "2026-11-02",
      "tipo": "aberta",
      "descricao": "Finados"
    },
    {
      "data": "2026-11-03",
      "tipo": "fechada",
      "descricao": "Finados"
    },
    {
      "data": "2026-11-15",
      "tipo": "aberta",
      "descricao": "Proclamação da República"
    },
    {
      "data": "2026-11-20",
      "tipo": "aberta",
      "descricao": "Consciência Negra"
    },
    {
      "data": "2027-02-08",
      "tipo": "aberta",
      "descricao": "Carnaval"
    },
    {
      "data": "2027-02-09",
      "tipo": "aberta",
      "descricao": "Carnaval"
    },
    {
      "data": "2027-02-10",
      "tipo": "fechada",
      "descricao": "Cinzas"
    },
    {
      "data": "2027-04-21",
      "tipo": "aberta",
      "descricao": "Tiradentes"
    },
    {
      "data": "2027-05-27",
      "tipo": "aberta",
      "descricao": "Corpus Christi"
    },
    {
      "data": "2027-07-09",
      "tipo": "aberta",
      "descricao": "Revolução Constitucionalista"
    },
    {
      "data": "2027-08-15",
      "tipo": "aberta",
      "descricao": "Aniversário de Sorocaba"
    },
    {
      "data": "2027-09-07",
      "tipo": "aberta",
      "descricao": "Independência"
    },
    {
      "data": "2027-10-12",
      "tipo": "aberta",
      "descricao": "Nossa Senhora"
    },
    {
      "data": "2027-11-02",
      "tipo": "aberta",
      "descricao": "Finados"
    },
    {
      "data": "2027-11-15",
      "tipo": "aberta",
      "descricao": "República"
    },
    {
      "data": "2027-11-16",
      "tipo": "fechada",
      "descricao": "República"
    }
  ];

  let feriadosPorData = {}; // { 'AAAA-MM-DD': {tipo, descricao} }

  function carregarFeriados() {
    feriadosPorData = {};
    FERIADOS.forEach((f) => {
      feriadosPorData[f.data] = f;
    });
    console.log(`[SIPLUS/feriados] ${FERIADOS.length} feriados carregados (embutidos).`);
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

  function init() {
    adicionarEstilos();
    carregarFeriados();
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
