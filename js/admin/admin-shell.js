// admin/admin-shell.js — orquestra as abas de cadastro e o modal de criação de avaliações do ciclo

let _criacaoAvaliacoesTrigger = null;

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
  _criacaoAvaliacoesTrigger = document.activeElement;
  modal.dataset.cicloId = cicloId;
  const busca = document.getElementById('modal-busca-colaborador');
  busca.value = '';
  document.getElementById('modal-busca-colaborador-vazio').hidden = true;
  const el = document.getElementById('modal-lista-colaboradores');
  el.innerHTML =
    G.colaboradores
      .filter((c) => c.gestor_id)
      .map((c) => {
        const cargo = c.cargo ? cargoLabel(c.cargo) : 'sem cargo';
        return `
    <label class="check-row" data-busca="${escHtml(normalizarBuscaCriacaoAvaliacoes(c.nome + ' ' + cargo))}">
      <input type="checkbox" value="${c.id}"> ${escHtml(c.nome)} <span class="tag">${escHtml(c.cargo ? cargoLabel(c.cargo) : 'sem cargo')}</span>
    </label>
  `;
      })
      .join('') || '<p>Nenhum colaborador com gestor definido. Cadastre o gestor na aba Colaboradores primeiro.</p>';
  modal.classList.add('open');
  document.body.classList.add('modal-criar-avaliacoes-open');
  busca.focus();
}

function normalizarBuscaCriacaoAvaliacoes(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function filtrarColaboradoresCriacao(valor) {
  const termo = normalizarBuscaCriacaoAvaliacoes(valor.trim());
  const linhas = [...document.querySelectorAll('#modal-lista-colaboradores .check-row')];
  let visiveis = 0;
  linhas.forEach((linha) => {
    const exibir = !termo || linha.dataset.busca.includes(termo);
    linha.hidden = !exibir;
    if (exibir) visiveis += 1;
  });
  document.getElementById('modal-busca-colaborador-vazio').hidden = visiveis > 0 || !termo;
}

function fecharModalCriarAvaliacoes() {
  const modal = document.getElementById('modal-criar-avaliacoes');
  modal.classList.remove('open');
  document.body.classList.remove('modal-criar-avaliacoes-open');
  if (_criacaoAvaliacoesTrigger?.isConnected) _criacaoAvaliacoesTrigger.focus();
  _criacaoAvaliacoesTrigger = null;
}

async function confirmarCriacaoAvaliacoes() {
  const modal = document.getElementById('modal-criar-avaliacoes');
  const cicloId = modal.dataset.cicloId;
  const ids = Array.from(modal.querySelectorAll('input[type=checkbox]:checked')).map((i) => i.value);
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
