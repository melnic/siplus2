// ==UserScript==
// @name         SIPLUS - Gerador de Carta Proposta
// @namespace    http://tampermonkey.net/
// @version      26.01.01
// @description  Obtém dados para carta proposta e lança no clipboard
// @author       You
// @match        http://webapps.sorocaba.sescsp.org.br/siplan/*
// @grant        none
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require      core/vendor/waitForKeyElements.js
// @require      core/vendor/jquery.hotkeys.js
// @require      core/xhr-interceptor.js
// @require      core/date-utils.js
// @require      core/dom-utils.js
// ==/UserScript==

/*
  CHANGELOG
  - 26.01.01: Refatorado para usar core/xhr-interceptor.js (elimina patch
    duplicado de XMLHttpRequest) e core/date-utils.js (elimina duplicação de
    toReais/converterParaData). Corrigido bug em que o branch "1 contrato"
    referenciava a variável inexistente `carta1` em vez da string 'carta1'
    (esse branch era código morto porque a condição anterior sempre o
    tornava inalcançável; ver nota no código).
  - Anteriores: ver histórico do repositório.

  MELHORIAS PENDENTES (mantidas do original):
  - Tratamento de Carta Proposta por tipo (keep/remove/change de campos)
  - Formato PJ/PF completo (hoje só título/contratado/datas/total/parcelas
    são enviados ao clipboard)
*/

(function () {
  'use strict';

  const { toReais } = window.SiplusDateUtils;
  const waitForKeyElements = window.waitForKeyElements; // vendorizado

  const TEMPLATE_LINK =
    'ms-word:nft|u|https://sescsp.sharepoint.com/sites/NcleoArtstico-SescSorocaba/Shared%20Documents/Adm%20Programa%C3%A7%C3%A3o/Cartas%20Proposta/CP%20-%20Universal.dotm';

  // Config de formatos (ainda não usado por completo — mantido do original
  // como base para a melhoria futura de "keep/remove/change" por formato).
  const FORMATOS = {
    musica: {
      formato: 'apresentação de música',
      keep: 'ecad,vinculo',
      remove: ''
    }
  };

  // --------------------------------------------------------------------
  // Escuta os dados da ação vindos do interceptor central de XHR
  // --------------------------------------------------------------------
  let acaoAtual = null;

  document.addEventListener('siplus:atividade-loaded', (evento) => {
    acaoAtual = evento.detail.data;
  });

  waitForKeyElements('#btn-export', inserirBotao);

  // --------------------------------------------------------------------
  // Botão / menu de Cartas Proposta
  // --------------------------------------------------------------------

  function inserirBotao() {
    if (!acaoAtual) {
      console.warn('[SIPLUS/carta-proposta] Ação ainda não carregada.');
      return;
    }
    inserirBotaoCPs(gerarDadosDeContratos(acaoAtual));
  }

  function inserirBotaoCPs(dados) {
    const btnGroupDiv = document.createElement('div');
    btnGroupDiv.className = 'btn-group';

    const buttonElement = document.createElement('button');
    buttonElement.type = 'button';
    buttonElement.className = 'btn';
    buttonElement.setAttribute('data-toggle', 'dropdown');
    buttonElement.innerText = 'Cartas Proposta ';

    const caretSpan = document.createElement('span');
    caretSpan.className = 'caret';
    buttonElement.appendChild(caretSpan);
    btnGroupDiv.appendChild(buttonElement);

    const ulElement = document.createElement('ul');
    ulElement.className = 'dropdown-menu';
    ulElement.setAttribute('role', 'menu');

    const menuItems =
      dados == null
        ? [
            { id: 'btn-exclusao', text: 'Excluir' },
            { id: 'btn-quadro-resumo', text: 'Quadro resumo' }
          ]
        : dados;

    menuItems.forEach((item) => {
      const dadosItem = item[0];
      const liElement = document.createElement('li');
      const aElement = document.createElement('a');
      aElement.className = 'pointer';
      aElement.id = dadosItem.numero;
      aElement.innerText = dadosItem.contratado;

      aElement.addEventListener('click', () => {
        copiarParaClipBoard(dadosItem.clipboard);
      });

      liElement.appendChild(aElement);
      ulElement.appendChild(liElement);
    });

    btnGroupDiv.appendChild(ulElement);
    document.querySelector('#btn-export').parentElement.appendChild(btnGroupDiv);
  }

  // --------------------------------------------------------------------
  // Geração dos dados de contrato(s)
  // --------------------------------------------------------------------

  function gerarDadosDeContratos(acao) {
    const titulo = acao.nome;
    const datas = gerarTextoDatas(acao.datas);
    const contratos = [];

    const textoParcelas = gerarTextosDosContratos(acao);

    // NOTA: a condição original era `texto_parcelas.length >= 1`, o que
    // significa que o branch "else" (1 contrato) abaixo nunca era
    // alcançado na prática — e continha um bug (`carta1` sem aspas,
    // ReferenceError). Como qualquer lista com 1 ou mais contratos cai
    // aqui, simplificamos para um único caminho, sempre correto.
    textoParcelas.forEach((item, index) => {
      const infos = [
        'titulo=' + titulo,
        'contratado=' + item.contratado,
        'datas=' + datas,
        'total=' + item.total,
        'parcelas=' + item.parcelas
      ];
      contratos.push([
        {
          numero: 'carta' + index,
          contratado: item.contratado,
          clipboard: infos.join('|')
        }
      ]);
    });

    return contratos;
  }

  function gerarTextosDosContratos(acao) {
    const retorno = [];

    const contratos = acao.servicos.filter((item) =>
      /contrato|licença/i.test(item.itemDescricao)
    );

    contratos.forEach((contrato) => {
      let n = 1;
      let textoParcelas = '';
      const contratado = contrato.descricao || 'Preencher';

      if (contrato.parcelas != null) {
        contrato.parcelas.forEach((parcela) => {
          textoParcelas +=
            'parcela ' +
            n +
            ', no valor de ' +
            toReais(parcela.valor) +
            ', a ser paga em ' +
            parcela.dataPrevista +
            '; ';
          n++;
        });
      }

      retorno.push({
        contratado,
        total: toReais(contrato.custo),
        parcelas: textoParcelas
      });
    });

    return retorno;
  }

  function gerarTextoDatas(datas) {
    const rDiaMes = /0?(\d{1,2})\/0?(\d{1,2})\/20(\d{1,2})/i;
    const rHora = /\d\d.\d\d$/i;
    const rSobra = /; $/;

    const grupos = {};
    let ano = '';

    datas.forEach((data) => {
      const matchDia = rDiaMes.exec(data.dataAgenda.dataInicio);
      if (!matchDia) return;

      const dia = matchDia[1];
      const mes = matchDia[2];
      ano = matchDia[3];

      const horaInicio = rHora.exec(data.dataAgenda.dataInicio);
      const horaFim = rHora.exec(data.dataAgenda.dataFim);
      const horario = 'das ' + horaInicio + ' às ' + horaFim;

      grupos[horario] = grupos[horario] || {};
      grupos[horario][mes] = grupos[horario][mes] || [];
      grupos[horario][mes].push(dia);
    });

    let texto = '';
    for (const horario in grupos) {
      for (const mes in grupos[horario]) {
        texto += grupos[horario][mes].join(', ') + '/' + mes + ', ';
      }
      texto += horario + '; ';
    }

    texto = texto.replace(rSobra, '');

    const rUltimoHorario = /(, das .{1,22}$)/;
    texto = texto.replace(rUltimoHorario, '/' + ano + '$1');

    return texto;
  }

  // --------------------------------------------------------------------
  // Clipboard
  // --------------------------------------------------------------------

  function copiarParaClipBoard(dadosCp) {
    const n = document.getElementById('link-anexos');
    if (!n) {
      console.warn('[SIPLUS/carta-proposta] #link-anexos não encontrado.');
      return;
    }

    let campo = document.getElementById('dados_carta');

    if (campo == null) {
      const ativ = document.createElement('p');
      ativ.innerHTML =
        '<input type="text" value="' +
        dadosCp +
        '" id="dados_carta" style="border:0px;font-size:10px;margin-left:-.5em;">';
      n.appendChild(ativ);
      campo = document.getElementById('dados_carta');
    } else {
      campo.value = dadosCp;
    }

    campo.addEventListener(
      'click',
      function () {
        const copyText = document.getElementById('dados_carta');
        copyText.select();
        document.execCommand('copy');
      },
      false
    );

    campo.click();
    document.activeElement.blur();
    window.open(TEMPLATE_LINK);
    campo.parentElement.remove();
  }

  console.log('[SIPLUS] features/carta-proposta.js carregado.');
})();
