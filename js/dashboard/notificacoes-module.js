const LIMITE_NOTIFICACOES = 20;
let _notificacoesCentral = [];
let _notificacoesOffset = 0;
let _notificacoesTemMais = false;
let _notificacoesModuloAtual = 'avaliacao';
let _monitorNotificacoes = null;
let _canalNotificacoes = null;

function garantirSinosNotificacoes() {
  document.querySelectorAll('.topbar').forEach((topbar) => {
    if (topbar.closest('#screen-hub')) return; // Hub é seletor de módulo, não tem central de notificações
    const modulo = topbar.dataset.modulo || 'avaliacao';
    if (topbar.querySelector('.btn-sino-notificacoes')) return;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn-sino-notificacoes';
    botao.dataset.modulo = modulo;
    botao.setAttribute('aria-label', 'Abrir notificações. Nenhuma não lida.');
    botao.onclick = () => abrirNotificacoes(modulo);
    botao.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span class="notificacoes-badge" hidden>0</span>';
    const acoes = topbar.querySelector('.topbar-actions');
    if (acoes) acoes.insertBefore(botao, acoes.firstChild);
    else {
      topbar.classList.add('topbar-com-sino');
      topbar.appendChild(botao);
    }
  });
}

function formatarDataHoraNotificacao(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function aplicarContadorSino(modulo, quantidade) {
  document.querySelectorAll(`.btn-sino-notificacoes[data-modulo="${modulo}"]`).forEach((botao) => {
    const badge = botao.querySelector('.notificacoes-badge');
    if (badge) {
      badge.textContent = quantidade > 99 ? '99+' : String(quantidade);
      badge.hidden = quantidade === 0;
    }
    botao.classList.toggle('tem-notificacoes', quantidade > 0);
    botao.setAttribute('aria-label', quantidade
      ? `Abrir notificações. ${quantidade} ${quantidade === 1 ? 'não lida' : 'não lidas'}.`
      : 'Abrir notificações. Nenhuma não lida.');
  });
}

async function atualizarContadorNotificacoes() {
  if (!G.perfil?.id) return;
  try {
    const [avaliacao, clima] = await Promise.all([
      sbRpc('contar_notificacoes_nao_lidas').catch(() => 0),
      sbFetch('/clima_notificacoes?lida_em=is.null&select=id').catch(() => []),
    ]);
    aplicarContadorSino('avaliacao', Number(avaliacao) || 0);
    aplicarContadorSino('clima', (clima || []).length);
  } catch (erro) {
    console.warn('Não foi possível atualizar o contador de notificações.', erro);
  }
}

function pararMonitorNotificacoes() {
  if (_monitorNotificacoes) clearInterval(_monitorNotificacoes);
  _monitorNotificacoes = null;
  if (_canalNotificacoes) _sbClient.removeChannel(_canalNotificacoes).catch(() => {});
  _canalNotificacoes = null;
}

function iniciarMonitorNotificacoes() {
  pararMonitorNotificacoes();
  atualizarContadorNotificacoes();
  _monitorNotificacoes = setInterval(atualizarContadorNotificacoes, 60000);
  if (!G.perfil?.id || typeof _sbClient.channel !== 'function') return;

  const aoMudar = (modulo, recarregar) => () => {
    atualizarContadorNotificacoes();
    if (_notificacoesModuloAtual === modulo && document.getElementById('screen-notificacoes')?.classList.contains('active')) {
      recarregar(true);
    }
  };

  _canalNotificacoes = _sbClient
    .channel(`notificacoes-${G.perfil.id}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'notificacoes', filter: `destinatario_id=eq.${G.perfil.id}`,
    }, aoMudar('avaliacao', carregarCentralNotificacoes))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'clima_notificacoes',
    }, aoMudar('clima', carregarClimaNotificacoes))
    .subscribe();
}

async function abrirNotificacoes(modulo = 'avaliacao') {
  document.querySelectorAll('.nav-menu.open').forEach((menu) => menu.classList.remove('open'));
  _notificacoesModuloAtual = modulo;
  goTo('screen-notificacoes');

  const ehClima = modulo === 'clima';
  document.getElementById('notificacoes-titulo-modulo').textContent = ehClima ? 'Notificações · Clima' : 'Notificações · Avaliação';
  document.getElementById('notificacoes-subtitulo').textContent = ehClima
    ? 'Ciclos e eventos da pesquisa de clima.'
    : 'Acompanhe avaliações, prazos e comunicados.';
  document.getElementById('notificacoes-filtros').hidden = ehClima;

  if (ehClima) await carregarClimaNotificacoes(true);
  else await carregarCentralNotificacoes(true);
}

function voltarDeNotificacoes() {
  if (_notificacoesModuloAtual === 'clima') abrirClimaAdmin();
  else abrirDashboard();
}

function categoriaNotificacaoLabel(categoria) {
  return {
    avaliacao: 'Avaliação', prazo: 'Prazo', comunicado: 'Comunicado', sistema: 'Sistema',
  }[categoria] || 'Notificação';
}

function renderNotificacaoItem(n) {
  const prioridade = ['normal', 'atencao', 'urgente', 'sucesso'].includes(n.prioridade) ? n.prioridade : 'normal';
  const acao = n.avaliacao_id ? 'Abrir avaliação' : 'Ir para o início';
  return `<article class="central-notificacao central-notificacao--${prioridade}${n.lida_em ? '' : ' central-notificacao--nao-lida'}">
    <button type="button" class="central-notificacao-conteudo" onclick="abrirDestinoNotificacao('${n.id}')">
      <span class="central-notificacao-topo">
        <span class="central-notificacao-categoria">${escHtml(categoriaNotificacaoLabel(n.categoria))}</span>
        ${n.lida_em ? '' : '<span class="notificacao-badge-nova">Nova</span>'}
      </span>
      <strong>${escHtml(n.titulo)}</strong>
      <span class="muted">${escHtml(n.mensagem)}</span>
      <small>${escHtml(formatarDataHoraNotificacao(n.created_at))} · ${acao}</small>
    </button>
    ${n.lida_em ? '' : `<button type="button" class="btn-link central-notificacao-marcar" onclick="marcarNotificacaoLida('${n.id}')">Marcar como lida</button>`}
  </article>`;
}

function renderClimaNotificacaoItem(n) {
  return `<article class="central-notificacao${n.lida_em ? '' : ' central-notificacao--nao-lida'}">
    <button type="button" class="central-notificacao-conteudo" onclick="marcarClimaNotificacaoLida('${n.id}')">
      <span class="central-notificacao-topo">
        <span class="central-notificacao-categoria">Clima</span>
        ${n.lida_em ? '' : '<span class="notificacao-badge-nova">Nova</span>'}
      </span>
      <strong>${escHtml(n.titulo)}</strong>
      <span class="muted">${escHtml(n.mensagem)}</span>
      <small>${escHtml(formatarDataHoraNotificacao(n.created_at))}</small>
    </button>
    ${n.lida_em ? '' : `<button type="button" class="btn-link central-notificacao-marcar" onclick="marcarClimaNotificacaoLida('${n.id}')">Marcar como lida</button>`}
  </article>`;
}

function renderCentralNotificacoes() {
  const lista = document.getElementById('notificacoes-lista');
  if (!lista) return;
  const renderItem = _notificacoesModuloAtual === 'clima' ? renderClimaNotificacaoItem : renderNotificacaoItem;
  lista.innerHTML = _notificacoesCentral.length
    ? _notificacoesCentral.map(renderItem).join('')
    : '<p class="empty">Nenhuma notificação encontrada para este filtro.</p>';
  const carregarMais = document.getElementById('btn-carregar-mais-notificacoes');
  if (carregarMais) carregarMais.hidden = !_notificacoesTemMais;
}

async function carregarClimaNotificacoes(reiniciar = false) {
  const lista = document.getElementById('notificacoes-lista');
  if (!lista) return;
  if (reiniciar) {
    _notificacoesOffset = 0;
    _notificacoesCentral = [];
    lista.innerHTML = '<p class="muted">Carregando notificações…</p>';
  }
  const path = `/clima_notificacoes?order=created_at.desc&limit=${LIMITE_NOTIFICACOES + 1}&offset=${_notificacoesOffset}`;
  try {
    const dados = (await sbFetch(path)) || [];
    _notificacoesTemMais = dados.length > LIMITE_NOTIFICACOES;
    const pagina = dados.slice(0, LIMITE_NOTIFICACOES);
    _notificacoesCentral = reiniciar ? pagina : _notificacoesCentral.concat(pagina);
    _notificacoesOffset = _notificacoesCentral.length;
    renderCentralNotificacoes();
  } catch {
    lista.innerHTML = '<p class="empty">Não foi possível carregar as notificações.</p>';
  }
}

async function marcarClimaNotificacaoLida(id) {
  const notificacao = _notificacoesCentral.find((item) => item.id === id);
  if (!notificacao || notificacao.lida_em) return;
  const agora = new Date().toISOString();
  try {
    await sbFetch(`/clima_notificacoes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ lida_em: agora }) });
    notificacao.lida_em = agora;
    renderCentralNotificacoes();
    await atualizarContadorNotificacoes();
  } catch {
    showToast('Não foi possível marcar a notificação como lida.');
  }
}

async function carregarCentralNotificacoes(reiniciar = false) {
  const lista = document.getElementById('notificacoes-lista');
  if (!lista) return;
  if (reiniciar) {
    _notificacoesOffset = 0;
    _notificacoesCentral = [];
    lista.innerHTML = '<p class="muted">Carregando notificações…</p>';
  }
  const categoria = document.getElementById('notificacoes-filtro-categoria')?.value || '';
  const leitura = document.getElementById('notificacoes-filtro-leitura')?.value || '';
  let path = `/notificacoes?destinatario_id=eq.${G.perfil.id}&order=created_at.desc&limit=${LIMITE_NOTIFICACOES + 1}&offset=${_notificacoesOffset}`;
  if (categoria) path += `&categoria=eq.${encodeURIComponent(categoria)}`;
  if (leitura === 'nao_lidas') path += '&lida_em=is.null';
  if (leitura === 'lidas') path += '&lida_em=not.is.null';
  try {
    const dados = (await sbFetch(path)) || [];
    _notificacoesTemMais = dados.length > LIMITE_NOTIFICACOES;
    const pagina = dados.slice(0, LIMITE_NOTIFICACOES);
    _notificacoesCentral = reiniciar ? pagina : _notificacoesCentral.concat(pagina);
    _notificacoesOffset = _notificacoesCentral.length;
    renderCentralNotificacoes();
  } catch {
    lista.innerHTML = '<p class="empty">Não foi possível carregar as notificações.</p>';
  }
}

function carregarMaisNotificacoes() {
  if (_notificacoesModuloAtual === 'clima') carregarClimaNotificacoes(false);
  else carregarCentralNotificacoes(false);
}

async function marcarNotificacaoLida(id) {
  const notificacao = _notificacoesCentral.find((item) => item.id === id);
  if (!notificacao || notificacao.lida_em) return;
  const agora = new Date().toISOString();
  try {
    await sbFetch(`/notificacoes?id=eq.${id}&destinatario_id=eq.${G.perfil.id}`, {
      method: 'PATCH', body: JSON.stringify({ lida_em: agora }),
    });
    notificacao.lida_em = agora;
    renderCentralNotificacoes();
    await atualizarContadorNotificacoes();
  } catch {
    showToast('Não foi possível marcar a notificação como lida.');
  }
}

async function marcarTodasNotificacoesLidas() {
  const ehClima = _notificacoesModuloAtual === 'clima';
  try {
    let quantidade;
    if (ehClima) {
      const antes = (await sbFetch('/clima_notificacoes?lida_em=is.null&select=id')) || [];
      await sbFetch('/clima_notificacoes?lida_em=is.null', { method: 'PATCH', body: JSON.stringify({ lida_em: new Date().toISOString() }) });
      quantidade = antes.length;
      await Promise.all([carregarClimaNotificacoes(true), atualizarContadorNotificacoes()]);
    } else {
      quantidade = Number(await sbRpc('marcar_todas_notificacoes_lidas')) || 0;
      await Promise.all([carregarCentralNotificacoes(true), atualizarContadorNotificacoes()]);
    }
    showToast(quantidade ? `${quantidade} ${quantidade === 1 ? 'notificação marcada' : 'notificações marcadas'} como lida${quantidade === 1 ? '' : 's'}.` : 'Não há notificações novas.');
  } catch {
    showToast('Não foi possível atualizar as notificações.');
  }
}

async function abrirDestinoNotificacao(id) {
  const notificacao = _notificacoesCentral.find((item) => item.id === id);
  if (!notificacao) return;
  await marcarNotificacaoLida(id);
  if (notificacao.avaliacao_id) {
    await abrirAvaliacao(notificacao.avaliacao_id);
    return;
  }
  await abrirDashboard();
}

function excluirNotificacoesLidas() {
  const ehClima = _notificacoesModuloAtual === 'clima';
  abrirConfirmacao({
    titulo: 'Excluir notificações lidas?',
    texto: ehClima
      ? 'As notificações já lidas do Clima serão removidas para todo mundo que usa este módulo.'
      : 'As notificações já lidas serão removidas da sua central. O histórico administrativo de disparos será preservado.',
    rotuloConfirmar: 'Excluir lidas',
    perigosa: true,
    acao: ehClima ? executarExclusaoClimaNotificacoesLidas : executarExclusaoNotificacoesLidas,
  });
}

async function executarExclusaoNotificacoesLidas() {
  try {
    await sbFetch(`/notificacoes?destinatario_id=eq.${G.perfil.id}&lida_em=not.is.null`, { method: 'DELETE' });
    await carregarCentralNotificacoes(true);
    showToast('Notificações lidas removidas.');
  } catch {
    showToast('Não foi possível excluir as notificações lidas.');
  }
}

async function executarExclusaoClimaNotificacoesLidas() {
  try {
    await sbFetch('/clima_notificacoes?lida_em=not.is.null', { method: 'DELETE' });
    await carregarClimaNotificacoes(true);
    showToast('Notificações lidas removidas.');
  } catch {
    showToast('Não foi possível excluir as notificações lidas.');
  }
}
