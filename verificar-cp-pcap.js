// ==UserScript==
// @name         SIPLUS - Verificar CP/PCAP do Mês
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Botão na tela de calendário que verifica, para todas as ações listadas, se têm PCAP e Carta Proposta anexados — mostra selos verde/vermelho na visualização em lista.
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/verificar-cp-pcap.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/verificar-cp-pcap.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/xhr-interceptor.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/dom-utils.js
// ==/UserScript==

/*
  NOTA IMPORTANTE sobre por que os selos aparecem na LISTA, não na grade:
  A grade visual do calendário (.fc-event) não carrega nenhum ID de ação
  nos seus elementos — só título e horário como texto, posicionados via
  CSS absoluto (left/top calculados pelo FullCalendar). Descobrir a que
  ação cada bloco pertence exigiria calcular pixel → coluna do dia → linha
  da semana, o que é frágil e caro de manter.

  Já a visualização em LISTA (#list-calendar-content, ativada pelo botão
  nativo #btn-show-list, ao lado de #btn-show-calendar) tem
  data-atividadeid="..." direto em cada item — sem ambiguidade nenhuma.
  Por isso este script aplica os selos ali, e alterna para essa
  visualização automaticamente ao concluir a verificação.

  Depende de core/xhr-interceptor.js (evento "siplus:atividades-lista-loaded")
  e core/dom-utils.js (waitForElement), carregados via @require.
*/

(function () {
  'use strict';

  const { waitForElement } = window.SiplusDomUtils;

  const CONCORRENCIA_MAXIMA = 4; // requisições simultâneas ao verificar

  // cache: atividadeId (string) -> { temPcap, temCartaProposta }
  const cache = new Map();

  // Guarda a lista mais recente recebida da grade do calendário (mês,
  // semana ou dia — qualquer endpoint api/atividade?start=...).
  let ultimaLista = null;

  document.addEventListener('siplus:atividades-lista-loaded', (evento) => {
    if (Array.isArray(evento.detail.data)) {
      ultimaLista = evento.detail.data;
    }
  });

  // --------------------------------------------------------------------
  // Botão na barra de navegação do calendário
  // --------------------------------------------------------------------

  waitForElement('#agenda-btn-nav-container', inserirBotao);

  function inserirBotao(container) {
    if (document.getElementById('btn-verificar-cp-pcap')) return;

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn';
    botao.id = 'btn-verificar-cp-pcap';
    botao.title = 'Verificar PCAP e Carta Proposta de todas as ações listadas';
    botao.textContent = '🔍 CP/PCAP';

    botao.addEventListener('click', () => {
      verificarTodos(botao);
    });

    container.appendChild(botao);
  }

  // --------------------------------------------------------------------
  // Verificação (fetch de cada ação única, com limite de concorrência)
  // --------------------------------------------------------------------

  const RE_PCAP = /pcap/i;
  const RE_CARTA_PROPOSTA = /carta[\s_-]*proposta|(^|[^a-zà-ÿ])cp([^a-zà-ÿ]|$)/i;

  function calcularStatus(atividade) {
    const anexosGerais = atividade.anexos || [];
    const anexosDosServicos = (atividade.servicos || []).flatMap((s) => s.arquivos || []);
    const todosAnexos = anexosGerais.concat(anexosDosServicos);
    const nomes = todosAnexos.map((a) => `${a.nome || ''} ${a.arquivo || ''}`);

    return {
      temPcap: nomes.some((n) => RE_PCAP.test(n)),
      temCartaProposta: nomes.some((n) => RE_CARTA_PROPOSTA.test(n))
    };
  }

  async function buscarAtividade(id) {
    const url = `${window.location.origin}/siplan/api/atividade/${id}`;
    const resp = await fetch(url, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar atividade ${id}`);
    return resp.json();
  }

  async function verificarEmLotes(ids, aoProgredir) {
    let concluidos = 0;
    for (let i = 0; i < ids.length; i += CONCORRENCIA_MAXIMA) {
      const lote = ids.slice(i, i + CONCORRENCIA_MAXIMA);
      await Promise.all(
        lote.map(async (id) => {
          try {
            const atividade = await buscarAtividade(id);
            cache.set(String(id), calcularStatus(atividade));
          } catch (err) {
            console.error('[SIPLUS/cp-pcap] Falha ao verificar atividade', id, err);
            cache.set(String(id), { erro: true });
          } finally {
            concluidos++;
            aoProgredir(concluidos, ids.length);
          }
        })
      );
    }
  }

  async function verificarTodos(botao) {
    if (!ultimaLista || ultimaLista.length === 0) {
      alert('Ainda não há dados do calendário carregados. Aguarde a página carregar (ou troque de mês) e tente de novo.');
      return;
    }

    const idsUnicos = [...new Set(ultimaLista.map((item) => String(item.atividadeId)).filter(Boolean))];
    const idsNovos = idsUnicos.filter((id) => !cache.has(id));

    const textoOriginal = botao.textContent;
    botao.disabled = true;

    if (idsNovos.length === 0) {
      botao.textContent = '✓ Já verificado';
    } else {
      await verificarEmLotes(idsNovos, (feito, total) => {
        botao.textContent = `Verificando ${feito}/${total}...`;
      });
      botao.textContent = '✓ Concluído';
    }

    aplicarBadgesEmTodos();

    // Leva o usuário para a visualização em lista, que é onde os selos
    // aparecem (a grade não tem como recebê-los — ver nota no topo).
    const btnShowList = document.getElementById('btn-show-list');
    if (btnShowList) btnShowList.click();

    setTimeout(() => {
      botao.textContent = textoOriginal;
      botao.disabled = false;
    }, 2000);
  }

  // --------------------------------------------------------------------
  // Aplicação dos selos na visualização em lista
  // --------------------------------------------------------------------

  function criarBadge(label, ok, motivoAusente) {
    const span = document.createElement('span');
    span.className = 'siplus-badge-cp-pcap';
    span.textContent = label;
    span.title = ok ? `${label} encontrado` : motivoAusente;
    span.style.display = 'inline-block';
    span.style.fontSize = '10px';
    span.style.fontWeight = 'bold';
    span.style.lineHeight = '1';
    span.style.padding = '2px 5px';
    span.style.borderRadius = '3px';
    span.style.marginLeft = '4px';
    span.style.color = '#fff';
    span.style.backgroundColor = ok ? '#198754' : '#dc3545';
    span.style.verticalAlign = 'middle';
    return span;
  }

  function aplicarBadge(link) {
    const atividadeId = link.getAttribute('data-atividadeid');
    if (!atividadeId) return;

    const status = cache.get(atividadeId);
    if (!status) return; // ainda não verificado — sem badge por enquanto

    // Remove badges antigos deste link antes de reaplicar (evita duplicar
    // ao rodar a verificação mais de uma vez).
    link.parentElement.querySelectorAll('.siplus-badge-cp-pcap').forEach((el) => el.remove());

    if (status.erro) {
      const span = document.createElement('span');
      span.className = 'siplus-badge-cp-pcap';
      span.textContent = '⚠️';
      span.title = 'Falha ao verificar esta ação';
      span.style.marginLeft = '4px';
      link.insertAdjacentElement('afterend', span);
      return;
    }

    const badgePcap = criarBadge('PCAP', status.temPcap, 'PCAP ausente');
    const badgeCp = criarBadge('CP', status.temCartaProposta, 'Carta Proposta ausente');

    link.insertAdjacentElement('afterend', badgeCp);
    link.insertAdjacentElement('afterend', badgePcap);
  }

  function aplicarBadgesEmTodos() {
    document.querySelectorAll('a[name="link-atividade"][data-atividadeid]').forEach(aplicarBadge);
  }

  // Observador passivo: se a lista for re-renderizada (ex: trocar de mês)
  // depois de já termos alguns IDs em cache, os novos links já nascem com
  // o selo aplicado, sem precisar clicar no botão de novo.
  waitForElement('a[name="link-atividade"][data-atividadeid]', aplicarBadge);

  console.log('[SIPLUS] features/verificar-cp-pcap.js carregado.');
})();
