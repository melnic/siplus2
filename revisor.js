// ==UserScript==
// @name         SIPLUS - Verificador de Ação
// @namespace    http://tampermonkey.net/
// @version      26.01.08
// @description  Verifica pendências de preenchimento de uma ação
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/melnic/siplus2/main/features/revisor.js
// @updateURL    https://raw.githubusercontent.com/melnic/siplus2/main/features/revisor.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/xhr-interceptor.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/date-utils.js
// @require      https://raw.githubusercontent.com/melnic/siplus2/main/core/dom-utils.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.08: Três ajustes pontuais pedidos:
    (1) "PCG: Definir rastreabilidade" agora destaca a seção "Mapeamento"
        inteira (h5 sem id próprio — criado helper porTituloSecao que
        busca o cabeçalho pelo texto exato), em vez de só #pcg-container.
    (2) "Sem tags" agora destaca #tags_chzn (o widget visível do plugin
        Chosen) em vez de #tags (o <select> original, que fica com
        display:none e por isso não aparecia destacado na tela).
    (3) Quando PCAP/Carta Proposta SÃO encontrados, agora aparece um item
        de confirmação no grupo "sugestão" (verde) mostrando o começo do
        nome do arquivo, com o nome completo disponível ao passar o mouse
        (tooltip) — antes só o caso de ausência era reportado.
  - 26.01.07: Duas correções na detecção de PCAP/Carta Proposta, achadas
    com um JSON real que tinha os dois anexos mas não era detectado:
    (1) resposta.anexos frequentemente vem null — PCAP e Carta Proposta
    costumam estar dentro de servicos[].arquivos (ex: no serviço de
    Contrato), não no array geral de anexos da ação. Agora verificamos os
    dois conjuntos juntos. (2) O regex de "Carta Proposta" só aceitava
    espaço entre as duas palavras (carta\s*proposta), mas nomes de arquivo
    reais costumam usar underscore ("Carta_proposta_..."). Trocado para
    aceitar espaço, underscore ou hífen entre as palavras.
  - 26.01.06: Ajuste de seletores conforme feedback: "Contato: sem
    e-mail/telefone" agora aponta para #contato-fornecedores (em vez dos
    campos individuais #email-contato/#telefone-contato); "Sem anexo de
    PCAP" e "Sem anexo de Carta Proposta (CP)" agora apontam para
    #solicitacao_list_view (em vez de #form-anexos).
  - 26.01.05: As duas checagens de anexo obrigatório (PCAP / Carta
    Proposta) agora entram com gravidade "corrigir" (grupo vermelho no
    painel), em vez de "validar" (amarelo) — a ausência desses anexos é
    tratada como problema grave. As demais checagens continuam como
    "validar" por padrão.
  - 26.01.04: Adicionadas duas verificações de anexos obrigatórios: (1)
    algum anexo contendo "PCAP" no nome; (2) algum anexo contendo "Carta
    Proposta" (por extenso) ou "CP" como token isolado no nome (evita
    falso-positivo em nomes como "CPF_documento.pdf"). A checagem olha
    tanto o nome de exibição (anexo.nome) quanto o nome do arquivo salvo
    (anexo.arquivo). Ambas apontam para #form-anexos.
  - 26.01.03: Cada pendência agora carrega uma função `localizar`, que
    aponta para o elemento real na tela de edição (mapeado a partir do
    HTML real da página — ver conversa/README). No painel, isso habilita
    o botão 📍 que rola a tela até o campo/seção com problema e o destaca
    por alguns segundos. Para pendências ligadas a uma data específica
    (Locais divergentes, Camarim antecipação, Op. Montagem), a busca é
    feita pelo elemento '.data-text' exato daquela sessão, usando a mesma
    lógica de extração de data/hora do hover-derivacoes.js. OBS: não
    encontramos um id específico para a seção de "fotos" no HTML
    mapeado — está apontando para #form-anexos como melhor aproximação;
    ajustar se o local certo for outro.
  - 26.01.02: Removida a dependência de jQuery (waitForKeyElements
    vendorizado e o @require de jQuery externo). Trocado por
    waitForElement() (MutationObserver puro, sem jQuery). Como
    consequência, o callback de '.modal-backdrop' agora recebe um
    elemento DOM puro (não mais um objeto jQuery), então voltou a usar
    element.addEventListener('click', ...) em vez de element.on(...) —
    desta vez isso está CORRETO, porque não é mais objeto jQuery.
  - 26.01.01 (histórico): usa core/xhr-interceptor.js e core/date-utils.js
    em vez de duplicar lógica; ternários usados como comando trocados por
    `if` simples.

  MELHORIAS PENDENTES (mantidas do original):
  - Verificar se derivações são consistentes com o local da ação
  - Confirmar o seletor real da seção de "fotos" (ver OBS acima)
*/



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
  const { waitForElement } = window.SiplusDomUtils;

  let acaoAtual = null;
  let quadroResumoFirstAppear = false;

  document.addEventListener('siplus:atividade-loaded', (evento) => {
    const dados = evento.detail.data;
    // Blindagem: só aceita a resposta se tiver o formato esperado (com a
    // lista de datas) — evita que uma resposta de sub-endpoint parecido
    // (ex: .../sessoes) sobrescreva acaoAtual com dados incompletos.
    if (dados && Array.isArray(dados.datas)) {
      acaoAtual = dados;
      quadroResumoFirstAppear = false;
    }
  });

  waitForElement('#programacao-navbar', verificarAcao);

  // --------------------------------------------------------------------
  // Atalhos de teclado / Quadro Resumo
  // --------------------------------------------------------------------

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      const btn = document.querySelector('#quadro-resumo-modal > div > div.modal-header > button');
      if (btn) btn.click();
    }
  });

  waitForElement('.modal-backdrop', (element) => {
    const btnClose = document.querySelector('#quadro-resumo-modal > div > div.modal-header > button');

    if (!quadroResumoFirstAppear) {
      quadroResumoFirstAppear = true;
      document.body.style.overflowY = 'visible';
    }

    // `element` aqui é um elemento DOM puro (waitForElement não usa
    // jQuery), por isso addEventListener funciona normalmente.
    element.addEventListener('click', () => {
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

  // --------------------------------------------------------------------
  // Mapeamento de pendências para elementos da tela (ver
  // Edição_de_ação___SIPLAN.html). A página é uma única página longa
  // (não tem abas escondidas), então basta scrollIntoView — não precisa
  // ativar nada antes.
  // --------------------------------------------------------------------

  function porSeletor(seletor) {
    return () => document.querySelector(seletor);
  }

  // Para seções sem id próprio (ex: o <h5>Mapeamento</h5> que agrupa
  // "Elegível ao PCG" e "Rastreabilidade", mas não tem wrapper com id).
  // Busca por texto exato do cabeçalho (h2-h6).
  function porTituloSecao(titulo) {
    return () => {
      const cabecalhos = document.querySelectorAll('h2, h3, h4, h5, h6');
      for (const h of cabecalhos) {
        if (h.textContent.trim() === titulo) return h;
      }
      return null;
    };
  }

  // Mesma lógica de extração de data/hora usada em hover-derivacoes.js,
  // para conseguir localizar o elemento '.data-text' exato de uma sessão.
  function extrairDataHoraDoTexto(texto) {
    const match = texto.match(/(\d{2}\/\d{2}\/\d{4}), (\d{1,2}h\d{0,2})/);
    if (!match) return null;

    const date = match[1];
    let time = match[2];

    if (!time.includes('h')) {
      time = time.replace('h', ':00');
    } else if (!/\d{2}$/.test(time)) {
      time = time.replace('h', ':00');
    } else {
      time = time.replace('h', ':');
    }

    return `${date} ${time}`;
  }

  function porDataAgenda(dataAgendaInicio) {
    return () => {
      if (!dataAgendaInicio) return null;
      const elementos = document.querySelectorAll('.data-text');
      for (const el of elementos) {
        if (extrairDataHoraDoTexto(el.textContent) === dataAgendaInicio) {
          return el;
        }
      }
      return null;
    };
  }

  /**
   * Roda todas as verificações sobre a ação carregada e retorna uma lista
   * de pendências no formato { texto, localizar }. `localizar` é sempre
   * uma função (nunca null), retornando o elemento na página ou null se
   * não encontrar — o painel trata esse caso mostrando um aviso no
   * console em vez de quebrar.
   */
  function verificarPendencias(resposta) {
    const itens = [];

    if (!resposta.sinopseCompleta && !resposta.sinopseSimples) {
      itens.push({ texto: 'Sem sinopse completa e texto base', localizar: porSeletor('#sinopse') });
    }

    if (!resposta.sinopseAprovacao) {
      itens.push({ texto: 'Sem texto de justificativa', localizar: porSeletor('#sinopse-aprovacao') });
    }

    if (!resposta.hasIntegracaoEstatistico) {
      itens.push({ texto: 'Estatístico não integrado', localizar: porSeletor('#integracao-estatistico') });
    }

    if (resposta.elegivelPcg && resposta.rastreabilidade === 'SEM_RASTREABILIDADE') {
      itens.push({ texto: 'PCG: Definir rastreabilidade', localizar: porTituloSecao('Mapeamento') });
    }

    if (!R_EMAIL.test(resposta.contatoFornecedores || '')) {
      itens.push({ texto: 'Contato: sem e-mail', localizar: porSeletor('#contato-fornecedores') });
    }

    if (!R_TELEFONE.test(resposta.contatoFornecedores || '')) {
      itens.push({ texto: 'Contato: sem telefone', localizar: porSeletor('#contato-fornecedores') });
    }

    if (resposta.fotos == null) {
      // Não encontramos um id específico de "fotos" no HTML mapeado;
      // aponta para a seção de Anexos como melhor aproximação. Se o
      // local certo for outro, ajustar o seletor abaixo.
      itens.push({ texto: 'Sem fotos', localizar: porSeletor('#form-anexos') });
    }

    // Verifica anexos obrigatórios: PCAP e Carta Proposta (CP). Usa o
    // nome de exibição do arquivo (anexo.nome) e, como reforço, também
    // o nome do arquivo salvo (anexo.arquivo), caso o nome de exibição
    // tenha sido preenchido de forma diferente do arquivo em si.
    // PCAP e Carta Proposta normalmente não ficam em resposta.anexos (que
    // pode até vir null) — eles costumam estar anexados dentro do próprio
    // serviço de Contrato, em servico.arquivos. Por isso juntamos os dois
    // conjuntos antes de checar.
    const anexosGerais = resposta.anexos || [];
    const anexosDosServicos = (resposta.servicos || []).flatMap((s) => s.arquivos || []);
    const todosAnexos = anexosGerais.concat(anexosDosServicos);

    // Trunca o nome do arquivo para caber no painel; o nome completo fica
    // disponível via tooltip (hover) no próprio texto do item.
    function truncarNome(nome, tamanho = 28) {
      if (!nome) return '';
      return nome.length > tamanho ? nome.slice(0, tamanho) + '…' : nome;
    }

    const anexoPcap = todosAnexos.find((a) => /pcap/i.test(`${a.nome || ''} ${a.arquivo || ''}`));
    if (!anexoPcap) {
      itens.push({
        texto: 'Sem anexo de PCAP',
        gravidade: 'corrigir',
        localizar: porSeletor('#solicitacao_list_view')
      });
    } else {
      const nomeCompleto = anexoPcap.nome || anexoPcap.arquivo || '';
      itens.push({
        texto: `PCAP: ${truncarNome(nomeCompleto)}`,
        explicacao: nomeCompleto,
        gravidade: 'sugestao',
        localizar: porSeletor('#solicitacao_list_view')
      });
    }

    // "CP" isolado é um termo curto e comum como substring de outras
    // palavras — por isso exige que apareça como token separado (não
    // colado a outras letras), além de aceitar "Carta Proposta" por
    // extenso.
    const RE_CARTA_PROPOSTA = /carta[\s_-]*proposta|(^|[^a-zà-ÿ])cp([^a-zà-ÿ]|$)/i;
    const anexoCartaProposta = todosAnexos.find((a) =>
      RE_CARTA_PROPOSTA.test(`${a.nome || ''} ${a.arquivo || ''}`)
    );
    if (!anexoCartaProposta) {
      itens.push({
        texto: 'Sem anexo de Carta Proposta (CP)',
        gravidade: 'corrigir',
        localizar: porSeletor('#solicitacao_list_view')
      });
    } else {
      const nomeCompleto = anexoCartaProposta.nome || anexoCartaProposta.arquivo || '';
      itens.push({
        texto: `Carta Proposta: ${truncarNome(nomeCompleto)}`,
        explicacao: nomeCompleto,
        gravidade: 'sugestao',
        localizar: porSeletor('#solicitacao_list_view')
      });
    }

    if (resposta.tags == null) {
      // #tags é o <select> original, mas fica com display:none — o plugin
      // "Chosen" desenha o widget visível em #tags_chzn. Destacar #tags
      // não aparece na tela porque o elemento não é renderizado.
      itens.push({ texto: 'Sem tags', localizar: porSeletor('#tags_chzn') });
    }

    if (resposta.recomendacaoEtaria == null) {
      itens.push({ texto: 'Sem Classificação Indicativa', localizar: porSeletor('#recomendacao-etaria') });
    }

    const semDerivacao = {
      alimentacao: false,
      servicos: false,
      infraestrutura: false,
      comunicacao: false,
      audiovisual: false
    };

    (resposta.datas || []).forEach((data) => {
      const localizarEstaData = porDataAgenda(data.dataAgenda && data.dataAgenda.dataInicio);

      (data.servicos || []).forEach((servico) => {
        const dataCurta = servico.dataSolicitacao.dataInicio.replace(/\/\d\d\d\d/, '');

        if (servico.local !== data.local) {
          if (servico.areaNome !== 'Alimentação') {
            itens.push({
              texto: `Locais divergentes: ${servico.areaNome}: ${dataCurta}`,
              localizar: localizarEstaData
            });
          } else {
            semDerivacao.alimentacao = true;

            if (!camarimAntecipado(data, servico)) {
              itens.push({
                texto: `Camarim antecipação: ${dataCurta}`,
                localizar: localizarEstaData
              });
            }

            if (!/Camarim|Coffee|Reserva/.test(servico.itemDescricao)) {
              itens.push({
                texto: `Locais divergentes: ${servico.areaNome}: ${dataCurta}`,
                localizar: localizarEstaData
              });
            }
          }
        }

        if (servico.areaNome === 'Operação de Montagem') {
          const semAnexos = !servico.arquivos;
          const semTextos = !servico.observacao && !servico.descricao;
          if (semAnexos && semTextos) {
            itens.push({
              texto: `Op. Montagem sem orientações (anexo ou texto): ${dataCurta}`,
              localizar: localizarEstaData
            });
          }
        }

        if (servico.areaNome === 'Alimentação') semDerivacao.alimentacao = true;
        if (servico.areaNome === 'Infraestrutura') semDerivacao.infraestrutura = true;
        if (servico.areaNome === 'Serviços Gerais') semDerivacao.servicos = true;
        if (servico.areaNome === 'Operação de Montagem') semDerivacao.audiovisual = true;
      });
    });

    const localizarSecaoDatas = porSeletor('#form-data-local-servicos');
    if (!semDerivacao.alimentacao) itens.push({ texto: 'Alimentação: sem demandas', localizar: localizarSecaoDatas });
    if (!semDerivacao.servicos) itens.push({ texto: 'Serviços: sem demandas', localizar: localizarSecaoDatas });
    if (!semDerivacao.infraestrutura) itens.push({ texto: 'Infra: sem demandas', localizar: localizarSecaoDatas });
    if (!semDerivacao.comunicacao) itens.push({ texto: 'Comunicação: sem demandas', localizar: localizarSecaoDatas });
    if (!semDerivacao.audiovisual) itens.push({ texto: 'Audiovisual: sem demandas', localizar: localizarSecaoDatas });

    return itens;
  }

  // --------------------------------------------------------------------
  // Exibição: usa o PendenciasPanel se disponível, senão cai no fallback
  // de <ul> fixa (comportamento antigo).
  // --------------------------------------------------------------------

  function enviarParaPainel(itens) {
    if (window.PendenciasPanel) {
      // A maioria das checagens não tem função de auto-correção implementada
      // ainda, então por padrão entram como "validar". Itens que já vêm com
      // uma gravidade explícita (ex: anexos obrigatórios ausentes, que são
      // "corrigir"/vermelho) mantêm o que foi definido em verificarPendencias.
      window.PendenciasPanel.setData(
        itens.map((item) => ({
          gravidade: item.gravidade || 'validar',
          texto: item.texto,
          explicacao: item.explicacao,
          localizar: item.localizar
        }))
      );
      return true;
    }
    return false;
  }

  function exibirFallback(itens) {
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

    itens.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.texto;
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

    const itens = verificarPendencias(acaoAtual);
    const enviado = enviarParaPainel(itens);
    if (!enviado) exibirFallback(itens);
  }

  console.log('[SIPLUS] features/revisor.js carregado.');
})();
