/*
  core/date-utils.js
  ============================================================================
  Utilitários de data/hora reutilizados por várias features (antes duplicados
  em scanconflitos.user.js e revisor.user.js de forma idêntica).

  Exposto em window.SiplusDateUtils para uso pelas outras features via
  @require ou concatenação simples.
  ============================================================================
*/

(function () {
  'use strict';

  /**
   * Converte string "DD/MM/AAAA HH:MM" (formato usado pelo SIPLAN) em Date.
   */
  function converterParaData(data) {
    if (!data) return null;
    const [dataParte, horaParte] = data.split(' ');
    if (!dataParte || !horaParte) return null;

    const [dia, mes, ano] = dataParte.split('/').map(Number);
    const [hora, minuto] = horaParte.split(':').map(Number);

    return new Date(ano, mes - 1, dia, hora, minuto);
  }

  /**
   * Converte "DD/MM/AAAA" <-> "AAAA-MM-DD" (usado pelo módulo de feriados).
   */
  function converterDataBRparaISO(dataBR) {
    if (!dataBR) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataBR)) return dataBR;

    const partes = dataBR.split('/');
    if (partes.length !== 3) return dataBR;

    const [dia, mes, ano] = partes;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  function converterDataISOparaBR(dataISO) {
    if (!dataISO) return null;
    const partes = dataISO.split('-');
    if (partes.length !== 3) return dataISO;
    const [ano, mes, dia] = partes;
    return `${dia}/${mes}/${ano}`;
  }

  /**
   * Formata número como Real brasileiro (R$ 1.234,56).
   */
  function toReais(numero) {
    return Number(numero).toLocaleString('pt-br', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  window.SiplusDateUtils = {
    converterParaData,
    converterDataBRparaISO,
    converterDataISOparaBR,
    toReais
  };
})();
