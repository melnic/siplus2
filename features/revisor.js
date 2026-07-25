// ==UserScript==
// @name         SIPLUS - Verificador de Ação
// @namespace    http://tampermonkey.net/
// @version      26.01.01
// @description  Verifica pendências de preenchimento de uma ação
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require      core/vendor/waitForKeyElements.js
// @require      core/xhr-interceptor.js
// @require      core/date-utils.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.01:
    - Usa core/xhr-interceptor.js em vez de patchar XMLHttpRequest sozinho.
    - Usa core/date-utils.js (converterParaData) em vez de duplicar a função.
    - Ternários usados como comando (`cond ? push() : null`) substituídos por
      `if` simples — mesmo comportamento, mais fácil de ler e dar lint.
    - Se o painel de pendências (features/painel-pendencias.js) estiver
      carregado, os problemas encontrados são enviados para lá via
      PendenciasPanel.setData(), em vez de criar uma <ul> própria fixa no
      canto da tela. Se o painel não estiver disponível, cai no
      comportamento antigo (lista simples inserida no DOM) como fallback.
    - Corrigido regressão desta própria refatoração: ao reescrever o
      callback de '.modal-backdrop' eu tinha trocado (por engano)
      element.on('click', ...) do script original por
      element.addEventListener('click', ...), que não existe em objetos
      jQuery (e waitForKeyElements sempre entrega jQuery, não DOM puro).
      Revertido para .on(...).

  MELHORIAS PENDENTES (mantidas do original):
  - Verificar se derivações são consistentes com o local da ação
  - Facilitar fechamento do Quadro Resumo (parcialmente feito: Esc já fecha)
*/

(function () {
  'use strict';

  const { converterParaData } = window.SiplusDateUtils;
  const waitForKeyElements = window.waitForKeyElements;

  let acaoAtual = null;
  let quadroResumoFirstAppear = false;

  document.addEventListener('siplus:atividade-loaded', (evento) => {
    acaoAtual = evento.detail.data;
    quadroResumoFirstAppear = false;
  });

  waitForKeyElements('#programacao-navbar', verificarAcao);

  // --------------------------------------------------------------------
  // Atalhos de teclado / Quadro Resumo
  // --------------------------------------------------------------------

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      const btn = document.querySelector('#quadro-resumo-modal > div > div.modal-header > button');
      if (btn) btn.click();
    }
  });

  waitForKeyElements('.modal-backdrop', (element) => {
    const btnClose = document.querySelector('#quadro-resumo-modal > div > div.modal-header > button');

    if (!quadroResumoFirstAppear) {
      quadroResumoFirstAppear = true;
      document.body.style.overflowY = 'visible';
    }

    // `element` aqui é um objeto jQuery (é isso que waitForKeyElements
    // entrega), não um nó DOM puro — por isso usamos .on() e não
    // addEventListener, que não existe em objetos jQuery.
    element.on('click', () => {
      if (btnClose) btnClose.click();
    });
  });

  // --------------------------------------------------------------------
  // Regras de verificação
  // --------------------------------------------------------------------

  function camarimAntecipado(data, servico) {
    const conversor = 1000 * 60 * 60;
    const dataAcao = converterParaData(data.dataAgenda.dataInicio);
    const dataServico = converterParaData(servico.dataSolicitacao.dataInicio);
    const diferencaHoras = (dataAcao - dataServico) / conversor;

    const conflito = diferencaHoras < 2;
    return !conflito;
  }

  const R_EMAIL =
    /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*/;
  const R_TELEFONE = /(\(?\d{2}\)?\s)?(\d{4,5}[\- ]?\d{4})/;

  /**
   * Roda todas as verificações sobre a ação carregada e retorna uma lista
   * de mensagens de pendência (strings simples, compatível com o formato
   * antigo). A conversão para o formato do PendenciasPanel acontece em
   * enviarParaPainel().
   */
  function verificarPendencias(resposta) {
    const mensagens = [];

    if (!resposta.sinopseCompleta && !resposta.sinopseSimples) {
      mensagens.push('Sem sinopse completa e texto base');
    }

    if (!resposta.sinopseAprovacao) {
      mensagens.push('Sem texto de justificativa');
    }

    if (!resposta.hasIntegracaoEstatistico) {
      mensagens.push('Estatístico não integrado');
    }

    if (resposta.elegivelPcg && resposta.rastreabilidade === 'SEM_RASTREABILIDADE') {
      mensagens.push('PCG: Definir rastreabilidade');
    }

    if (!R_EMAIL.test(resposta.contatoFornecedores || '')) {
      mensagens.push('Contato: sem e-mail');
    }

    if (!R_TELEFONE.test(resposta.contatoFornecedores || '')) {
      mensagens.push('Contato: sem telefone');
    }

    if (resposta.fotos == null) {
      mensagens.push('Sem fotos');
    }

    if (resposta.tags == null) {
      mensagens.push('Sem tags');
    }

    if (resposta.recomendacaoEtaria == null) {
      mensagens.push('Sem Classificação Indicativa');
    }

    const semDerivacao = {
      alimentacao: false,
      servicos: false,
      infraestrutura: false,
      comunicacao: false,
      audiovisual: false
    };

    (resposta.datas || []).forEach((data) => {
      (data.servicos || []).forEach((servico) => {
        const dataCurta = servico.dataSolicitacao.dataInicio.replace(/\/\d\d\d\d/, '');

        if (servico.local !== data.local) {
          if (servico.areaNome !== 'Alimentação') {
            mensagens.push(`Locais divergentes: ${servico.areaNome}: ${dataCurta}`);
          } else {
            semDerivacao.alimentacao = true;

            if (!camarimAntecipado(data, servico)) {
              mensagens.push(`Camarim antecipação: ${dataCurta}`);
            }

            if (!/Camarim|Coffee|Reserva/.test(servico.itemDescricao)) {
              mensagens.push(`Locais divergentes: ${servico.areaNome}: ${dataCurta}`);
            }
          }
        }

        if (servico.areaNome === 'Operação de Montagem') {
          const semAnexos = !servico.arquivos;
          const semTextos = !servico.observacao && !servico.descricao;
          if (semAnexos && semTextos) {
            mensagens.push(`Op. Montagem sem orientações (anexo ou texto): ${dataCurta}`);
          }
        }

        if (servico.areaNome === 'Alimentação') semDerivacao.alimentacao = true;
        if (servico.areaNome === 'Infraestrutura') semDerivacao.infraestrutura = true;
        if (servico.areaNome === 'Serviços Gerais') semDerivacao.servicos = true;
        if (servico.areaNome === 'Operação de Montagem') semDerivacao.audiovisual = true;
      });
    });

    if (!semDerivacao.alimentacao) mensagens.push('Alimentação: sem demandas');
    if (!semDerivacao.servicos) mensagens.push('Serviços: sem demandas');
    if (!semDerivacao.infraestrutura) mensagens.push('Infra: sem demandas');
    if (!semDerivacao.comunicacao) mensagens.push('Comunicação: sem demandas');
    if (!semDerivacao.audiovisual) mensagens.push('Audiovisual: sem demandas');

    return mensagens;
  }

  // --------------------------------------------------------------------
  // Exibição: usa o PendenciasPanel se disponível, senão cai no fallback
  // de <ul> fixa (comportamento antigo).
  // --------------------------------------------------------------------

  function enviarParaPainel(mensagens) {
    if (window.PendenciasPanel) {
      // Sem função de auto-correção por enquanto (nenhuma foi implementada
      // no script original); todas entram como "validar".
      window.PendenciasPanel.setData(
        mensagens.map((texto) => ({ gravidade: 'validar', texto }))
      );
      return true;
    }
    return false;
  }

  function exibirFallback(mensagens) {
    if (document.getElementById('box-revisao') != null) return;

    const n = document.querySelector('#module-container > div > div.row-fluid > div.span3');
    const menu = document.querySelector('#programacao-navbar');
    if (!n || !menu) return;

    menu.style.visibility = 'visible';

    const revisao = document.createElement('div');
    revisao.id = 'box-revisao';
    revisao.style.padding = '1em';
    n.appendChild(revisao);

    const ul = document.createElement('ul');
    ul.setAttribute('style', 'padding: 0; margin: 0; position: fixed; bottom: 10px;');
    ul.setAttribute('id', 'theList');

    mensagens.forEach((msg) => {
      const li = document.createElement('li');
      li.textContent = msg;
      li.style.display = 'block';
      ul.appendChild(li);
    });

    ul.addEventListener('click', () => {
      menu.style.visibility = menu.style.visibility === 'visible' ? 'hidden' : 'visible';
    });

    revisao.appendChild(ul);
  }

  function verificarAcao() {
    if (!acaoAtual) {
      console.warn('[SIPLUS/revisor] Ação ainda não carregada.');
      return;
    }

    const mensagens = verificarPendencias(acaoAtual);
    const enviado = enviarParaPainel(mensagens);
    if (!enviado) exibirFallback(mensagens);
  }

  console.log('[SIPLUS] features/revisor.js carregado.');
})();
