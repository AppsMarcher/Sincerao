// admin/colaboradores-module.js — edição de cargo/gestor/papel dos perfis já convidados
// (a criação do usuário em si acontece no painel do Supabase; a linha em perfis nasce via trigger)

async function carregarColaboradores() {
  G.colaboradores = (await sbFetch('/perfis?select=*,cargo:cargo_id(nome)&order=nome.asc')) || [];
}

function renderAdmColaboradores() {
  const el = document.getElementById('adm-lista-colaboradores');
  const opcoesCargo = (c) =>
    G.cargos.filter((cg) => cg.ativo).map((cg) => `<option value="${cg.id}" ${c.cargo_id === cg.id ? 'selected' : ''}>${escHtml(cg.nome)}</option>`).join('');
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
      .join('') || '<tr><td colspan="4">Nenhum colaborador convidado ainda. Convide pelo painel do Supabase (Authentication).</td></tr>';
}

async function atualizarColaborador(id, campos) {
  await sbFetch('/perfis?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(campos) });
  await carregarColaboradores();
  renderAdmColaboradores();
  showToast('Colaborador atualizado.');
}
