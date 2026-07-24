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
      </div>
    </div>
  `;
    })
    .join('');
}
