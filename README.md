# SIPLUS — Melhorias para o SIPLAN

Conjunto de userscripts (Tampermonkey) + macro de Word, reorganizados para
facilitar revisão e uma futura migração para extensão de navegador.

## Estrutura

```
siplus/
  core/
    xhr-interceptor.js   # único ponto que intercepta XMLHttpRequest; emite CustomEvents
    date-utils.js         # converterParaData, toReais, conversões BR<->ISO
    dom-utils.js          # escapeHtml, waitForElement (fallback)
    vendor/                # (a criar) waitForKeyElements.js e jquery.hotkeys.js vendorizados
  features/
    carta-proposta.js
    hover-derivacoes.js    # extraído de dentro de carta_proposta.user.js original
    painel-pendencias.js
    redesign.js
    scan-conflitos.js
    revisor.js
    feriados.js
    menu-meses.js
  data/
    feriados.json          # fonte ÚNICA de feriados (antes havia 2 divergentes)
  word-macro/
    ImportarDadosV2.bas
  README.md
```

## O que mudou de fato (resumo)

1. **Um único interceptor de XHR** (`core/xhr-interceptor.js`). Antes,
   `carta_proposta.user.js`, `scanconflitos.user.js` e `revisor.user.js`
   patcheavam `XMLHttpRequest.prototype.open` cada um por conta própria e
   guardavam o resultado numa variável global `resposta` própria — o
   último script a carregar "vencia" e sobrescrevia os outros
   silenciosamente. Agora existe um único patch que dispara
   `CustomEvent`s no `document`:
   - `siplus:atividade-loaded` (dados de uma ação individual)
   - `siplus:atividades-lista-loaded` (lista/calendário)
   - `siplus:xhr-error`

   Cada feature apenas escuta o evento que precisa.

2. **Utilitários de data centralizados** (`core/date-utils.js`). Eliminada
   a duplicação exata de `converterParaData` que existia em
   `scanconflitos.user.js` e `revisor.user.js`.

3. **Bug corrigido em `carta-proposta.js`**: no branch de "1 contrato" o
   código original referenciava a variável inexistente `carta1` (sem
   aspas), o que geraria `ReferenceError` se aquele branch fosse
   alcançado. Na prática a condição anterior (`>= 1`) tornava esse branch
   morto — a nova versão simplifica para um único caminho correto.

4. **`revisor.js` agora alimenta o `painel-pendencias.js`** (via
   `PendenciasPanel.setData(...)`) em vez de criar sua própria `<ul>` fixa
   no canto da tela. Se o painel não estiver carregado, ele cai de volta
   no comportamento antigo (fallback), então nada quebra se você rodar
   `revisor.js` sozinho.

5. **`feriados.json` unificado**: existiam duas fontes de feriados
   divergentes (`feriados.user.js` com array grande hardcoded, e
   `feriados.json` com um subconjunto). Agora `data/feriados.json` é a
   única fonte, e `features/feriados.js` carrega os dados via `fetch` em
   vez de duplicar o array no código.

6. **Ternários usados como comando** (`cond ? push() : null`) em
   `revisor.user.js` foram trocados por `if` simples — mesmo
   comportamento, mais legível e sem confundir linters.

7. **`.bas` da macro do Word**: os erros de bookmark ausente agora são
   reportados numa única `MsgBox` ao usuário ao final da execução, em vez
   de só aparecerem no Immediate Window (que ninguém além do
   desenvolvedor vê).

## Atualização: vendorização concluída

`core/vendor/waitForKeyElements.js` e `core/vendor/jquery.hotkeys.js` já
foram criados com o conteúdo real (sem alteração de lógica). Os
`@require` dos arquivos que dependem deles foram ajustados, e dois
problemas foram corrigidos nessa passada:

- **jQuery ausente**: `waitForKeyElements` exige jQuery carregado
  (`$(...)`), mas alguns arquivos (`carta-proposta.js`,
  `hover-derivacoes.js`, `revisor.js`) não tinham o `@require` do jQuery
  no cabeçalho — adicionado.
- **Regressão desta própria refatoração em `revisor.js`**: o callback de
  `.modal-backdrop` recebe um objeto **jQuery** (é isso que
  `waitForKeyElements` sempre entrega, nunca um nó DOM puro), mas eu
  tinha reescrito `element.on('click', ...)` do original para
  `element.addEventListener('click', ...)`, que não existe em objetos
  jQuery. Corrigido de volta para `.on(...)`.
- `scan-conflitos.js` não usa jQuery/`waitForKeyElements` (só DOM puro);
  removido o `@require` supérfluo que existia no script original.

## Pendências / próximos passos (mantidas do plano original)

- `carta-proposta.js`: implementar o tratamento completo de campos por
  formato (keep/remove/change: `titulo_acao`, `ecad`, `vinculo`, `sbat`,
  `drt`, `autoria_danca`, `seguro`, `art`, etc. — hoje só título,
  contratado, datas, total e parcelas são enviados).
- `scan-conflitos.js`: implementar a verificação de conflitos de camarim
  (as constantes `CAMARINS_*` foram mantidas comentadas como referência).
- `revisor.js`: adicionar funções de auto-correção (`funcao`) aos itens
  enviados ao painel, para que o botão "🔧 Corrigir" apareça também aqui
  (hoje só é usado por quem chamar `PendenciasPanel.addItem` manualmente
  com uma função).

## Caminho de migração para extensão de navegador (Manifest V3)

A estrutura já ajuda bastante, mas os pontos de atenção são:

- **`@require` remoto não existe em MV3.** Todo o código (incluindo
  jQuery, waitForKeyElements etc.) precisa ser empacotado localmente —
  daí a recomendação de vendorizar já valer a pena fazer agora.
- **Cada arquivo de `features/` viraria um content script** listado em
  `content_scripts` no `manifest.json`, todos rodando em
  `document_idle` no mesmo `matches` (`*://webapps.sorocaba.sescsp.org.br/siplan/*`).
  Como já não há mais estado global conflitante (item 1 acima), isso é
  praticamente direto.
- **`data/feriados.json`** já pode ser referenciado via
  `chrome.runtime.getURL('data/feriados.json')` + `fetch`, exatamente como
  está hoje — só troca a URL relativa por essa chamada.
- **`GM_addStyle`** (usado nos cabeçalhos, mas não efetivamente chamado no
  código) não existe em extensão comum; usar `document.head.appendChild
  (styleEl)`, que é o que a maioria dos módulos já faz.
