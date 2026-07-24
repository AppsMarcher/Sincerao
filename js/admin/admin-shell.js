// admin/admin-shell.js — orquestra as abas de cadastro e o modal de criação de avaliações do ciclo

async function abrirAdmin() {
  if (!ehRhOuAdmin()) { showToast('Acesso restrito ao RH.'); return; }
  goTo('screen-admin');
  await Promise.all([carregarCargos(), carregarCompetencias(), carregarCiclos(), carregarColaboradores()]);
  admTab('cargos');
}

function admTab(nome) {
  document.querySelectorAll('#screen-admin .adm-tab-panel').forEach((p) => (p.style.display = 'none'));
  document.querySelectorAll('#screen-admin .adm-tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('adm-panel-' + nome).style.display = 'block';
  document.getElementById('adm-btn-' + nome).classList.add('active');
  if (nome === 'vinculo') renderVinculoCargoCompetencia();
  if (nome === 'ciclos') renderAdmCiclos();
  if (nome === 'colaboradores') renderAdmColaboradores();
}

async function abrirCriacaoAvaliacoes(cicloId) {
  const modal = document.getElementById('modal-criar-avaliacoes');
  modal.dataset.cicloId = cicloId;
  const el = document.getElementById('modal-lista-colaboradores');
  el.innerHTML =
    G.colaboradores
      .filter((c) => c.gestor_id)
      .map(
        (c) => `
    <label class="check-row">
      <input type="checkbox" value="${c.id}"> ${escHtml(c.nome)} <span class="tag">${escHtml(c.cargo?.nome || 'sem cargo')}</span>
    </label>
  `
      )
      .join('') || '<p>Nenhum colaborador com gestor definido. Cadastre o gestor na aba Colaboradores primeiro.</p>';
  modal.classList.add('open');
}

function fecharModalCriarAvaliacoes() {
  document.getElementById('modal-criar-avaliacoes').classList.remove('open');
}

async function confirmarCriacaoAvaliacoes() {
  const modal = document.getElementById('modal-criar-avaliacoes');
  const cicloId = modal.dataset.cicloId;
  const ids = Array.from(modal.querySelectorAll('input[type=checkbox]:checked')).map((i) => i.value);
  if (!ids.length) { showToast('Selecione ao menos um colaborador.'); return; }
  for (const colaboradorId of ids) {
    const colaborador = G.colaboradores.find((c) => c.id === colaboradorId);
    if (!colaborador?.gestor_id) continue;
    await sbFetch('/avaliacoes', {
      method: 'POST',
      body: JSON.stringify({ ciclo_id: cicloId, colaborador_id: colaboradorId, gestor_id: colaborador.gestor_id }),
    }).catch((e) => console.warn('Avaliação já existe ou erro:', e));
  }
  fecharModalCriarAvaliacoes();
  showToast('Avaliações criadas para o ciclo.');
}
