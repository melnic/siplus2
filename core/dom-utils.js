/*
  core/dom-utils.js
  ============================================================================
  Pequenos utilitários de DOM reutilizados pelas features.

  NOTA IMPORTANTE sobre @require externos:
  Os scripts originais usavam:
    @require https://gist.github.com/raw/2625891/waitForKeyElements.js
    @require https://raw.githubusercontent.com/jeresig/jquery.hotkeys/master/jquery.hotkeys.js

  Essas URLs não são "pinadas" em uma versão/commit específico. Se o autor
  do gist/repo alterar o conteúdo, TODOS os scripts que dependem dele mudam
  de comportamento sem aviso, e isso também não funciona no modelo de
  extensão de navegador (Manifest V3 não permite carregar código remoto).

  Recomendação: baixar o conteúdo atual de waitForKeyElements.js e do
  jquery.hotkeys.js UMA VEZ e vendorizá-los como arquivos locais
  (core/vendor/waitForKeyElements.js, core/vendor/jquery.hotkeys.js),
  referenciados via @require file:// (Tampermonkey) ou bundle (extensão).
  Este projeto assume que isso já foi feito e que os arquivos vendorizados
  são carregados antes deste.
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
   * Espera um elemento aparecer no DOM (fallback simples caso o
   * waitForKeyElements vendorizado não esteja disponível). Usa
   * MutationObserver em vez de polling.
   *
   * @param {string} selector
   * @param {(el: Element) => void} callback
   * @param {boolean} once  se true, para de observar após o primeiro match
   */
  function waitForElement(selector, callback, once = true) {
    const existing = document.querySelector(selector);
    if (existing) {
      callback(existing);
      if (once) return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
        if (once) observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  window.SiplusDomUtils = {
    escapeHtml,
    waitForElement
  };
})();
