// admin/colaboradores-module.js — convite de novos colaboradores e edição de cargo/gestor/papel

let _colaboradorEmEdicaoId = null;

async function carregarColaboradores() {
  G.colaboradores = (await sbFetch('/perfis?select=*,cargo:cargo_id(nome,setor:setor_id(nome))&order=nome.asc')) || [];
}

function renderAdmColaboradores() {
  renderOpcoesNovoColaborador();

  const el = document.getElementById('adm-lista-colaboradores');
  const opcoesCargo = (c) =>
    G.cargos.filter((cg) => cg.ativo).map((cg) => `<option value="${cg.id}" ${c.cargo_id === cg.id ? 'selected' : ''}>${escHtml(cargoLabel(cg))}</option>`).join('');
  const opcoesGestor = (c) =>
    '<option value="">—</option>' +
    G.colaboradores.filter((g) => g.id !== c.id).map((g) => `<option value="${g.id}" ${c.gestor_id === g.id ? 'selected' : ''}>${escHtml(g.nome)}</option>`).join('');
  const opcoesPapel = (c) => ['colaborador', 'gestor', 'rh', 'admin'].map((p) => `<option value="${p}" ${c.papel === p ? 'selected' : ''}>${p}</option>`).join('');

  el.innerHTML =
    G.colaboradores
      .map((c) => {
        if (c.id === _colaboradorEmEdicaoId) {
          return `
    <tr data-edicao="${c.id}">
      <td colspan="3">
        <input type="text" class="edit-nome" value="${escHtml(c.nome)}" placeholder="Nome">
        <input type="email" class="edit-email" value="${escHtml(c.email)}" placeholder="E-mail">
      </td>
      <td colspan="2" class="tabela-acoes">
        <button class="btn-icon" title="Salvar" onclick="salvarEdicaoColaborador('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoColaborador()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </td>
    </tr>`;
        }
        return `
    <tr>
      <td>${escHtml(c.nome)}<br><small>${escHtml(c.email)}</small></td>
      <td><select onchange="atualizarColaborador('${c.id}', {cargo_id: this.value})">${opcoesCargo(c)}</select></td>
      <td><select onchange="atualizarColaborador('${c.id}', {gestor_id: this.value || null})">${opcoesGestor(c)}</select></td>
      <td><select onchange="atualizarColaborador('${c.id}', {papel: this.value})">${opcoesPapel(c)}</select></td>
      <td class="tabela-acoes">
        <button class="btn-icon" title="Reenviar convite" onclick="reenviarConviteColaborador('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><polyline points="3 6 12 13 21 6"/><path d="M17 16l4 4m0-4l-4 4"/></svg></button>
        <button class="btn-icon" title="Enviar link de redefinição de senha" onclick="redefinirSenhaColaborador('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.5 12.5L19 4m0 0h-4m4 0v4"/></svg></button>
        <button class="btn-icon" title="Definir nova senha" onclick="abrirDefinirSenha('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></button>
        <button class="btn-icon" title="Editar" onclick="editarColaborador('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon btn-icon--perigo" title="Excluir" onclick="excluirColaborador('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>`;
      })
      .join('') || '<tr><td colspan="5">Nenhum colaborador ainda. Use o formulário acima para convidar o primeiro.</td></tr>';
}

function renderOpcoesNovoColaborador() {
  const cargoSelect = document.getElementById('novo-colab-cargo');
  const gestorSelect = document.getElementById('novo-colab-gestor');
  cargoSelect.innerHTML =
    '<option value="">Sem cargo</option>' + G.cargos.filter((c) => c.ativo).map((c) => `<option value="${c.id}">${escHtml(cargoLabel(c))}</option>`).join('');
  gestorSelect.innerHTML =
    '<option value="">Sem gestor</option>' + G.colaboradores.map((c) => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
}

async function atualizarColaborador(id, campos) {
  await sbFetch('/perfis?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(campos) });
  await carregarColaboradores();
  renderAdmColaboradores();
  showToast('Colaborador atualizado.');
}

function editarColaborador(id) {
  _colaboradorEmEdicaoId = id;
  renderAdmColaboradores();
}

function cancelarEdicaoColaborador() {
  _colaboradorEmEdicaoId = null;
  renderAdmColaboradores();
}

async function salvarEdicaoColaborador(id) {
  const linha = document.querySelector(`tr[data-edicao="${id}"]`);
  const nome = linha.querySelector('.edit-nome').value.trim();
  const email = linha.querySelector('.edit-email').value.trim();
  if (!nome || !email) { showToast('Preencha nome e e-mail.'); return; }

  const colaborador = G.colaboradores.find((c) => c.id === id);
  try {
    if (email !== colaborador.email) {
      await sbInvokeFunction('admin-colaborador', { acao: 'atualizar_email', colaborador_id: id, novo_email: email });
    }
    await sbFetch('/perfis?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ nome }) });
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message);
    return;
  }
  _colaboradorEmEdicaoId = null;
  await carregarColaboradores();
  renderAdmColaboradores();
  showToast('Colaborador atualizado.');
}

async function reenviarConviteColaborador(id) {
  try {
    await sbInvokeFunction('admin-colaborador', { acao: 'reenviar_convite', colaborador_id: id });
    showToast('Convite reenviado.');
  } catch (err) {
    showToast(err.message || 'Erro ao reenviar convite.');
  }
}

async function redefinirSenhaColaborador(id) {
  const colaborador = G.colaboradores.find((c) => c.id === id);
  if (!colaborador) return;
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await _sbClient.auth.resetPasswordForEmail(colaborador.email, { redirectTo });
    if (error) throw error;
    showToast('E-mail de redefinição enviado para ' + colaborador.email + '.');
  } catch (err) {
    showToast('Erro ao enviar redefinição: ' + (err.message || err));
  }
}

function abrirDefinirSenha(id) {
  const colaborador = G.colaboradores.find((c) => c.id === id);
  if (!colaborador) return;
  document.getElementById('modal-definir-senha').dataset.colaboradorId = id;
  document.getElementById('definir-senha-colab-nome').textContent = colaborador.nome;
  document.getElementById('definir-senha-colab-input').value = '';
  document.getElementById('modal-definir-senha').classList.add('open');
}

function fecharModalDefinirSenha() {
  document.getElementById('modal-definir-senha').classList.remove('open');
}

async function confirmarDefinirSenha() {
  const modal = document.getElementById('modal-definir-senha');
  const id = modal.dataset.colaboradorId;
  const senha = document.getElementById('definir-senha-colab-input').value;
  if (!senha || senha.length < 6) { showToast('A senha precisa ter ao menos 6 caracteres.'); return; }
  try {
    await sbInvokeFunction('admin-colaborador', { acao: 'definir_senha', colaborador_id: id, senha });
    fecharModalDefinirSenha();
    showToast('Nova senha definida.');
  } catch (err) {
    showToast(err.message || 'Erro ao definir senha.');
  }
}

async function excluirColaborador(id) {
  const colaborador = G.colaboradores.find((c) => c.id === id);
  if (!confirm(`Excluir o colaborador "${colaborador?.nome || ''}"? A conta de login também será removida. Essa ação não pode ser desfeita.`)) return;
  try {
    await sbInvokeFunction('admin-colaborador', { acao: 'excluir', colaborador_id: id });
  } catch (err) {
    showToast(err.message || 'Erro ao excluir colaborador.');
    return;
  }
  await carregarColaboradores();
  renderAdmColaboradores();
  showToast('Colaborador excluído.');
}

function abrirImportarColaboradores() {
  document.getElementById('importar-colab-texto').value = '';
  document.getElementById('importar-colab-resultado').innerHTML = '';
  document.getElementById('importar-colab-status').style.display = 'none';
  document.getElementById('importar-colab-btn').disabled = false;
  document.getElementById('modal-importar-colaboradores').classList.add('open');
}

function fecharModalImportarColaboradores() {
  document.getElementById('modal-importar-colaboradores').classList.remove('open');
}

const PAPEIS_VALIDOS = ['colaborador', 'gestor', 'rh', 'admin'];

function parseLinhaImportacao(linha) {
  const campos = (linha.includes('\t') ? linha.split('\t') : linha.split(',')).map((c) => c.trim());
  const [nome, email, cargoNome, gestorNome, papelTexto] = campos;

  if (!nome || !email) return { erro: 'Nome e e-mail são obrigatórios', nome: nome || email || '(linha vazia)' };

  let cargo_id = null;
  if (cargoNome) {
    const cargo = G.cargos.find((c) => c.nome.trim().toLowerCase() === cargoNome.toLowerCase());
    if (!cargo) return { erro: `Cargo "${cargoNome}" não encontrado`, nome };
    cargo_id = cargo.id;
  }

  let gestor_id = null;
  if (gestorNome) {
    const gestor = G.colaboradores.find((c) => c.nome.trim().toLowerCase() === gestorNome.toLowerCase());
    if (!gestor) return { erro: `Gestor "${gestorNome}" não encontrado`, nome };
    gestor_id = gestor.id;
  }

  const papel = papelTexto ? papelTexto.toLowerCase() : 'colaborador';
  if (!PAPEIS_VALIDOS.includes(papel)) return { erro: `Papel "${papelTexto}" inválido (use colaborador, gestor, rh ou admin)`, nome };

  return { nome, email, cargo_id, gestor_id, papel };
}

// O Resend aceita no máximo 10 requisições/segundo. Lotes de 8 em paralelo +
// pausa de 1,2s entre lotes fica folgado desse teto (mesma estratégia usada
// no ExiladosApp pro mesmo problema). Mandar tudo de uma vez gera "rate limit
// exceeded" e os convites seguintes falham silenciosamente.
const TAMANHO_LOTE_IMPORTACAO = 8;
const PAUSA_ENTRE_LOTES_MS = 1200;

function linhaResultadoImportacaoHtml(r) {
  return `
    <div class="import-linha ${r.ok ? 'ok' : 'erro'}">
      <span class="import-nome">${escHtml(r.nome)}</span>
      <span class="import-status">${r.ok ? '✓' : '✗'} ${escHtml(r.msg)}</span>
    </div>
  `;
}

async function enviarLinhaImportacao(linha) {
  const parsed = parseLinhaImportacao(linha);
  if (parsed.erro) return { nome: parsed.nome, ok: false, msg: parsed.erro };
  try {
    await sbInvokeFunction('invite-colaborador', {
      nome: parsed.nome, email: parsed.email, cargo_id: parsed.cargo_id, gestor_id: parsed.gestor_id, papel: parsed.papel,
    });
    return { nome: parsed.nome, ok: true, msg: 'Convite enviado' };
  } catch (err) {
    return { nome: parsed.nome, ok: false, msg: err.message || 'Erro ao convidar' };
  }
}

async function processarImportacaoColaboradores() {
  const texto = document.getElementById('importar-colab-texto').value;
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) { showToast('Cole ao menos uma linha.'); return; }

  const btn = document.getElementById('importar-colab-btn');
  const status = document.getElementById('importar-colab-status');
  const statusTexto = document.getElementById('importar-colab-status-texto');
  const resultadoEl = document.getElementById('importar-colab-resultado');
  btn.disabled = true;
  resultadoEl.innerHTML = '';
  status.style.display = 'flex';

  const resultados = [];
  const totalLotes = Math.ceil(linhas.length / TAMANHO_LOTE_IMPORTACAO);

  for (let lote = 0; lote < totalLotes; lote++) {
    const inicio = lote * TAMANHO_LOTE_IMPORTACAO;
    const linhasDoLote = linhas.slice(inicio, inicio + TAMANHO_LOTE_IMPORTACAO);
    const fim = Math.min(inicio + linhasDoLote.length, linhas.length);
    statusTexto.textContent = `Importando ${inicio + 1}–${fim} de ${linhas.length}...`;

    // Cada linha já captura seu próprio erro e devolve um resultado — nenhuma
    // rejeita, então uma falha isolada não derruba o lote inteiro.
    const resultadosDoLote = await Promise.all(linhasDoLote.map(enviarLinhaImportacao));

    resultadosDoLote.forEach((r) => {
      resultados.push(r);
      resultadoEl.insertAdjacentHTML('beforeend', linhaResultadoImportacaoHtml(r));
    });

    await carregarColaboradores(); // libera quem entrou neste lote pra ser gestor no próximo
    if (lote < totalLotes - 1) await sleep(PAUSA_ENTRE_LOTES_MS);
  }

  status.style.display = 'none';
  btn.disabled = false;
  renderAdmColaboradores();
  const sucesso = resultados.filter((r) => r.ok).length;
  showToast(`${sucesso} de ${resultados.length} colaborador(es) importado(s).`);
}

async function enviarConvite(form) {
  const fd = new FormData(form);
  const payload = {
    nome: fd.get('nome').trim(),
    email: fd.get('email').trim(),
    cargo_id: fd.get('cargo_id') || null,
    gestor_id: fd.get('gestor_id') || null,
    papel: fd.get('papel'),
  };
  if (!payload.nome || !payload.email) { showToast('Preencha nome e e-mail.'); return; }
  try {
    await sbInvokeFunction('invite-colaborador', payload);
    form.reset();
    await carregarColaboradores();
    renderAdmColaboradores();
    showToast('Convite enviado para ' + payload.email + '.');
  } catch (err) {
    showToast('Erro ao convidar: ' + err.message);
  }
}
