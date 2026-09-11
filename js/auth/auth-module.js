// auth/auth-module.js — login, sessão, carregamento do perfil e helpers de papel

async function fazerLogin(email, senha) {
  const { data, error } = await _sbClient.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}

async function fazerLogout() {
  pararMonitorNotificacoes();
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

// Lê token_hash + type da QUERY STRING do link de convite/recuperação --
// formato atual, ver mostrarGateDefinirSenha() logo abaixo pro porquê (bug
// real: link de e-mail caía em "invalid or expired" no primeiro clique, o
// Microsoft Defender Safe Links do tenant @marcher.com.br consumia o token
// de uso único antes do usuário abrir a mensagem -- redirecionava de volta
// sem sessão, ou seja, pra tela de login, em loop. Mesmo diagnóstico e
// mesmo fix já aplicados no VectonPlan em 2026-08-27).
function getQueryTokenHash() {
  const params = new URLSearchParams(window.location.search);
  return { tokenHash: params.get('token_hash') || '', type: params.get('type') || '' };
}

const TIPO_LINK_COPY = {
  invite: { titulo: 'Você recebeu um convite', texto: 'Um administrador do RH criou seu acesso ao Sincerão. Clique abaixo para continuar e definir sua senha.' },
  recovery: { titulo: 'Redefinir senha', texto: 'Clique abaixo para continuar e definir uma nova senha.' },
};

// Troca token_hash+type por uma sessão de verdade. Só é chamada no CLIQUE
// real do botão do gate (nunca automaticamente no load da página) -- um
// scanner de reputação de link faz o GET de pré-carregar a página, mas não
// executa o JS que clica o botão.
async function confirmarTokenHash(type, tokenHash) {
  const { error } = await _sbClient.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) throw error;
  await carregarPerfilLogado();
}

// Mostra um gate ("Continuar") antes do formulário de definir senha --
// ver nota grande em getQueryTokenHash() acima sobre o porquê deste gate
// existir.
function mostrarGateDefinirSenha(type, tokenHash) {
  goTo('screen-definir-senha');
  const gate = document.getElementById('gate-definir-senha');
  const formWrap = document.getElementById('form-definir-senha-wrap');
  if (formWrap) formWrap.hidden = true;
  if (!gate) {
    // Markup do gate não encontrado (deploy dessincronizado, cache velho de
    // SW etc.) -- cai pro comportamento antigo (auto-verifica) em vez de
    // travar o usuário sem tela nenhuma pra continuar.
    confirmarTokenHash(type, tokenHash).catch((err) => {
      showToast('Link inválido ou expirado: ' + (err.message || err));
      goTo('screen-login');
    });
    return;
  }
  gate.hidden = false;
  const textos = TIPO_LINK_COPY[type] || TIPO_LINK_COPY.invite;
  document.getElementById('gate-definir-senha-titulo').textContent = textos.titulo;
  document.getElementById('gate-definir-senha-texto').textContent = textos.texto;
  const btn = document.getElementById('gate-definir-senha-btn');
  // onclick (não addEventListener) de propósito -- cada chamada desta
  // função é pra um token_hash novo, então substituir o handler anterior em
  // vez de empilhar é o comportamento certo.
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await confirmarTokenHash(type, tokenHash);
      gate.hidden = true;
      if (formWrap) formWrap.hidden = false;
    } catch (err) {
      showToast('Link inválido ou expirado. Peça um novo convite ou uma nova redefinição de senha.');
      btn.disabled = false;
    }
  };
}

async function iniciarApp() {
  const q = getQueryTokenHash();
  if (q.tokenHash && ['invite', 'recovery'].includes(q.type)) {
    history.replaceState(null, '', window.location.pathname);
    mostrarGateDefinirSenha(q.type, q.tokenHash);
    return;
  }

  const perfil = await carregarPerfilLogado();
  if (!perfil) {
    goTo('screen-login');
    return;
  }
  if (AUTH_URL_TYPE === 'invite' || AUTH_URL_TYPE === 'recovery') {
    // Formato antigo (hash com access_token) -- só pra links já enviados
    // antes desta mudança ainda funcionarem se clicados a tempo. A sessão já
    // existe (perfil carregado acima), então pula o gate e mostra o
    // formulário direto.
    const gate = document.getElementById('gate-definir-senha');
    const formWrap = document.getElementById('form-definir-senha-wrap');
    if (gate) gate.hidden = true;
    if (formWrap) formWrap.hidden = false;
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
    await sbInvokeFunction('forgot-password', { email, redirect_to: redirectTo });
    showToast('Se o e-mail estiver cadastrado, enviamos um link de recuperação.');
  } catch (err) {
    showToast('Erro ao solicitar recuperação: ' + (err.message || err));
  }
}

async function entrarNoApp(perfil) {
  document.querySelectorAll('.nav-nome-usuario').forEach((el) => { el.textContent = perfil.nome; });
  document.querySelectorAll('.nav-admin').forEach((el) => { el.style.display = ehRhOuAdmin() ? '' : 'none'; });
  document.querySelectorAll('.nav-gestao').forEach((el) => { el.style.display = podeVerGestao() ? '' : 'none'; });
  garantirSinosNotificacoes();
  await carregarAvatarUsuario();
  iniciarMonitorNotificacoes();
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
