// admin/colaboradores-module.js — convite de novos colaboradores e edição de cargo/gestor/papel

async function carregarColaboradores() {
  G.colaboradores = (await sbFetch('/perfis?select=*,cargo:cargo_id(nome,setor)&order=nome.asc')) || [];
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
