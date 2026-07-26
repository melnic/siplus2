// ==UserScript==
// @name         SIPLUS - Botões Meses Atual e Futuros
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  Adiciona botões para o mês atual e próximos 4 meses no calendário
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/menu-meses.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/menu-meses.js
// ==/UserScript==

/*
  CHANGELOG
  - 1.5.0: sem mudanças de comportamento; apenas padronização de cabeçalho
    e nome de arquivo dentro da nova estrutura de pastas. Este já era o
    módulo mais robusto do conjunto (usa MutationObserver corretamente e
    se recupera se o container for recriado pelo Angular).
*/

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    #select-month { width: 100px !important; max-width: 100px !important; }
    #select-year { width: 70px !important; max-width: 70px !important; }
    #select-month-container { display: inline-flex !important; gap: 5px !important; align-items: center !important; }
    .btn-mes-rapido.atual { font-weight: bold; background-color: #f0f0f0; border: 2px solid #ccc; }
  `;
  document.head.appendChild(style);

  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  function calcularMesAno(offset) {
    const dataAtual = new Date();
    const mesAtual = dataAtual.getMonth();
    const anoAtual = dataAtual.getFullYear();

    let novoMes = mesAtual + offset;
    let novoAno = anoAtual;

    if (novoMes >= 12) {
      novoAno += Math.floor(novoMes / 12);
      novoMes = novoMes % 12;
    }

    return { mes: MESES[novoMes], ano: novoAno };
  }

  function getNomeMesSistema(offset) {
    return calcularMesAno(offset).mes.substring(0, 3);
  }

  function navegarParaMesSistema(offset) {
    const selectMes = document.querySelector('#select-month');
    const selectAno = document.querySelector('#select-year');

    if (!selectMes || !selectAno) {
      console.error('[SIPLUS/menu-meses] Elementos de seleção não encontrados ao navegar');
      return;
    }

    const { mes, ano } = calcularMesAno(offset);

    selectMes.value = mes;
    selectAno.value = ano.toString();

    selectMes.dispatchEvent(new Event('change', { bubbles: true }));
    selectAno.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function criarBotoesContainer() {
    const botoesContainer = document.createElement('div');
    botoesContainer.id = 'botoes-meses-container';
    botoesContainer.style.display = 'inline-block';
    botoesContainer.style.marginLeft = '5px';
    botoesContainer.style.verticalAlign = 'middle';

    for (let i = 0; i <= 4; i++) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = i === 0 ? 'btn btn-mes-rapido atual' : 'btn btn-mes-rapido';
      botao.style.padding = '4px 8px';
      botao.style.fontSize = '12px';
      botao.dataset.mesOffset = i;
      botao.textContent = getNomeMesSistema(i);

      botao.addEventListener('click', function () {
        navegarParaMesSistema(parseInt(this.dataset.mesOffset, 10));
      });

      botoesContainer.appendChild(botao);
    }

    return botoesContainer;
  }

  function tentarInserirBotoes() {
    const container = document.querySelector('#select-month-container');
    if (!container) return false;

    const existente = document.querySelector('#botoes-meses-container');

    if (existente && existente.isConnected) return true;

    if (existente && !existente.isConnected) {
      existente.remove();
    }

    const botoesContainer = criarBotoesContainer();
    container.parentNode.insertBefore(botoesContainer, container.nextSibling);
    return true;
  }

  const observer = new MutationObserver(() => {
    tentarInserirBotoes();
  });

  function iniciarObserver() {
    observer.observe(document.body, { childList: true, subtree: true });
    tentarInserirBotoes();
  }

  if (document.body) {
    iniciarObserver();
  } else {
    document.addEventListener('DOMContentLoaded', iniciarObserver);
  }

  console.log('[SIPLUS] features/menu-meses.js carregado.');
})();
