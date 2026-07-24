// admin/colaboradores-module.js — convite de novos colaboradores e edição de cargo/gestor/papel

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
      .map(
        (c) => `
    <tr>
      <td>${escHtml(c.nome)}<br><small>${escHtml(c.email)}</small></td>
      <td><select onchange="atualizarColaborador('${c.id}', {cargo_id: this.value})">${opcoesCargo(c)}</select></td>
      <td><select onchange="atualizarColaborador('${c.id}', {gestor_id: this.value || null})">${opcoesGestor(c)}</select></td>
      <td><select onchange="atualizarColaborador('${c.id}', {papel: this.value})">${opcoesPapel(c)}</select></td>
    </tr>
  `
      )
      .join('') || '<tr><td colspan="4">Nenhum colaborador ainda. Use o formulário acima para convidar o primeiro.</td></tr>';
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

function abrirImportarColaboradores() {
  document.getElementById('importar-colab-texto').value = '';
  document.getElementById('importar-colab-resultado').innerHTML = '';
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

async function processarImportacaoColaboradores() {
  const texto = document.getElementById('importar-colab-texto').value;
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) { showToast('Cole ao menos uma linha.'); return; }

  const resultados = [];
  for (const linha of linhas) {
    const parsed = parseLinhaImportacao(linha);
    if (parsed.erro) {
      resultados.push({ nome: parsed.nome, ok: false, msg: parsed.erro });
      continue;
    }
    try {
      await sbInvokeFunction('invite-colaborador', {
        nome: parsed.nome, email: parsed.email, cargo_id: parsed.cargo_id, gestor_id: parsed.gestor_id, papel: parsed.papel,
      });
      resultados.push({ nome: parsed.nome, ok: true, msg: 'Convite enviado' });
      await carregarColaboradores(); // atualiza G.colaboradores pra permitir que a próxima linha do lote já use este como gestor
    } catch (err) {
      resultados.push({ nome: parsed.nome, ok: false, msg: err.message || 'Erro ao convidar' });
    }
  }

  document.getElementById('importar-colab-resultado').innerHTML = resultados
    .map(
      (r) => `
    <div class="import-linha ${r.ok ? 'ok' : 'erro'}">
      <span class="import-nome">${escHtml(r.nome)}</span>
      <span class="import-status">${r.ok ? '✓' : '✗'} ${escHtml(r.msg)}</span>
    </div>
  `
    )
    .join('');

  await carregarColaboradores();
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
