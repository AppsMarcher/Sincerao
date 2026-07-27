// dashboard/dashboard-module.js — lista de avaliações visíveis ao usuário logado

function toggleNavMenu(botao) {
  const menu = botao.parentElement.querySelector('.nav-menu');
  document.querySelectorAll('.nav-menu').forEach((item) => {
    if (item !== menu) item.classList.remove('open');
  });
  menu?.classList.toggle('open');
}

async function recarregarAplicacao() {
  document.querySelectorAll('.nav-menu.open').forEach((menu) => menu.classList.remove('open'));

  if ('caches' in window) {
    const nomes = await caches.keys();
    await Promise.all(nomes.map((nome) => caches.delete(nome)));
  }

  navigator.serviceWorker?.getRegistration().then((registro) => registro?.update()).catch(() => {});
  window.location.reload();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.nav-menu') || e.target.closest('.nav-hamburguer')) return;
  document.querySelectorAll('.nav-menu.open').forEach((menu) => menu.classList.remove('open'));
});

async function abrirDashboard() {
  goTo('screen-dashboard');
  await carregarNotificacoes();
  const [rows, emPreparacao, aguardandoConsenso] = await Promise.all([
    sbFetch('/avaliacoes_resumo?order=created_at.desc'),
    sbFetch('/minhas_avaliacoes_em_preparacao?order=data_inicio.desc'),
    sbFetch('/minhas_avaliacoes_aguardando_consenso'),
  ]);
  G.avaliacoes = rows || [];
  G.avaliacoesEmPreparacao = emPreparacao || [];
  G.avaliacoesAguardandoConsenso = aguardandoConsenso || [];
  renderDashboard();
}

async function carregarNotificacoes() {
  const el = document.getElementById('dash-notificacoes');
  const botaoLimpar = document.getElementById('btn-limpar-notificacoes');
  botaoLimpar.style.display = '';
  try {
    const notificacoes = await sbFetch('/notificacoes?destinatario_id=eq.' + G.perfil.id + '&order=created_at.desc&limit=10');
    botaoLimpar.disabled = !notificacoes?.length;
    el.innerHTML = notificacoes?.length ? notificacoes.map((n) => {
      const data = new Date(n.created_at);
      const dataHora = data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const dataHoraSemSegundos = data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const mensagem = escHtml(n.mensagem).replace(/Enviada em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/, 'Enviada em ' + dataHoraSemSegundos);
      return `<div class="notificacao-item${n.lida_em ? '' : ' notificacao-item--nao-lida'}"><div><strong>${escHtml(n.titulo)}</strong><div class="muted">${mensagem}</div><small>${dataHora}</small></div>${n.lida_em ? '' : '<span class="notificacao-badge-nova">Nova</span>'}</div>`;
    }).join('') : '<p class="empty">Nenhuma notificação por enquanto.</p>';
    const naoLidas = (notificacoes || []).filter((n) => !n.lida_em);
    if (naoLidas.length) sbFetch('/notificacoes?id=in.(' + naoLidas.map((n) => n.id).join(',') + ')', { method: 'PATCH', body: JSON.stringify({ lida_em: new Date().toISOString() }) }).catch(() => {});
  } catch { el.innerHTML = '<p class="empty">As notificações estarão disponíveis após aplicar a atualização do banco.</p>'; }
}

async function limparNotificacoes() {
  const modal = document.getElementById('modal-confirmar-fluxo');
  document.getElementById('confirmar-fluxo-titulo').textContent = 'Limpar notificações?';
  document.getElementById('confirmar-fluxo-texto').textContent = 'Todas as suas notificações serão removidas. Essa ação não pode ser desfeita.';
  modal._acaoConfirmada = executarLimpezaNotificacoes;
  modal.classList.add('open');
}

async function executarLimpezaNotificacoes() {
  const botaoLimpar = document.getElementById('btn-limpar-notificacoes');
  botaoLimpar.disabled = true;
  try {
    await sbFetch('/notificacoes?destinatario_id=eq.' + G.perfil.id, { method: 'DELETE' });
    document.getElementById('dash-notificacoes').innerHTML = '<p class="empty">Nenhuma notificação por enquanto.</p>';
    showToast('Notificações removidas.');
  } catch {
    botaoLimpar.disabled = false;
    showToast('Não foi possível limpar as notificações.');
  }
}

function renderDashboard() {
  const meuId = G.perfil.id;
  const comoColaborador = G.avaliacoes.filter((a) => a.colaborador_id === meuId);
  const comoGestor = G.avaliacoes.filter((a) => a.gestor_id === meuId);

  const avisoPreparacao = G.avaliacoesEmPreparacao.length
    ? G.avaliacoesEmPreparacao.map((a) => `<div class="aviso-avaliacao-preparacao"><strong>Avaliação em preparação</strong><div>Sua avaliação${a.ciclo_nome ? ' do ciclo ' + escHtml(a.ciclo_nome) : ''} está em preparação pelo gestor. Você receberá uma notificação quando a autoavaliação estiver disponível.</div></div>`).join('')
    : '';
  const avisoConsenso = G.avaliacoesAguardandoConsenso.length
    ? G.avaliacoesAguardandoConsenso.map((a) => `<div class="aviso-avaliacao-consenso"><strong>Autoavaliação enviada</strong><div>Sua autoavaliação${a.ciclo_nome ? ' do ciclo ' + escHtml(a.ciclo_nome) : ''} foi recebida. O gestor realizará o consenso e registrará o plano, o resumo e o parecer final.</div></div>`).join('')
    : '';
  document.getElementById('dash-minhas').innerHTML = avisoPreparacao + avisoConsenso + (linhasAvaliacaoHtml(comoColaborador, 'colaborador') || (!(avisoPreparacao || avisoConsenso) ? '<p class="empty">Nenhuma avaliação sua no momento.</p>' : ''));

  const secaoGestor = document.getElementById('dash-equipe-wrap');
  if (comoGestor.length) {
    secaoGestor.style.display = '';
    const aguardandoColaborador = comoGestor.filter((a) => a.status === 'aguardando_autoavaliacao');
    const avisoGestor = aguardandoColaborador.length
      ? `<div class="aviso-avaliacao-gestor"><strong>${aguardandoColaborador.length === 1 ? 'Autoavaliação pendente' : 'Autoavaliações pendentes'}</strong><div>${aguardandoColaborador.length === 1 ? escHtml(aguardandoColaborador[0].colaborador?.nome || 'Um colaborador') + ' ainda não concluiu a autoavaliação.' : `${aguardandoColaborador.length} colaboradores ainda não concluíram a autoavaliação.`} Você será avisado quando ela for devolvida para a etapa de consenso.</div></div>`
      : '';
    document.getElementById('dash-equipe').innerHTML = avisoGestor + linhasAvaliacaoHtml(comoGestor, 'gestor');
  } else {
    secaoGestor.style.display = 'none';
  }

  const secaoTodas = document.getElementById('dash-todas-wrap');
  if (ehRhOuAdmin()) {
    secaoTodas.style.display = '';
    document.getElementById('dash-todas').innerHTML =
      linhasAvaliacaoHtml(G.avaliacoes, 'rh') || '<p class="empty">Nenhuma avaliação criada ainda.</p>';
  } else {
    secaoTodas.style.display = 'none';
  }
}

function linhasAvaliacaoHtml(lista, papelVisao) {
  return lista
    .map((a) => {
      const titulo = papelVisao === 'rh' ? a.colaborador?.nome : papelVisao === 'gestor' ? a.colaborador?.nome : a.ciclo?.nome;
      const subtitulo =
        papelVisao === 'rh'
          ? `${escHtml(a.ciclo?.nome || '')} · Gestor: ${escHtml(a.gestor?.nome || '')}`
          : `${escHtml(a.ciclo?.nome || '')}${papelVisao === 'gestor' ? '' : ' · Gestor: ' + escHtml(a.gestor?.nome || '')}`;
      // Só pisca quando o status significa "é sua vez de agir" pra quem está
      // vendo esta lista agora -- não faz sentido chamar atenção de quem não
      // precisa fazer nada (ex: gestor olhando a autoavaliação do colaborador).
      const piscar = papelVisao === 'colaborador' && a.status === 'aguardando_autoavaliacao';
      return `
    <div class="card-avaliacao" onclick="abrirAvaliacao('${a.id}')">
      <div>
        <strong>${escHtml(titulo)}</strong>
        <div class="muted">${subtitulo}</div>
      </div>
      <div class="card-avaliacao-badges">
        <span class="badge${piscar ? ' badge-piscando' : ''}">${escHtml(statusLabel(a.status))}</span>
        ${
          papelVisao === 'rh'
            ? `
        <button class="btn-icon btn-icon--perigo" title="Excluir avaliação" onclick="event.stopPropagation(); excluirAvaliacao('${a.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`
            : ''
        }
      </div>
    </div>
  `;
    })
    .join('');
}

async function excluirAvaliacao(id) {
  const av = G.avaliacoes.find((a) => a.id === id);
  if (!confirm(`Excluir a avaliação de "${av?.colaborador?.nome || ''}" (${av?.ciclo?.nome || ''})? Essa ação não pode ser desfeita.`)) return;
  try {
    const removido = await sbFetch('/avaliacoes?id=eq.' + id + '&versao=eq.' + (Number(av?.versao) || 1), { method: 'DELETE' });
    if (!removido?.length) {
      showToast('Conflito: a avaliação mudou desde que a lista foi carregada e não foi excluída.');
      return;
    }
  } catch (e) {
    showToast('Erro ao excluir avaliação.');
    return;
  }
  await abrirDashboard();
  showToast('Avaliação excluída.');
}
