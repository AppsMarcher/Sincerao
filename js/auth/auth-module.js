// auth/auth-module.js — login, sessão, carregamento do perfil e helpers de papel

async function fazerLogin(email, senha) {
  const { data, error } = await _sbClient.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}

async function fazerLogout() {
  await _sbClient.auth.signOut();
  G.usuario = null;
  G.perfil = null;
  goTo('screen-login');
}

async function carregarPerfilLogado() {
  const { data } = await _sbClient.auth.getSession();
  const user = data?.session?.user || null;
  if (!user) return null;
  G.usuario = user;
  const rows = await sbFetch('/perfis?id=eq.' + user.id + '&select=*,cargo:cargo_id(id,nome,setor:setor_id(nome)),gestor:gestor_id(id,nome)');
  G.perfil = rows && rows[0] ? rows[0] : null;
  return G.perfil;
}

function ehGestor() {
  return !!G.perfil && ['gestor', 'rh', 'admin'].includes(G.perfil.papel);
}

function ehRhOuAdmin() {
  return !!G.perfil && ['rh', 'admin'].includes(G.perfil.papel);
}
function podeVerGestao() { return !!G.perfil && ['rh', 'admin', 'diretoria'].includes(G.perfil.papel); }

async function iniciarApp() {
  const perfil = await carregarPerfilLogado();
  if (!perfil) {
    goTo('screen-login');
    return;
  }
  if (AUTH_URL_TYPE === 'invite' || AUTH_URL_TYPE === 'recovery') {
    goTo('screen-definir-senha');
    return;
  }
  await entrarNoApp(perfil);
}

async function solicitarRecuperacaoSenha() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('Digite seu e-mail no campo acima primeiro.'); return; }
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await _sbClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    showToast('Enviamos um e-mail com o link de recuperação.');
  } catch (err) {
    showToast('Erro ao solicitar recuperação: ' + (err.message || err));
  }
}

async function entrarNoApp(perfil) {
  document.querySelectorAll('.nav-nome-usuario').forEach((el) => { el.textContent = perfil.nome; });
  document.querySelectorAll('.nav-admin').forEach((el) => { el.style.display = ehRhOuAdmin() ? '' : 'none'; });
  document.querySelectorAll('.nav-gestao').forEach((el) => { el.style.display = podeVerGestao() ? '' : 'none'; });
  await abrirDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const senha = document.getElementById('login-senha').value;
      try {
        await fazerLogin(email, senha);
        await iniciarApp();
      } catch (err) {
        showToast('Login inválido: ' + (err.message || err));
      }
    });
  }

  const formSenha = document.getElementById('form-definir-senha');
  if (formSenha) {
    formSenha.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nova = document.getElementById('definir-senha-nova').value;
      const confirmar = document.getElementById('definir-senha-confirmar').value;
      if (nova !== confirmar) { showToast('As senhas não coincidem.'); return; }
      try {
        const { error } = await _sbClient.auth.updateUser({ password: nova });
        if (error) throw error;
        history.replaceState(null, '', window.location.pathname);
        showToast('Senha definida com sucesso.');
        await entrarNoApp(G.perfil);
      } catch (err) {
        showToast('Erro ao definir senha: ' + (err.message || err));
      }
    });
  }

  iniciarApp();
});
