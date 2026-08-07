/*
  core/xhr-interceptor.js
  ============================================================================
  Interceptor ÚNICO de XMLHttpRequest para todo o SIPLUS.

  Por que isso existe:
  Vários scripts (carta_proposta, scanconflitos, revisor) faziam cada um o
  seu próprio "monkey patch" de XMLHttpRequest.prototype.open. Como todos
  rodam na mesma página, o último script a carregar sobrescrevia o `open`
  dos anteriores, e cada um mantinha sua própria variável global `resposta`
  — nada disso conversava entre si e o comportamento dependia da ordem de
  carregamento dos @require/scripts (bug silencioso).

  Este módulo faz o patch UMA ÚNICA VEZ e distribui os dados via
  CustomEvent no `document`. Cada feature apenas escuta o evento que
  interessa, sem tocar em XMLHttpRequest.

  Eventos disparados:
    - "siplus:atividade-loaded"      -> detail: { method, url, data }
        Disparado quando uma resposta de /api/atividade/96... (GET/PUT/POST)
        termina de carregar. `data` já vem com JSON.parse aplicado.

    - "siplus:atividades-lista-loaded" -> detail: { method, url, data }
        Disparado para respostas de /api/atividade?start=... (lista/calendário),
        usado pelo scan de conflitos.

    - "siplus:checklist-loaded" -> detail: { method, url, data }
        Disparado para respostas de /api/solicitacao/checklist?... (telas de
        Pré-análise/Filtro Adm). Cada item já traz qntdArquivos, custo,
        atividadeId, técnico etc. — útil pra verificar PCAP/CP/
        Hospedagem/Passagem sem precisar buscar cada ação individualmente.

    - "siplus:tecnicos-loaded" -> detail: { method, url, data }
        Disparado para respostas de /api/usuario/tecnico?... — catálogo de
        técnicos (id/nome), usado como fallback quando o campo "tecnico"
        de outras respostas vem nulo.

    - "siplus:xhr-error" -> detail: { method, url }
        Disparado se a requisição falhar.

  Uso em uma feature:
    document.addEventListener('siplus:atividade-loaded', (e) => {
      const acao = e.detail.data;
      ...
    });

  Isso também deixa o código muito mais próximo do modelo de uma extensão
  de navegador real (content script escutando mensagens/eventos), o que
  facilita a migração futura.
  ============================================================================
*/

(function () {
  'use strict';

  if (window.__siplusXhrPatched) {
    // Evita duplo-patch caso o arquivo seja incluído mais de uma vez.
    return;
  }
  window.__siplusXhrPatched = true;

  const RE_ATIVIDADE = /api\/atividade\/96\d*(\?|$)/;
  const RE_LISTA = /api\/atividade\?(start=|.*&start=)/;
  const RE_CHECKLIST = /api\/solicitacao\/checklist\?/;
  const RE_TECNICOS = /api\/usuario\/tecnico\?/;

  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (method, url) {
    const isAtividade = RE_ATIVIDADE.test(url);
    const isLista = RE_LISTA.test(url);
    const isChecklist = RE_CHECKLIST.test(url);
    const isTecnicos = RE_TECNICOS.test(url);

    if (isAtividade || isLista || isChecklist || isTecnicos) {
      this.addEventListener('load', function () {
        let data = null;
        try {
          data = JSON.parse(this.responseText);
        } catch (e) {
          console.error('[SIPLUS] Falha ao fazer parse do JSON:', url, e);
          document.dispatchEvent(
            new CustomEvent('siplus:xhr-error', { detail: { method, url } })
          );
          return;
        }

        let eventName;
        if (isAtividade) eventName = 'siplus:atividade-loaded';
        else if (isChecklist) eventName = 'siplus:checklist-loaded';
        else if (isTecnicos) eventName = 'siplus:tecnicos-loaded';
        else eventName = 'siplus:atividades-lista-loaded';

        document.dispatchEvent(
          new CustomEvent(eventName, { detail: { method, url, data } })
        );
      });

      this.addEventListener('error', function () {
        document.dispatchEvent(
          new CustomEvent('siplus:xhr-error', { detail: { method, url } })
        );
      });
    }

    return originalOpen.apply(this, arguments);
  };

  console.log('[SIPLUS] core/xhr-interceptor.js carregado.');
})();
