// ==UserScript==
// @name         SIPLUS - Scan Conflitos Espaços
// @namespace    http://tampermonkey.net/
// @version      26.01.01
// @description  Verifica conflitos de horário/local entre ações no calendário
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @require      core/xhr-interceptor.js
// @require      core/date-utils.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.01:
    - Usa core/xhr-interceptor.js (evento "siplus:atividades-lista-loaded")
      em vez de patch próprio de XMLHttpRequest.
    - Usa core/date-utils.js (converterParaData) em vez de duplicar.
    - "TAB" para alternar eventos sem conflito virou atalho documentado
      (mantido idêntico ao original).
    - Não depende mais de jQuery/waitForKeyElements: este arquivo já usava
      apenas DOM puro (querySelectorAll, classList), então o @require de
      waitForKeyElements.js que existia no script original era supérfluo
      — removido.

  MELHORIAS PENDENTES (mantidas do original):
  - Conflitos de camarim (bloco de constantes camarins_* ainda não usado
    em nenhuma função — mantido comentado abaixo como referência para quem
    for implementar a próxima melhoria).
*/

(function () {
  'use strict';

  const { converterParaData } = window.SiplusDateUtils;

  const INTERVALO_MINIMO = 60; // minutos
  const CSS_CONFLITOS = `
    .intervaloCurto { border-left: 3px solid #e6ff00 !important; margin-left: -3px !important; }
    .conflito { border-left: 3px solid #ff2859 !important; margin-left: -3px !important; }
  `;

  // Referência para a próxima melhoria (conflitos de camarim/alimentação):
  // const CAMARINS_START = 'http://webapps.sorocaba.sescsp.org.br/siplan/api/atividade?';
  // const CAMARINS = 'lo=96000000000038&lo=96000000000039&...';
  // const CAMARINS_END = '&av=TODAS&servicos=ALIMENTACAO';

  document.addEventListener('siplus:atividades-lista-loaded', (evento) => {
    scanConflitos(evento.detail.data);
    inserirBtnEventToggle();
  });

  document.addEventListener('keydown', (e) => {
    // Atalho TAB: mostra/oculta eventos que não têm conflito.
    if (e.key === 'Tab') {
      toggleEvents();
    }
  });

  function toggleEvents() {
    const events = document.querySelectorAll('div.fc-event:not(.conflito):not(.intervaloCurto)');
    events.forEach((event) => {
      event.style.display = event.style.display === 'none' ? 'block' : 'none';
    });
  }

  function inserirBtnEventToggle() {
    if (document.getElementById('eventToggle')) return;

    const container = document.getElementById('agenda-btn-nav-container');
    if (!container) return;

    const button = document.createElement('button');
    button.classList.add('btn');
    button.id = 'eventToggle';

    const icon = document.createElement('i');
    icon.classList.add('icon-eye-open');
    button.appendChild(icon);

    container.appendChild(button);
    button.addEventListener('click', toggleEvents);
  }

  function filtrarDuplicatas(dados) {
    const idsVistos = new Set();
    return dados.filter((item) => {
      if (idsVistos.has(item.id)) return false;
      idsVistos.add(item.id);
      return true;
    });
  }

  function scanConflitos(dadosBrutos) {
    const dados = filtrarDuplicatas(dadosBrutos);
    const acoesDiv = document.querySelectorAll('.fc-event');

    if (!document.getElementById('siplus-css-conflitos')) {
      const style = document.createElement('style');
      style.id = 'siplus-css-conflitos';
      style.textContent = CSS_CONFLITOS;
      document.head.appendChild(style);
    }

    dados.forEach((item, index) => {
      item.div = acoesDiv[index];
      item.inicio = converterParaData(item.start);
      item.fim = converterParaData(item.end);

      if (/\[RS\]/.test(item.title) && item.div) {
        item.div.style.opacity = 0.3;
      }
    });

    scanLocais(dados);
  }

  function scanLocais(dados) {
    const locaisUsados = [...new Set(dados.map((item) => item.local))];

    locaisUsados.forEach((local) => {
      const acoesLocal = dados.filter((item) => item.local === local);
      scanDatas(acoesLocal);
    });
  }

  function scanDatas(itensDoLocal) {
    for (let i = 0; i < itensDoLocal.length; i++) {
      const acao = itensDoLocal[i];

      for (let j = i + 1; j < itensDoLocal.length; j++) {
        const comparada = itensDoLocal[j];
        if (acao.id === comparada.id) continue;
        if (!acao.div || !comparada.div) continue;

        const resultado = verificarConflito(acao, comparada);

        if (resultado.conflito) {
          acao.div.classList.add('conflito');
          comparada.div.classList.add('conflito');
        } else if (resultado.intervaloCurto) {
          acao.div.classList.add('intervaloCurto');
          comparada.div.classList.add('intervaloCurto');
        }
      }
    }
  }

  function verificarConflito(data1, data2) {
    const diffMs = Math.abs(data1.fim - data2.inicio);
    const diffHrs = diffMs / (1000 * 60 * INTERVALO_MINIMO);

    const conflito = data1.inicio < data2.fim && data2.inicio < data1.fim;
    return { conflito, intervaloCurto: diffHrs < 1 };
  }

  console.log('[SIPLUS] features/scan-conflitos.js carregado.');
})();
