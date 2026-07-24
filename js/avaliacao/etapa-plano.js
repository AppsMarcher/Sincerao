// avaliacao/etapa-plano.js — etapa 6: plano de desenvolvimento (tabela multi-linha, preenchida em conjunto)

function renderEtapaPlano() {
  const av = G.avaliacaoAtual;
  const editavel = podeEditarEtapa(av, 'plano_desenvolvimento');
  const linhas = av.plano || [];
  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Plano de Desenvolvimento</h3>
    <div class="tabela-scroll">
    <table class="tabela-plano">
      <thead><tr><th>Competência</th><th>Ação</th><th>Prazo</th><th>Responsável</th><th>Indicador de Sucesso</th><th>Acompanhamento</th><th></th></tr></thead>
      <tbody>
        ${linhas.map((l) => linhaPlanoHtml(l, editavel)).join('')}
      </tbody>
    </table>
    </div>
    ${editavel ? '<button class="btn-link" onclick="adicionarLinhaPlano()">+ Adicionar linha</button>' : ''}
  `;
}

function linhaPlanoHtml(l, editavel) {
  const campo = (key, tipo = 'text') =>
    `<input type="${tipo}" value="${escHtml(l[key] || '')}" ${editavel ? '' : 'disabled'} onblur="salvarLinhaPlano('${l.id}','${key}', this.value)">`;
  return `<tr data-linha="${l.id}">
    <td>${campo('competencia')}</td>
    <td>${campo('acao')}</td>
    <td>${campo('prazo', 'date')}</td>
    <td>${campo('responsavel')}</td>
    <td>${campo('indicador_sucesso')}</td>
    <td>${campo('acompanhamento')}</td>
    <td>${editavel ? `<button class="btn-link" onclick="removerLinhaPlano('${l.id}')">Remover</button>` : ''}</td>
  </tr>`;
}

async function adicionarLinhaPlano() {
  const av = G.avaliacaoAtual;
  const nova = await sbFetch('/avaliacao_plano_desenvolvimento', {
    method: 'POST',
    body: JSON.stringify({ avaliacao_id: av.id, competencia: '', acao: '', ordem: (av.plano || []).length }),
  });
  av.plano.push(nova[0]);
  renderEtapaPlano();
}

async function salvarLinhaPlano(id, campo, valor) {
  await sbFetch('/avaliacao_plano_desenvolvimento?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ [campo]: valor || null }) });
}

async function removerLinhaPlano(id) {
  const av = G.avaliacaoAtual;
  await sbFetch('/avaliacao_plano_desenvolvimento?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  av.plano = av.plano.filter((l) => l.id !== id);
  renderEtapaPlano();
}
