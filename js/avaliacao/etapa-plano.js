// avaliacao/etapa-plano.js — etapa 6: plano de desenvolvimento (tabela multi-linha, preenchida em conjunto)

const _filasGravacaoPlano = new Map();

function enfileirarGravacaoPlano(id, tarefa) {
  const anterior = _filasGravacaoPlano.get(id) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(tarefa);
  _filasGravacaoPlano.set(id, atual);
  return atual.finally(() => {
    if (_filasGravacaoPlano.get(id) === atual) _filasGravacaoPlano.delete(id);
  });
}

function renderEtapaPlano() {
  const av = G.avaliacaoAtual;
  const editavel = podeEditarEtapa(av, 'plano_desenvolvimento');
  const linhas = av.plano || [];
  const competencias = av.competenciasCargo || [];
  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Plano de Desenvolvimento</h3>
    <datalist id="plano-competencias-opcoes">
      ${competencias.map((competencia) => `<option value="${escHtml(competencia.nome)}"></option>`).join('')}
    </datalist>
    <div class="tabela-scroll">
    <table class="tabela-plano">
      <thead><tr><th>Competência</th><th>Ação</th><th>Prazo</th><th>Responsável</th><th>Indicador de Sucesso</th><th>Acompanhamento</th><th></th></tr></thead>
      <tbody>
        ${linhas.map((l) => linhaPlanoHtml(l, editavel)).join('')}
      </tbody>
    </table>
    </div>
    ${editavel ? '<div class="etapa-acoes plano-acoes"><button class="btn-link" onclick="adicionarLinhaPlano()">+ Adicionar linha</button><button class="btn-primary" onclick="avancarPlano()">Salvar e avançar</button></div>' : ''}
  `;
}

const CAMPOS_PLANO_TEXTO = ['competencia', 'acao', 'responsavel', 'indicador_sucesso', 'acompanhamento'];
function linhaPlanoPreenchida(l) { return CAMPOS_PLANO_TEXTO.some((campo) => (l[campo] || '').trim()) || l.prazo; }
function linhaPlanoCompleta(l) { return CAMPOS_PLANO_TEXTO.every((campo) => respostaValida(l[campo])) && !!l.prazo; }

async function avancarPlano() {
  const linhas = G.avaliacaoAtual.plano || [];
  const preenchidas = linhas.filter(linhaPlanoPreenchida);
  // Única etapa com exceção à regra de preenchimento obrigatório: se não há
  // nenhuma linha de plano, pede confirmação em vez de bloquear o avanço.
  if (!preenchidas.length) {
    confirmarAvancoSemPlano();
    return;
  }
  if (preenchidas.some((l) => !linhaPlanoCompleta(l))) {
    showToast(`Preencha todos os campos de cada linha do plano (mínimo ${MIN_CHARS_RESPOSTA_AVALIACAO} caracteres) ou remova a linha antes de avançar.`);
    return;
  }
  await salvarAvancoPlano();
}

async function salvarAvancoPlano() {
  try { await salvarEtapaEAvancar(); showToast('Plano salvo.'); }
  catch { showToast('Não foi possível avançar no plano.'); }
}

function confirmarAvancoSemPlano() {
  const modal = document.getElementById('modal-confirmar-fluxo');
  document.getElementById('confirmar-fluxo-titulo').textContent = 'Avançar sem plano de desenvolvimento?';
  document.getElementById('confirmar-fluxo-texto').textContent = 'Nenhuma linha de plano de desenvolvimento foi preenchida. Tem certeza que deseja avançar mesmo assim?';
  modal._acaoConfirmada = salvarAvancoPlano;
  modal.classList.add('open');
}

function linhaPlanoHtml(l, editavel) {
  const campo = (key, tipo = 'text', atributos = '') => {
    const rascunho = editavel ? lerRascunhoEtapa(G.avaliacaoAtual.id, `plano_${l.id}_${key}`) : null;
    const valor = rascunho?.valores?.valor ?? l[key] ?? '';
    return `<input type="${tipo}" value="${escHtml(valor)}" ${atributos} ${editavel ? `oninput="salvarRascunhoPlano('${l.id}','${key}', this.value)"` : 'disabled'} onblur="salvarLinhaPlano('${l.id}','${key}', this.value)">`;
  };
  return `<tr data-linha="${l.id}">
    <td data-label="Competência">${campo('competencia', 'text', 'list="plano-competencias-opcoes" placeholder="Selecione ou digite"')}</td>
    <td data-label="Ação">${campo('acao')}</td>
    <td data-label="Prazo">${campo('prazo', 'date')}</td>
    <td data-label="Responsável">${campo('responsavel')}</td>
    <td data-label="Indicador de Sucesso">${campo('indicador_sucesso')}</td>
    <td data-label="Acompanhamento">${campo('acompanhamento')}</td>
    <td data-label="Ações">${editavel ? `<button class="btn-link" onclick="removerLinhaPlano('${l.id}')">Remover</button>` : ''}</td>
  </tr>`;
}

function salvarRascunhoPlano(id, campo, valor) {
  salvarRascunhoEtapa(G.avaliacaoAtual.id, `plano_${id}_${campo}`, { valor });
}

async function adicionarLinhaPlano() {
  const av = G.avaliacaoAtual;
  try {
    const nova = await sbFetch('/avaliacao_plano_desenvolvimento', {
      method: 'POST',
      body: JSON.stringify({ avaliacao_id: av.id, competencia: '', acao: '', ordem: (av.plano || []).length }),
    });
    av.plano.push(nova[0]);
    renderEtapaPlano();
  } catch {
    showToast('Não foi possível adicionar a linha do plano.');
  }
}

async function salvarLinhaPlano(id, campo, valor) {
  return enfileirarGravacaoPlano(id, async () => {
    const av = G.avaliacaoAtual;
    const linha = av.plano.find((item) => item.id === id);
    if (!linha) return;
    try {
      const salvo = await sbFetch(
        '/avaliacao_plano_desenvolvimento?id=eq.' + id + '&versao=eq.' + (Number(linha.versao) || 1),
        { method: 'PATCH', body: JSON.stringify({ [campo]: valor || null }) }
      );
      if (!salvo?.length) {
        const remoto = await sbFetch('/avaliacao_plano_desenvolvimento?id=eq.' + id);
        if (remoto?.[0]) Object.assign(linha, remoto[0]);
        showToast('Conflito: esta linha foi alterada em outra sessão. O valor digitado permanece na tela; revise antes de sair.');
        return;
      }
      Object.assign(linha, salvo[0]);
      limparRascunhoEtapa(av.id, `plano_${id}_${campo}`);
    } catch {
      showToast('Não foi possível salvar esta linha. O valor permanece na tela.');
    }
  });
}

async function removerLinhaPlano(id) {
  const av = G.avaliacaoAtual;
  const linha = av.plano.find((item) => item.id === id);
  if (!linha) return;
  try {
    const removido = await sbFetch(
      '/avaliacao_plano_desenvolvimento?id=eq.' + id + '&versao=eq.' + (Number(linha.versao) || 1),
      { method: 'DELETE' }
    );
    if (!removido?.length) {
      showToast('Conflito: esta linha foi alterada em outra sessão e não foi removida.');
      return;
    }
    av.plano = av.plano.filter((l) => l.id !== id);
    ['competencia', 'acao', 'prazo', 'responsavel', 'indicador_sucesso', 'acompanhamento'].forEach((campo) => {
      limparRascunhoEtapa(av.id, `plano_${id}_${campo}`);
    });
    renderEtapaPlano();
  } catch {
    showToast('Não foi possível remover a linha do plano.');
  }
}
