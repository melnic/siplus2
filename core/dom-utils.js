/*
  core/dom-utils.js
  ============================================================================
  Pequenos utilitários de DOM reutilizados pelas features.

  CHANGELOG
  - v2.0.0: waitForElement reescrito para casar com o que passou a ser
    usado em produção: observa continuamente (não para após o primeiro
    achado) e cobre MÚLTIPLOS elementos (querySelectorAll + WeakSet),
    chamando o callback uma vez para cada elemento NOVO que aparecer.
    Substituiu de vez o antigo waitForKeyElements (baseado em jQuery),
    removido por ter causado conflito com o jQuery da própria página do
    SIPLAN (ver histórico da revisão de redesign.js).
  ============================================================================
*/

(function () {
  'use strict';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /**
   * Observa o DOM com MutationObserver e chama o callback uma vez para
   * cada elemento NOVO que casar com o seletor (nunca para de observar).
   * Sem jQuery, sem dependência externa.
   *
   * @param {string} selector
   * @param {(el: Element) => void} callback
   */
  function waitForElement(selector, callback) {
    const handled = new WeakSet();

    function scan() {
      document.querySelectorAll(selector).forEach((el) => {
        if (handled.has(el)) return;
        handled.add(el);
        callback(el);
      });
    }

    scan();

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  window.SiplusDomUtils = {
    escapeHtml,
    waitForElement
  };
})();
