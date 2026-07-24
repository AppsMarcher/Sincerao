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
  const rows = await sbFetch('/perfis?id=eq.' + user.id + '&select=*,cargo:cargo_id(id,nome,setor),gestor:gestor_id(id,nome)');
  G.perfil = rows && rows[0] ? rows[0] : null;
  return G.perfil;
}

function ehGestor() {
  return !!G.perfil && ['gestor', 'rh', 'admin'].includes(G.perfil.papel);
}

function ehRhOuAdmin() {
  return !!G.perfil && ['rh', 'admin'].includes(G.perfil.papel);
}

async function iniciarApp() {
  const perfil = await carregarPerfilLogado();
  if (!perfil) {
    goTo('screen-login');
    return;
  }
  document.getElementById('nav-nome-usuario').textContent = perfil.nome;
  document.getElementById('nav-admin').style.display = ehRhOuAdmin() ? '' : 'none';
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
  iniciarApp();
});
