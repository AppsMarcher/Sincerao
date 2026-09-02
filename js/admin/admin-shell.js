// admin/admin-shell.js — orquestra as abas de cadastro e o modal de criação de avaliações do ciclo

let _criacaoAvaliacoesTrigger = null;
let _colaboradoresCriacaoAvaliacoes = [];
let _idsColaboradoresNoCiclo = new Set();
let _idsSelecionadosCriacaoAvaliacoes = new Set();
let _buscaCriacaoAvaliacoes = '';
let _ordenacaoCriacaoAvaliacoes = { coluna: 'nome', dir: 1 };
let _criacaoAvaliacoesCarregamento = 0;

async function abrirAdmin() {
  if (!ehRhOuAdmin()) { showToast('Acesso restrito ao RH.'); return; }
  goTo('screen-admin');
  await Promise.all([carregarCargos(), carregarSetores(), carregarCompetencias(), carregarCiclos(), carregarColaboradores()]);
  admTab('colaboradores');
}

function admTab(nome) {
  document.querySelectorAll('#screen-admin .adm-tab-panel').forEach((p) => (p.style.display = 'none'));
  document.querySelectorAll('#screen-admin .adm-tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('adm-panel-' + nome).style.display = 'block';
  document.getElementById('adm-btn-' + nome).classList.add('active');
  if (nome === 'cargos') renderSelectSetorCargo();
  if (nome === 'vinculo') renderVinculoCargoCompetencia();
  if (nome === 'ciclos') renderAdmCiclos();
  if (nome === 'colaboradores') renderAdmColaboradores();
  if (nome === 'auditoria') carregarAuditoria(true);
}

async function abrirCriacaoAvaliacoes(cicloId) {
  const modal = document.getElementById('modal-criar-avaliacoes');
  const carregamento = ++_criacaoAvaliacoesCarregamento;
  _criacaoAvaliacoesTrigger = document.activeElement;
  modal.dataset.cicloId = cicloId;
  _colaboradoresCriacaoAvaliacoes = [];
  _idsColaboradoresNoCiclo = new Set();
  _idsSelecionadosCriacaoAvaliacoes = new Set();
  _buscaCriacaoAvaliacoes = '';
  _ordenacaoCriacaoAvaliacoes = { coluna: 'nome', dir: 1 };
  const busca = document.getElementById('modal-busca-colaborador');
  busca.value = '';
  document.getElementById('modal-lista-colaboradores').innerHTML = '';
  const vazio = document.getElementById('modal-busca-colaborador-vazio');
  vazio.textContent = 'Carregando colaboradores...';
  vazio.hidden = false;
  document.getElementById('btn-confirmar-criacao-avaliacoes').disabled = true;
  atualizarOrdenacaoCriacaoAvaliacoes();
  modal.classList.add('open');
  document.body.classList.add('modal-criar-avaliacoes-open');
  busca.focus();

  try {
    const avaliacoes = (await sbFetch('/avaliacoes?select=colaborador_id&ciclo_id=eq.' + encodeURIComponent(cicloId))) || [];
    if (carregamento !== _criacaoAvaliacoesCarregamento || !modal.classList.contains('open')) return;
    _idsColaboradoresNoCiclo = new Set(avaliacoes.map((avaliacao) => avaliacao.colaborador_id));
    _colaboradoresCriacaoAvaliacoes = G.colaboradores.filter((colaborador) => colaborador.gestor_id);
    document.getElementById('btn-confirmar-criacao-avaliacoes').disabled = false;
    renderListaColaboradoresCriacao();
  } catch (e) {
    if (carregamento !== _criacaoAvaliacoesCarregamento || !modal.classList.contains('open')) return;
    vazio.textContent = 'Não foi possível carregar os colaboradores deste ciclo.';
    vazio.hidden = false;
    showToast('Erro ao consultar os colaboradores incluídos no ciclo.');
  }
}

function normalizarBuscaCriacaoAvaliacoes(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function filtrarColaboradoresCriacao(valor) {
  _buscaCriacaoAvaliacoes = normalizarBuscaCriacaoAvaliacoes(valor.trim());
  renderListaColaboradoresCriacao();
}

function ordenarColaboradoresCriacao(coluna) {
  if (_ordenacaoCriacaoAvaliacoes.coluna === coluna) _ordenacaoCriacaoAvaliacoes.dir *= -1;
  else _ordenacaoCriacaoAvaliacoes = { coluna, dir: 1 };
  renderListaColaboradoresCriacao();
}

function valorOrdenacaoCriacaoAvaliacoes(colaborador, coluna) {
  if (coluna === 'nome') return colaborador.nome || '';
  if (coluna === 'cargo') return colaborador.cargo ? cargoLabel(colaborador.cargo) : 'sem cargo';
  if (coluna === 'inclusao') return _idsColaboradoresNoCiclo.has(colaborador.id) ? 'Incluído' : 'Não incluído';
  return '';
}

function atualizarOrdenacaoCriacaoAvaliacoes() {
  const { coluna, dir } = _ordenacaoCriacaoAvaliacoes;
  ['nome', 'cargo', 'inclusao'].forEach((item) => {
    const ativo = item === coluna;
    const indicador = document.getElementById('sort-ind-criacao-' + item);
    const cabecalho = document.getElementById('sort-header-criacao-' + item);
    if (indicador) indicador.textContent = ativo ? (dir === 1 ? ' ▲' : ' ▼') : '';
    if (cabecalho) cabecalho.setAttribute('aria-sort', ativo ? (dir === 1 ? 'ascending' : 'descending') : 'none');
  });
}

function alternarSelecaoCriacaoAvaliacoes(colaboradorId, selecionado) {
  if (selecionado) _idsSelecionadosCriacaoAvaliacoes.add(colaboradorId);
  else _idsSelecionadosCriacaoAvaliacoes.delete(colaboradorId);
}

function statusInclusaoCicloHtml(incluido) {
  if (incluido) {
    return '<span class="ciclo-inclusao ciclo-inclusao--sim"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Incluído</span>';
  }
  return '<span class="ciclo-inclusao ciclo-inclusao--nao"><span aria-hidden="true">—</span>Não incluído</span>';
}

function renderListaColaboradoresCriacao() {
  const el = document.getElementById('modal-lista-colaboradores');
  const vazio = document.getElementById('modal-busca-colaborador-vazio');
  let lista = _colaboradoresCriacaoAvaliacoes.filter((colaborador) => {
    const cargo = colaborador.cargo ? cargoLabel(colaborador.cargo) : 'sem cargo';
    return !_buscaCriacaoAvaliacoes || normalizarBuscaCriacaoAvaliacoes(colaborador.nome + ' ' + cargo).includes(_buscaCriacaoAvaliacoes);
  });
  const { coluna, dir } = _ordenacaoCriacaoAvaliacoes;
  lista = [...lista].sort((a, b) => {
    const comparacao = valorOrdenacaoCriacaoAvaliacoes(a, coluna).localeCompare(valorOrdenacaoCriacaoAvaliacoes(b, coluna), 'pt-BR', { sensitivity: 'base' });
    if (comparacao) return comparacao * dir;
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' });
  });

  atualizarOrdenacaoCriacaoAvaliacoes();
  vazio.textContent = _buscaCriacaoAvaliacoes
    ? 'Nenhuma pessoa encontrada.'
    : 'Nenhum colaborador com gestor definido. Cadastre o gestor na aba Colaboradores primeiro.';
  vazio.hidden = lista.length > 0;
  el.innerHTML = lista
    .map((colaborador) => {
      const cargo = colaborador.cargo ? cargoLabel(colaborador.cargo) : 'sem cargo';
      const incluido = _idsColaboradoresNoCiclo.has(colaborador.id);
      const selecionado = _idsSelecionadosCriacaoAvaliacoes.has(colaborador.id);
      return `
    <label class="check-row modal-colaborador-row${incluido ? ' is-incluido' : ''}" role="row">
      <span class="modal-colaborador-celula modal-colaborador-nome" role="cell">
        <input type="checkbox" value="${colaborador.id}" aria-label="Selecionar ${escHtml(colaborador.nome)}" onchange="alternarSelecaoCriacaoAvaliacoes('${colaborador.id}', this.checked)" ${selecionado ? 'checked' : ''} ${incluido ? 'disabled' : ''}>
        <span>${escHtml(colaborador.nome)}</span>
      </span>
      <span class="modal-colaborador-celula modal-colaborador-cargo" role="cell"><span class="tag">${escHtml(cargo)}</span></span>
      <span class="modal-colaborador-celula" role="cell">${statusInclusaoCicloHtml(incluido)}</span>
    </label>`;
    })
    .join('');
}

function fecharModalCriarAvaliacoes() {
  const modal = document.getElementById('modal-criar-avaliacoes');
  _criacaoAvaliacoesCarregamento += 1;
  modal.classList.remove('open');
  document.body.classList.remove('modal-criar-avaliacoes-open');
  if (_criacaoAvaliacoesTrigger?.isConnected) _criacaoAvaliacoesTrigger.focus();
  _criacaoAvaliacoesTrigger = null;
}

async function confirmarCriacaoAvaliacoes() {
  const modal = document.getElementById('modal-criar-avaliacoes');
  const cicloId = modal.dataset.cicloId;
  const ids = [..._idsSelecionadosCriacaoAvaliacoes].filter((id) => !_idsColaboradoresNoCiclo.has(id));
  if (!ids.length) { showToast('Selecione ao menos um colaborador.'); return; }
  let avaliacoesCriadas = 0;
  for (const colaboradorId of ids) {
    const colaborador = G.colaboradores.find((c) => c.id === colaboradorId);
    if (!colaborador?.gestor_id) continue;
    await sbFetch('/avaliacoes', {
      method: 'POST',
      body: JSON.stringify({ ciclo_id: cicloId, colaborador_id: colaboradorId, gestor_id: colaborador.gestor_id }),
    }).then(() => { avaliacoesCriadas += 1; }).catch((e) => console.warn('Avaliação já existe ou erro:', e));
  }
  fecharModalCriarAvaliacoes();
  if (!avaliacoesCriadas) {
    showToast('Nenhuma nova avaliação foi criada para o ciclo.');
    return;
  }
  try {
    await sbInvokeFunction('notificar-fluxo', { ciclo_id: cicloId, evento: 'ciclo_iniciado' });
  } catch {
    showToast('Avaliações criadas, mas não foi possível enviar o e-mail de início do ciclo.');
    return;
  }
  showToast('Avaliações criadas e e-mail de início do ciclo enviado aos envolvidos.');
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.getElementById('modal-criar-avaliacoes')?.classList.contains('open')) {
    fecharModalCriarAvaliacoes();
  }
});
