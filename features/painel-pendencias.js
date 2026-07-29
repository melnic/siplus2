// ==UserScript==
// @name         SIPLUS - Painel de Pendências
// @namespace    https://sesc.local/pendencias-panel
// @version      3.4.0
// @description  Caixa flutuante e arrastável que lista pendências (corrigir / validar / sugestão), agrupadas, com botão de correção automática quando disponível. Visual Bootstrap 5, isolado via Shadow DOM.
// @author       Bruno
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/painel-pendencias.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/painel-pendencias.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/dom-utils.js
// ==/UserScript==

/*
  ============================================================================
  Este módulo já estava bem estruturado no script original (Shadow DOM para
  isolar CSS, API pública clara setData/addItem/clear/destroy). Mudanças
  nesta revisão:

  - v3.4.0: Renomeado o grupo verde de "Sugestão" para "Confirmado".
    Adicionado checkbox em cada item para marcá-lo como resolvido/dispensar
    (some da lista). O estado fica salvo no localStorage do navegador,
    separado por ação (usa o ID de 14 dígitos da URL como chave), e é
    recarregado automaticamente sempre que setData() é chamado — incluindo
    ao trocar de ação dentro do SPA sem recarregar a página. Botão novo no
    cabeçalho (👁️) reexibe todos os itens dispensados da ação atual, caso
    algo tenha sido marcado por engano. Quando migrar para um backend
    externo (Supabase, por exemplo), só carregarDispensados/
    salvarDispensados precisam mudar — o resto do código já está isolado
    dessa decisão.
  - v3.3.0: O tooltip de `explicacao` agora também aparece ao passar o
    mouse sobre o TEXTO do item (não só sobre o botão 🔧 Corrigir).
    Necessário para os itens de confirmação "sugestão" (ex: "PCAP:
    nome_truncado…") que não têm botão de correção, mas precisam mostrar
    o nome completo do arquivo no hover.
  - v3.2.0: Adicionado suporte a `localizar` — uma função opcional que
    retorna o elemento DOM (na PÁGINA, não no painel) relacionado à
    pendência. Quando presente, um botão 📍 aparece ao lado do item; ao
    clicar, a página rola suavemente até o elemento (scrollIntoView) e ele
    recebe um destaque visual temporário (borda amarela piscando ~2s).
    Objetivo: permitir ao usuário ir direto ao campo/seção com problema em
    vez de precisar procurar manualmente.
  - v3.1.0: usa window.SiplusDomUtils.escapeHtml (core/dom-utils.js) em vez
    de reimplementar a mesma função; nenhuma mudança de comportamento.
    Passa a ser alimentado, opcionalmente, pelos eventos do
    core/xhr-interceptor.js e da feature revisor.js, ao invés de exigir que
    quem o usa chame PendenciasPanel.setData diretamente (ver seção 10).

  COMO USAR
  ============================================================================

  PendenciasPanel.setData(itens)
    Substitui toda a lista de pendências. `itens`:
      {
        gravidade: "corrigir" | "validar" | "sugestao",
        texto: "Texto breve do erro/observação",
        explicacao: "Texto explicativo do que a função de correção fará",
        localizar: function () { return document.querySelector('#algum-id'); }  // opcional
        funcao: function () { ... }   // opcional
      }

  `localizar` deve retornar um elemento DOM (ou null/undefined se não
  encontrar nada — nesse caso o botão 📍 simplesmente não faz nada e um
  aviso é logado no console). Pode ser um seletor fixo simples, ou uma
  busca mais elaborada (ex: encontrar o elemento de uma data específica
  numa lista, comparando texto).

  PendenciasPanel.addItem(item)
  PendenciasPanel.clear()
  PendenciasPanel.destroy()

  A API fica disponível imediatamente e de forma síncrona.
  ============================================================================
*/

(function () {
  'use strict';

  // --------------------------------------------------------------------
  // 0. Configuração / constantes
  // --------------------------------------------------------------------

  const BOOTSTRAP_CSS_URL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
  const GRUPOS = [
    { chave: 'corrigir', label: 'Corrigir', cor: 'danger' },
    { chave: 'validar', label: 'Validar', cor: 'warning' },
    { chave: 'sugestao', label: 'Confirmado', cor: 'success' }
  ];

  const HOST_ID = 'pendencias-panel-host';
  const STORAGE_POS_KEY = 'pendencias-panel-pos';

  const escapeHtml =
    (window.SiplusDomUtils && window.SiplusDomUtils.escapeHtml) ||
    function (str) {
      const div = document.createElement('div');
      div.textContent = str == null ? '' : String(str);
      return div.innerHTML;
    };

  // --------------------------------------------------------------------
  // 1. Estado interno
  // --------------------------------------------------------------------

  let itens = [];
  let nextId = 1;
  let expandedAll = false;
  const expandedGroups = { corrigir: false, validar: false, sugestao: false };

  // --------------------------------------------------------------------
  // 1.1 Itens "dispensados" (checkbox marcado pelo usuário) — persistidos
  // no localStorage, escopados por ação (cada ação tem seu próprio
  // conjunto, identificado pelo ID de 14 dígitos que aparece na URL).
  //
  // NOTA para o futuro: se/quando migrar para um backend externo (ex:
  // Supabase, como discutido), trocar carregarDispensados/salvarDispensados
  // por chamadas de API equivalentes — o resto do código (estaDispensado,
  // dispensarItem, itensPorGrupo) não precisa mudar.
  // --------------------------------------------------------------------

  let dispensados = new Set();

  function acaoIdAtual() {
    const m = window.location.href.match(/96\d{12}/);
    return m ? m[0] : 'geral';
  }

  function storageKeyDispensados() {
    return `siplus-pendencias-dispensados-${acaoIdAtual()}`;
  }

  function carregarDispensados() {
    try {
      const raw = localStorage.getItem(storageKeyDispensados());
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function salvarDispensados() {
    try {
      localStorage.setItem(storageKeyDispensados(), JSON.stringify([...dispensados]));
    } catch (e) {
      /* ignora */
    }
  }

  // Identidade do item é o próprio texto (simplificação: dois itens com
  // texto idêntico na mesma ação são tratados como "o mesmo" item).
  function estaDispensado(texto) {
    return dispensados.has(texto);
  }

  function dispensarItem(texto) {
    dispensados.add(texto);
    salvarDispensados();
    render();
  }

  function reativarItem(texto) {
    dispensados.delete(texto);
    salvarDispensados();
    render();
  }

  // --------------------------------------------------------------------
  // 2. CSS de fallback + estrutural (dentro da shadow root)
  // --------------------------------------------------------------------

  function buildBaseStyles() {
    return `
      :host { all: initial; }

      .pp-panel {
        position: fixed; top: 80px; right: 24px; width: 340px; max-height: 70vh;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px; line-height: 1.4;
        box-shadow: 0 .5rem 1.5rem rgba(0,0,0,.18);
        border-radius: .6rem; overflow: hidden; background: #fff;
        display: flex; flex-direction: column; color: #212529; box-sizing: border-box;
      }

      .pp-panel *, .pp-panel *::before, .pp-panel *::after {
        box-sizing: border-box; font-family: inherit;
      }

      .pp-header {
        cursor: move; user-select: none; padding: .4rem .6rem;
        background: #212529; color: #fff;
        display: flex; align-items: center; justify-content: space-between; gap: .5rem;
        flex-shrink: 0;
      }

      .pp-header .pp-title {
        font-weight: 600; font-size: .85rem;
        display: flex; align-items: center; gap: .5rem; white-space: nowrap;
      }

      .pp-summary { display: flex; align-items: center; gap: .55rem; }
      .pp-summary-item { display: flex; align-items: center; gap: .25rem; font-size: .78rem; font-weight: 600; }

      .pp-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

      .pp-header .pp-actions { display: flex; align-items: center; gap: .35rem; }

      .pp-header button {
        color: #fff; border: 1px solid rgba(255,255,255,.35); background: transparent;
        border-radius: .35rem; padding: .2rem .5rem; line-height: 1; cursor: pointer; font-size: .85rem;
      }
      .pp-header button:hover { background: rgba(255,255,255,.15); }

      .pp-body { overflow-y: auto; padding: .3rem; }

      .pp-group { border-radius: .4rem; margin-bottom: .3rem; overflow: hidden; border: 1px solid rgba(0,0,0,.08); }
      .pp-group:last-child { margin-bottom: 0; }

      .pp-group-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: .3rem .55rem; cursor: pointer; font-weight: 600; gap: .5rem;
      }
      .pp-group-header:hover { filter: brightness(0.97); }
      .pp-group-header .pp-group-label { display: flex; align-items: center; gap: .4rem; }
      .pp-group-header .pp-chevron { transition: transform .15s ease; font-size: .7rem; opacity: .8; display: inline-block; }
      .pp-group.expanded .pp-chevron { transform: rotate(90deg); }

      .pp-group-items { display: none; background: #fff; }
      .pp-group.expanded .pp-group-items { display: block; }

      .pp-item {
        display: flex; align-items: center; justify-content: space-between; gap: .5rem;
        padding: .28rem .55rem .28rem .9rem; border-top: 1px solid rgba(0,0,0,.06);
      }
      .pp-item-text { flex: 1; line-height: 1.3; word-break: break-word; }

      .pp-dismiss-checkbox {
        flex-shrink: 0; margin: 0; cursor: pointer;
      }

      .pp-item-actions {
        display: flex; align-items: center; gap: .3rem; flex-shrink: 0;
      }

      .pp-locate-btn {
        flex-shrink: 0; font-size: .85rem; line-height: 1; padding: .15rem .35rem;
        border-radius: .35rem; cursor: pointer; background: transparent;
        border: 1px solid rgba(0,0,0,.15);
      }
      .pp-locate-btn:hover { background: rgba(0,0,0,.06); }

      .pp-fix-btn {
        flex-shrink: 0; font-size: .76rem; font-weight: 600; padding: .2rem .55rem;
        border-radius: .35rem; cursor: pointer; background: transparent; white-space: nowrap;
        border: 1px solid currentColor;
      }

      .pp-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 1.3rem; height: 1.3rem; padding: 0 .35rem; border-radius: 999px;
        font-size: .72rem; font-weight: 700; color: #fff; line-height: 1;
      }

      .pp-empty { padding: .9rem; text-align: center; color: #6c757d; font-size: .82rem; }

      .pp-panel.pp-minimized .pp-body { display: none; }

      .pp-tooltip-floating {
        position: fixed; background: #212529; color: #fff; padding: .4rem .6rem;
        border-radius: .35rem; font-size: .75rem; font-weight: 400; line-height: 1.35;
        width: 190px; white-space: normal; box-shadow: 0 .25rem .75rem rgba(0,0,0,.25);
        opacity: 0; visibility: hidden; transition: opacity .1s ease; pointer-events: none;
        z-index: 2147483647;
      }
      .pp-tooltip-floating.visible { opacity: 1; visibility: visible; }
      .pp-tooltip-floating::before {
        content: ""; position: absolute; top: 50%; right: 100%; transform: translateY(-50%);
        border: 5px solid transparent; border-right-color: #212529;
      }
      .pp-tooltip-floating.pp-tooltip-flip::before {
        right: auto; left: 100%; border-right-color: transparent; border-left-color: #212529;
      }

      .pp-color-danger  { background:#dc3545; }
      .pp-color-warning { background:#ffc107; }
      .pp-color-success { background:#198754; }

      .pp-border-danger  { border-left: 4px solid #dc3545; }
      .pp-border-warning { border-left: 4px solid #ffc107; }
      .pp-border-success { border-left: 4px solid #198754; }

      .pp-bg-danger-subtle  { background:#fdeeef; color:#842029; }
      .pp-bg-warning-subtle { background:#fff8e1; color:#664d03; }
      .pp-bg-success-subtle { background:#e9f6ef; color:#0f5132; }

      .pp-text-danger  { color:#dc3545; border-color:#dc3545; }
      .pp-text-warning { color:#997404; border-color:#ffc107; }
      .pp-text-success { color:#198754; border-color:#198754; }
    `;
  }

  // --------------------------------------------------------------------
  // 3. Helpers de dados
  // --------------------------------------------------------------------

  function normalizeGravidade(g) {
    if (!g) return null;
    const v = String(g).trim().toLowerCase();
    if (v === 'corrigir') return 'corrigir';
    if (v === 'validar') return 'validar';
    if (v === 'sugestao' || v === 'sugestão' || v === 'sugerido') return 'sugestao';
    return null;
  }

  function itensPorGrupo(chave) {
    return itens.filter((it) => it.gravidade === chave && !estaDispensado(it.texto));
  }

  function totalItens() {
    return itens.filter((it) => !estaDispensado(it.texto)).length;
  }

  // --------------------------------------------------------------------
  // 4. Construção do DOM (host + shadow root)
  // --------------------------------------------------------------------

  let hostEl = null;
  let shadow = null;
  let panelEl = null;
  let bodyEl = null;
  let countEls = {};
  let expandAllBtnEl = null;

  function buildPanel() {
    const existingHost = document.getElementById(HOST_ID);
    if (existingHost && existingHost.shadowRoot) {
      hostEl = existingHost;
      shadow = existingHost.shadowRoot;
      panelEl = shadow.querySelector('.pp-panel');
      bodyEl = shadow.querySelector('.pp-body');
      countEls = {
        corrigir: shadow.querySelector('.pp-count-corrigir'),
        validar: shadow.querySelector('.pp-count-validar'),
        sugestao: shadow.querySelector('.pp-count-sugestao')
      };
      expandAllBtnEl = shadow.querySelector('.pp-expand-all');
      return;
    }

    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    document.body.appendChild(hostEl);

    shadow = hostEl.attachShadow({ mode: 'open' });

    const baseStyleEl = document.createElement('style');
    baseStyleEl.textContent = buildBaseStyles();
    shadow.appendChild(baseStyleEl);

    const bsLink = document.createElement('link');
    bsLink.rel = 'stylesheet';
    bsLink.href = BOOTSTRAP_CSS_URL;
    shadow.appendChild(bsLink);

    panelEl = document.createElement('div');
    panelEl.className = 'pp-panel';
    panelEl.innerHTML = `
      <div class="pp-header">
        <div class="pp-title">
          <span>Pendências</span>
          <span class="pp-summary">
            <span class="pp-summary-item"><span class="pp-dot pp-color-danger"></span><span class="pp-count-corrigir">0</span></span>
            <span class="pp-summary-item"><span class="pp-dot pp-color-warning"></span><span class="pp-count-validar">0</span></span>
            <span class="pp-summary-item"><span class="pp-dot pp-color-success"></span><span class="pp-count-sugestao">0</span></span>
          </span>
        </div>
        <div class="pp-actions">
          <button type="button" class="pp-show-dismissed" title="Reexibir itens marcados como resolvidos nesta ação">👁️</button>
          <button type="button" class="pp-expand-all" title="Expandir/recolher todos os grupos">⇕</button>
          <button type="button" class="pp-minimize" title="Minimizar">—</button>
        </div>
      </div>
      <div class="pp-body"></div>
    `;
    shadow.appendChild(panelEl);

    bodyEl = panelEl.querySelector('.pp-body');
    countEls = {
      corrigir: panelEl.querySelector('.pp-count-corrigir'),
      validar: panelEl.querySelector('.pp-count-validar'),
      sugestao: panelEl.querySelector('.pp-count-sugestao')
    };
    expandAllBtnEl = panelEl.querySelector('.pp-expand-all');

    setupDrag(panelEl, panelEl.querySelector('.pp-header'));
    setupHeaderButtons();
    restorePosition();
  }

  function setupHeaderButtons() {
    expandAllBtnEl.addEventListener('click', () => {
      expandedAll = !expandedAll;
      GRUPOS.forEach((g) => (expandedGroups[g.chave] = expandedAll));
      render();
    });

    panelEl.querySelector('.pp-minimize').addEventListener('click', () => {
      panelEl.classList.toggle('pp-minimized');
    });

    panelEl.querySelector('.pp-show-dismissed').addEventListener('click', () => {
      if (dispensados.size === 0) return;
      dispensados = new Set();
      salvarDispensados();
      render();
    });
  }

  // --------------------------------------------------------------------
  // 5. Drag (arrastar pelo cabeçalho)
  // --------------------------------------------------------------------

  function setupDrag(panel, handleEl) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let pendingX = null, pendingY = null, rafScheduled = false;

    function applyPosition() {
      rafScheduled = false;
      if (pendingX === null) return;

      const dx = pendingX - startX;
      const dy = pendingY - startY;

      panel.style.top = `${Math.max(0, startTop + dy)}px`;
      panel.style.left = `${Math.max(0, startLeft + dx)}px`;
    }

    handleEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;

      dragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = panel.getBoundingClientRect();
      startTop = rect.top;
      startLeft = rect.left;
      panel.style.left = `${startLeft}px`;
      panel.style.right = 'auto';

      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(applyPosition);
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      pendingX = null;
      pendingY = null;
      document.body.style.userSelect = '';
      savePosition();
    });
  }

  function savePosition() {
    try {
      const rect = panelEl.getBoundingClientRect();
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify({ top: rect.top, left: rect.left }));
    } catch (e) { /* ignora */ }
  }

  function restorePosition() {
    try {
      const raw = localStorage.getItem(STORAGE_POS_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (typeof pos.top === 'number' && typeof pos.left === 'number') {
        panelEl.style.top = `${pos.top}px`;
        panelEl.style.left = `${pos.left}px`;
        panelEl.style.right = 'auto';
      }
    } catch (e) { /* ignora */ }
  }

  // --------------------------------------------------------------------
  // 6. Render dos grupos e itens
  // --------------------------------------------------------------------

  function render() {
    if (!bodyEl) return;

    GRUPOS.forEach((grupo) => {
      if (countEls[grupo.chave]) {
        countEls[grupo.chave].textContent = String(itensPorGrupo(grupo.chave).length);
      }
    });

    if (totalItens() === 0) {
      bodyEl.innerHTML = `<div class="pp-empty">✓ Nenhuma pendência</div>`;
      return;
    }

    bodyEl.innerHTML = '';

    GRUPOS.forEach((grupo) => {
      const lista = itensPorGrupo(grupo.chave);
      const groupEl = document.createElement('div');
      groupEl.className = `pp-group pp-border-${grupo.cor}` + (expandedGroups[grupo.chave] ? ' expanded' : '');

      groupEl.innerHTML = `
        <div class="pp-group-header pp-bg-${grupo.cor}-subtle">
          <span class="pp-group-label">
            <span class="pp-dot pp-color-${grupo.cor}"></span>
            ${grupo.label}
          </span>
          <span style="display:flex; align-items:center; gap:.5rem;">
            <span class="pp-badge pp-color-${grupo.cor}">${lista.length}</span>
            <span class="pp-chevron">▶</span>
          </span>
        </div>
        <div class="pp-group-items"></div>
      `;

      const headerEl = groupEl.querySelector('.pp-group-header');
      const itemsEl = groupEl.querySelector('.pp-group-items');

      headerEl.addEventListener('click', () => {
        expandedGroups[grupo.chave] = !expandedGroups[grupo.chave];
        groupEl.classList.toggle('expanded', expandedGroups[grupo.chave]);
      });

      if (lista.length === 0) {
        itemsEl.innerHTML = `<div class="pp-empty">Nada nesta categoria</div>`;
      } else {
        lista.forEach((item) => {
          const itemEl = document.createElement('div');
          itemEl.className = 'pp-item';

          const temFuncao = typeof item.funcao === 'function';
          const temLocalizar = typeof item.localizar === 'function';

          itemEl.innerHTML = `
            <input type="checkbox" class="pp-dismiss-checkbox" title="Marcar como resolvido (oculta este item)">
            <span class="pp-item-text">${escapeHtml(item.texto || '')}</span>
            <span class="pp-item-actions">
              ${temLocalizar ? `<button type="button" class="pp-locate-btn" title="Ir até o item na tela">📍</button>` : ''}
              ${temFuncao ? `<button type="button" class="pp-fix-btn pp-text-${grupo.cor}">🔧 Corrigir</button>` : ''}
            </span>
          `;

          const chkDispensar = itemEl.querySelector('.pp-dismiss-checkbox');
          chkDispensar.addEventListener('change', () => {
            if (chkDispensar.checked) dispensarItem(item.texto);
          });

          if (temLocalizar) {
            const btnLocate = itemEl.querySelector('.pp-locate-btn');
            btnLocate.addEventListener('click', () => irParaItem(item));
          }

          // Tooltip no próprio texto do item quando houver `explicacao`
          // (ex: nome completo de um arquivo, quando o texto exibido está
          // truncado). Independente de ter botão de corrigir ou não.
          if (item.explicacao) {
            const textoEl = itemEl.querySelector('.pp-item-text');
            textoEl.addEventListener('mouseenter', () => showTooltip(textoEl, item.explicacao));
            textoEl.addEventListener('mouseleave', hideTooltip);
          }

          if (temFuncao) {
            const btn = itemEl.querySelector('.pp-fix-btn');
            btn.addEventListener('click', () => runFix(item));
            btn.addEventListener('mouseenter', () => showTooltip(btn, item.explicacao || ''));
            btn.addEventListener('mouseleave', hideTooltip);
            btn.addEventListener('focus', () => showTooltip(btn, item.explicacao || ''));
            btn.addEventListener('blur', hideTooltip);
          }

          itemsEl.appendChild(itemEl);
        });
      }

      bodyEl.appendChild(groupEl);
    });
  }

  // --------------------------------------------------------------------
  // 6.1 Tooltip flutuante único
  // --------------------------------------------------------------------

  let tooltipEl = null;

  function ensureTooltipEl() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'pp-tooltip-floating';
    shadow.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(anchorEl, text) {
    const el = ensureTooltipEl();
    el.textContent = text;
    el.classList.remove('pp-tooltip-flip');
    const rect = anchorEl.getBoundingClientRect();
    const tooltipWidth = 190;
    const spaceRight = window.innerWidth - rect.right;

    el.style.top = `${rect.top + rect.height / 2}px`;
    el.style.transform = 'translateY(-50%)';

    if (spaceRight >= tooltipWidth + 16) {
      el.style.left = `${rect.right + 8}px`;
      el.style.right = 'auto';
      el.classList.remove('pp-tooltip-flip');
    } else {
      el.style.left = 'auto';
      el.style.right = `${window.innerWidth - rect.left + 8}px`;
      el.classList.add('pp-tooltip-flip');
    }

    el.classList.add('visible');
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  // --------------------------------------------------------------------
  // 7. Execução da correção
  // --------------------------------------------------------------------

  function runFix(item) {
    try {
      item.funcao(item);
    } catch (err) {
      console.error('[PendenciasPanel] Erro ao executar correção:', err);
    }
  }

  // --------------------------------------------------------------------
  // 7.1 Localização/destaque de item na página (fora do painel)
  // --------------------------------------------------------------------

  const HIGHLIGHT_CLASS = 'siplus-pendencia-destaque';
  let highlightStyleInjetado = false;

  function garantirEstiloDestaque() {
    if (highlightStyleInjetado) return;
    highlightStyleInjetado = true;

    // Este CSS vai no <head> da PÁGINA (não na shadow root do painel),
    // porque o elemento destacado pertence à página, não ao painel.
    const style = document.createElement('style');
    style.textContent = `
      @keyframes ${HIGHLIGHT_CLASS}-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); }
        50% { box-shadow: 0 0 0 6px rgba(255, 193, 7, 0.55); }
      }
      .${HIGHLIGHT_CLASS} {
        outline: 3px solid #ffc107 !important;
        outline-offset: 2px;
        border-radius: 4px;
        animation: ${HIGHLIGHT_CLASS}-pulse 0.8s ease-in-out 3;
      }
    `;
    document.head.appendChild(style);
  }

  function irParaItem(item) {
    let elemento = null;
    try {
      elemento = item.localizar();
    } catch (err) {
      console.error('[PendenciasPanel] Erro ao localizar elemento:', err);
    }

    if (!elemento) {
      console.warn('[PendenciasPanel] Não foi possível localizar o elemento para:', item.texto);
      return;
    }

    garantirEstiloDestaque();

    elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });

    elemento.classList.remove(HIGHLIGHT_CLASS);
    // força reflow para reiniciar a animação caso já esteja destacado
    void elemento.offsetWidth;
    elemento.classList.add(HIGHLIGHT_CLASS);

    setTimeout(() => {
      elemento.classList.remove(HIGHLIGHT_CLASS);
    }, 2600);
  }

  // --------------------------------------------------------------------
  // 8. API pública
  // --------------------------------------------------------------------

  function setData(novosItens) {
    if (!Array.isArray(novosItens)) {
      console.warn('[PendenciasPanel] setData espera um array.');
      return;
    }

    // A ação pode ter mudado desde a última chamada (SPA — a URL muda sem
    // recarregar a página), então recarregamos o conjunto de dispensados
    // correspondente à ação atual.
    dispensados = carregarDispensados();

    itens = novosItens
      .map((raw) => {
        const gravidade = normalizeGravidade(raw.gravidade);
        if (!gravidade) {
          console.warn('[PendenciasPanel] item com gravidade inválida ignorado:', raw);
          return null;
        }
        return {
          id: nextId++,
          gravidade,
          texto: raw.texto || '',
          explicacao: raw.explicacao || '',
          funcao: typeof raw.funcao === 'function' ? raw.funcao : null,
          localizar: typeof raw.localizar === 'function' ? raw.localizar : null
        };
      })
      .filter(Boolean);

    render();
  }

  function addItem(raw) {
    const gravidade = normalizeGravidade(raw && raw.gravidade);
    if (!gravidade) {
      console.warn('[PendenciasPanel] addItem: gravidade inválida.', raw);
      return;
    }
    itens.push({
      id: nextId++,
      gravidade,
      texto: raw.texto || '',
      explicacao: raw.explicacao || '',
      funcao: typeof raw.funcao === 'function' ? raw.funcao : null,
      localizar: typeof raw.localizar === 'function' ? raw.localizar : null
    });
    render();
  }

  function clear() {
    itens = [];
    render();
  }

  function destroy() {
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
    panelEl = null;
    bodyEl = null;
  }

  function onReady(callback) {
    callback(window.PendenciasPanel);
  }

  // --------------------------------------------------------------------
  // 9. Inicialização
  // --------------------------------------------------------------------

  buildPanel();
  render();

  window.PendenciasPanel = { setData, addItem, clear, destroy, onReady };
  window.PendenciasPanelOnReady = onReady;
  window.PendenciasPanelLoaded = true;

  console.log('[SIPLUS] features/painel-pendencias.js carregado.');
})();
