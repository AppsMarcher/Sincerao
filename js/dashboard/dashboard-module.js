// dashboard/dashboard-module.js — lista de avaliações visíveis ao usuário logado

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
}

function linhasAvaliacaoHtml(lista, papelVisao) {
  return lista
    .map(
      (a) => `
    <div class="card-avaliacao" onclick="abrirAvaliacao('${a.id}')">
      <div>
        <strong>${escHtml(papelVisao === 'gestor' ? a.colaborador?.nome : a.ciclo?.nome)}</strong>
        <div class="muted">${escHtml(a.ciclo?.nome || '')}${papelVisao === 'gestor' ? '' : ' · Gestor: ' + escHtml(a.gestor?.nome || '')}</div>
      </div>
      <span class="badge">${escHtml(statusLabel(a.status))}</span>
    </div>
  `
    )
    .join('');
}
