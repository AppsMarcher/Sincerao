// perfil/perfil-module.js — dados do usuário logado e troca de senha

function abrirPerfil() {
  goTo('screen-perfil');
  renderDadosPerfil();
}

function renderDadosPerfil() {
  const p = G.perfil;
  document.getElementById('perfil-dados').innerHTML = `
    <dl class="dados-lista">
      <dt>Nome</dt>
      <dd>${escHtml(p.nome)}</dd>
      <dt>E-mail</dt><dd>${escHtml(p.email)}</dd>
      <dt>Cargo</dt><dd>${escHtml(p.cargo?.nome || '—')}</dd>
      <dt>Setor</dt><dd>${escHtml(p.cargo?.setor?.nome || '—')}</dd>
      <dt>Gestor</dt><dd>${escHtml(p.gestor?.nome || '—')}</dd>
    </dl>
  `;
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
