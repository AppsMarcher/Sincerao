// dashboard/dashboard-module.js — lista de avaliações visíveis ao usuário logado

function toggleNavMenu() {
  document.getElementById('nav-menu').classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('nav-menu');
  if (!menu || !menu.classList.contains('open')) return;
  if (e.target.closest('#nav-menu') || e.target.closest('.nav-hamburguer')) return;
  menu.classList.remove('open');
});

async function abrirDashboard() {
  goTo('screen-dashboard');
  const rows = (await sbFetch(
    '/avaliacoes?select=*,colaborador:colaborador_id(nome),gestor:gestor_id(nome),ciclo:ciclo_id(nome)&order=created_at.desc'
  )) || [];
  G.avaliacoes = rows;
  renderDashboard();
}

function renderDashboard() {
  const meuId = G.perfil.id;
  const comoColaborador = G.avaliacoes.filter((a) => a.colaborador_id === meuId);
  const comoGestor = G.avaliacoes.filter((a) => a.gestor_id === meuId);

  document.getElementById('dash-minhas').innerHTML =
    linhasAvaliacaoHtml(comoColaborador, 'colaborador') || '<p class="empty">Nenhuma avaliação sua no momento.</p>';

  const secaoGestor = document.getElementById('dash-equipe-wrap');
  if (comoGestor.length) {
    secaoGestor.style.display = '';
    document.getElementById('dash-equipe').innerHTML = linhasAvaliacaoHtml(comoGestor, 'gestor');
  } else {
    secaoGestor.style.display = 'none';
  }

  const secaoTodas = document.getElementById('dash-todas-wrap');
  if (ehRhOuAdmin()) {
    secaoTodas.style.display = '';
    const pendentePrimeiro = (a) => (a.status === 'concluida' && !a.ciencia_rh_em ? 0 : 1);
    const todasOrdenadas = [...G.avaliacoes].sort((a, b) => pendentePrimeiro(a) - pendentePrimeiro(b));
    document.getElementById('dash-todas').innerHTML =
      linhasAvaliacaoHtml(todasOrdenadas, 'rh') || '<p class="empty">Nenhuma avaliação criada ainda.</p>';
  } else {
    secaoTodas.style.display = 'none';
  }
}

function linhasAvaliacaoHtml(lista, papelVisao) {
  return lista
    .map((a) => {
      const pendenteCiencia = a.status === 'concluida' && !a.ciencia_rh_em;
      const titulo = papelVisao === 'rh' ? a.colaborador?.nome : papelVisao === 'gestor' ? a.colaborador?.nome : a.ciclo?.nome;
      const subtitulo =
        papelVisao === 'rh'
          ? `${escHtml(a.ciclo?.nome || '')} · Gestor: ${escHtml(a.gestor?.nome || '')}`
          : `${escHtml(a.ciclo?.nome || '')}${papelVisao === 'gestor' ? '' : ' · Gestor: ' + escHtml(a.gestor?.nome || '')}`;
      return `
    <div class="card-avaliacao" onclick="abrirAvaliacao('${a.id}')">
      <div>
        <strong>${escHtml(titulo)}</strong>
        <div class="muted">${subtitulo}</div>
      </div>
      <div class="card-avaliacao-badges">
        ${pendenteCiencia ? '<span class="badge badge-atencao">Aguardando sua ciência</span>' : ''}
        <span class="badge">${escHtml(statusLabel(a.status))}</span>
        ${
          papelVisao === 'rh'
            ? `
        <button class="btn-icon" title="Editar avaliação" onclick="event.stopPropagation(); abrirEditarAvaliacao('${a.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon btn-icon--perigo" title="Excluir avaliação" onclick="event.stopPropagation(); excluirAvaliacao('${a.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`
            : ''
        }
      </div>
    </div>
  `;
    })
    .join('');
}

async function abrirEditarAvaliacao(id) {
  const av = G.avaliacoes.find((a) => a.id === id);
  if (!av) return;
  if (!G.colaboradores.length) await carregarColaboradores();
  if (!G.ciclos.length) await carregarCiclos();
  const modal = document.getElementById('modal-editar-avaliacao');
  modal.dataset.avaliacaoId = id;
  document.getElementById('editar-av-colaborador').innerHTML = G.colaboradores
    .map((c) => `<option value="${c.id}" ${c.id === av.colaborador_id ? 'selected' : ''}>${escHtml(c.nome)}</option>`)
    .join('');
  document.getElementById('editar-av-gestor').innerHTML = G.colaboradores
    .map((c) => `<option value="${c.id}" ${c.id === av.gestor_id ? 'selected' : ''}>${escHtml(c.nome)}</option>`)
    .join('');
  document.getElementById('editar-av-ciclo').innerHTML = G.ciclos
    .map((c) => `<option value="${c.id}" ${c.id === av.ciclo_id ? 'selected' : ''}>${escHtml(c.nome)}</option>`)
    .join('');
  const statusOpcoes = ['rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida'];
  document.getElementById('editar-av-status').innerHTML = statusOpcoes
    .map((s) => `<option value="${s}" ${s === av.status ? 'selected' : ''}>${escHtml(statusLabel(s))}</option>`)
    .join('');
  modal.classList.add('open');
}

function fecharModalEditarAvaliacao() {
  document.getElementById('modal-editar-avaliacao').classList.remove('open');
}

async function salvarEdicaoAvaliacao() {
  const modal = document.getElementById('modal-editar-avaliacao');
  const id = modal.dataset.avaliacaoId;
  const patch = {
    colaborador_id: document.getElementById('editar-av-colaborador').value,
    gestor_id: document.getElementById('editar-av-gestor').value,
    ciclo_id: document.getElementById('editar-av-ciclo').value,
    status: document.getElementById('editar-av-status').value,
  };
  try {
    await sbFetch('/avaliacoes?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(patch) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Esse colaborador já tem avaliação nesse ciclo.' : 'Erro ao salvar avaliação.');
    return;
  }
  fecharModalEditarAvaliacao();
  await abrirDashboard();
  showToast('Avaliação atualizada.');
}

async function excluirAvaliacao(id) {
  const av = G.avaliacoes.find((a) => a.id === id);
  if (!confirm(`Excluir a avaliação de "${av?.colaborador?.nome || ''}" (${av?.ciclo?.nome || ''})? Essa ação não pode ser desfeita.`)) return;
  try {
    await sbFetch('/avaliacoes?id=eq.' + id, { method: 'DELETE' });
  } catch (e) {
    showToast('Erro ao excluir avaliação.');
    return;
  }
  await abrirDashboard();
  showToast('Avaliação excluída.');
}
