// perfil/perfil-module.js — dados, foto do usuário logado e troca de senha

function iniciaisPerfil(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

async function carregarAvatarUsuario() {
  if (!G.perfil?.avatar_path) {
    if (G.perfil) G.perfil.avatar_url = null;
    atualizarAvataresCabecalho();
    return null;
  }
  try {
    const { data, error } = await _sbClient.storage.from('avatares').createSignedUrl(G.perfil.avatar_path, 86400);
    if (error) throw error;
    G.perfil.avatar_url = data?.signedUrl || null;
  } catch (erro) {
    console.warn('Não foi possível carregar a foto de perfil.', erro);
    G.perfil.avatar_url = null;
  }
  atualizarAvataresCabecalho();
  return G.perfil.avatar_url;
}

function atualizarAvataresCabecalho() {
  if (!G.perfil) return;
  document.querySelectorAll('.nav-nome-usuario').forEach((nome) => {
    let avatar = nome.parentElement.querySelector('.nav-avatar-usuario');
    if (!avatar) {
      avatar = document.createElement('button');
      avatar.type = 'button';
      avatar.className = 'nav-avatar-usuario';
      avatar.onclick = abrirPerfil;
      nome.parentElement.insertBefore(avatar, nome);
    }
    avatar.title = 'Abrir perfil de ' + G.perfil.nome;
    avatar.setAttribute('aria-label', 'Abrir perfil de ' + G.perfil.nome);
    avatar.innerHTML = G.perfil.avatar_url
      ? `<img src="${escHtml(G.perfil.avatar_url)}" alt="">`
      : `<span aria-hidden="true">${escHtml(iniciaisPerfil(G.perfil.nome))}</span>`;
  });
}

async function abrirPerfil() {
  goTo('screen-perfil');
  renderDadosPerfil();
  await carregarAvatarUsuario();
  renderDadosPerfil();
}

function avatarPerfilHtml() {
  return G.perfil.avatar_url
    ? `<img src="${escHtml(G.perfil.avatar_url)}" alt="Foto de perfil de ${escHtml(G.perfil.nome)}">`
    : `<span aria-hidden="true">${escHtml(iniciaisPerfil(G.perfil.nome))}</span>`;
}

function renderDadosPerfil() {
  const p = G.perfil;
  document.getElementById('perfil-dados').innerHTML = `
    <div class="perfil-dados-layout">
      <section class="perfil-foto-area" aria-labelledby="perfil-foto-titulo">
        <h4 id="perfil-foto-titulo">Foto de perfil</h4>
        <div class="perfil-foto-preview">${avatarPerfilHtml()}</div>
        <div class="perfil-foto-acoes">
          <label class="btn-primary perfil-foto-escolher">
            ${p.avatar_path ? 'Trocar foto' : 'Escolher foto'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onchange="enviarFotoPerfil(this.files?.[0])" hidden>
          </label>
          ${p.avatar_path ? '<button type="button" class="btn-link btn-link--perigo" onclick="removerFotoPerfil()">Remover foto</button>' : ''}
        </div>
        <p class="muted">JPG, PNG ou WebP · máximo de 3 MB.</p>
      </section>
      <dl class="dados-lista">
        <dt>Nome</dt><dd>${escHtml(p.nome)}</dd>
        <dt>E-mail</dt><dd>${escHtml(p.email)}</dd>
        <dt>Cargo</dt><dd>${escHtml(p.cargo?.nome || '—')}</dd>
        <dt>Setor</dt><dd>${escHtml(p.cargo?.setor?.nome || '—')}</dd>
        <dt>Gestor</dt><dd>${escHtml(p.gestor?.nome || '—')}</dd>
      </dl>
    </div>
  `;
}

async function enviarFotoPerfil(arquivo) {
  if (!arquivo) return;
  const extensoes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extensao = extensoes[arquivo.type];
  if (!extensao) { showToast('Escolha uma imagem JPG, PNG ou WebP.'); return; }
  if (arquivo.size > 3 * 1024 * 1024) { showToast('A foto deve ter no máximo 3 MB.'); return; }

  const area = document.querySelector('.perfil-foto-area');
  area?.classList.add('carregando');
  const caminhoAnterior = G.perfil.avatar_path;
  const caminhoNovo = `${G.perfil.id}/avatar.${extensao}`;
  try {
    const { error: uploadError } = await _sbClient.storage.from('avatares').upload(caminhoNovo, arquivo, {
      upsert: true,
      contentType: arquivo.type,
      cacheControl: '3600',
    });
    if (uploadError) throw uploadError;

    await sbFetch(`/perfis?id=eq.${G.perfil.id}`, {
      method: 'PATCH', body: JSON.stringify({ avatar_path: caminhoNovo }),
    });
    if (caminhoAnterior && caminhoAnterior !== caminhoNovo) {
      await _sbClient.storage.from('avatares').remove([caminhoAnterior]).catch(() => {});
    }
    G.perfil.avatar_path = caminhoNovo;
    await carregarAvatarUsuario();
    renderDadosPerfil();
    showToast('Foto de perfil atualizada.');
  } catch (erro) {
    if (caminhoNovo !== caminhoAnterior) await _sbClient.storage.from('avatares').remove([caminhoNovo]).catch(() => {});
    showToast('Não foi possível salvar a foto: ' + (erro.message || erro));
    area?.classList.remove('carregando');
  }
}

function removerFotoPerfil() {
  abrirConfirmacao({
    titulo: 'Remover foto de perfil?',
    texto: 'A foto será removida do seu perfil e suas iniciais voltarão a aparecer no cabeçalho.',
    rotuloConfirmar: 'Remover foto',
    perigosa: true,
    acao: executarRemocaoFotoPerfil,
  });
}

async function executarRemocaoFotoPerfil() {
  const caminho = G.perfil.avatar_path;
  try {
    await sbFetch(`/perfis?id=eq.${G.perfil.id}`, {
      method: 'PATCH', body: JSON.stringify({ avatar_path: null }),
    });
    if (caminho) {
      const { error: removeError } = await _sbClient.storage.from('avatares').remove([caminho]);
      if (removeError) console.warn('O vínculo foi removido, mas o arquivo antigo não pôde ser excluído.', removeError);
    }
    G.perfil.avatar_path = null;
    G.perfil.avatar_url = null;
    atualizarAvataresCabecalho();
    renderDadosPerfil();
    showToast('Foto de perfil removida.');
  } catch (erro) {
    showToast('Não foi possível remover a foto: ' + (erro.message || erro));
  }
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
