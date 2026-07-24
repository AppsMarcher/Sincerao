// perfil/perfil-module.js — dados do usuário logado, troca de senha e histórico de avaliações concluídas

async function abrirPerfil() {
  goTo('screen-perfil');
  renderDadosPerfil();
  await renderHistoricoAvaliacoes();
}

function renderDadosPerfil() {
  const p = G.perfil;
  document.getElementById('perfil-dados').innerHTML = `
    <dl class="dados-lista">
      <dt>Nome</dt>
      <dd>
        <form id="form-nome" class="form-inline-editar">
          <input type="text" id="perfil-nome-input" value="${escHtml(p.nome)}" required>
          <button type="submit" class="btn-link">Salvar</button>
        </form>
      </dd>
      <dt>E-mail</dt><dd>${escHtml(p.email)}</dd>
      <dt>Cargo</dt><dd>${escHtml(p.cargo?.nome || '—')}</dd>
      <dt>Setor</dt><dd>${escHtml(p.cargo?.setor || '—')}</dd>
      <dt>Gestor</dt><dd>${escHtml(p.gestor?.nome || '—')}</dd>
    </dl>
  `;
  document.getElementById('form-nome').addEventListener('submit', async (e) => {
    e.preventDefault();
    const novoNome = document.getElementById('perfil-nome-input').value.trim();
    if (!novoNome) { showToast('Informe um nome.'); return; }
    await sbFetch('/perfis?id=eq.' + p.id, { method: 'PATCH', body: JSON.stringify({ nome: novoNome }) });
    p.nome = novoNome;
    document.getElementById('nav-nome-usuario').textContent = novoNome;
    showToast('Nome atualizado.');
  });
}

async function renderHistoricoAvaliacoes() {
  const rows = (await sbFetch(
    '/avaliacoes?colaborador_id=eq.' + G.perfil.id + '&status=eq.concluida&select=*,ciclo:ciclo_id(nome)&order=concluida_em.desc'
  )) || [];
  const el = document.getElementById('perfil-historico');
  el.innerHTML =
    rows
      .map(
        (a) => `
    <div class="card-avaliacao" onclick="abrirAvaliacao('${a.id}')">
      <div>
        <strong>${escHtml(a.ciclo?.nome || '')}</strong>
        <div class="muted">Concluída em ${a.concluida_em ? new Date(a.concluida_em).toLocaleDateString('pt-BR') : '—'} · Pontuação ${a.pontuacao_geral ?? '—'}/5</div>
      </div>
      <span class="badge">${escHtml(a.classificacao || '—')}</span>
    </div>
  `
      )
      .join('') || '<p class="empty">Nenhuma avaliação concluída ainda.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-trocar-senha');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nova = document.getElementById('perfil-nova-senha').value;
    const confirma = document.getElementById('perfil-confirmar-senha').value;
    if (nova !== confirma) { showToast('As senhas não coincidem.'); return; }
    if (nova.length < 6) { showToast('A senha precisa ter ao menos 6 caracteres.'); return; }
    const { error } = await _sbClient.auth.updateUser({ password: nova });
    if (error) { showToast('Erro ao trocar senha: ' + error.message); return; }
    form.reset();
    showToast('Senha atualizada.');
  });
});
