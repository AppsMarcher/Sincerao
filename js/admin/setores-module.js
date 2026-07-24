// admin/setores-module.js — CRUD de setores

async function carregarSetores() {
  G.setores = (await sbFetch('/setores?order=nome.asc')) || [];
  renderAdmSetores();
  renderSelectSetorCargo();
}

function renderSelectSetorCargo() {
  const el = document.getElementById('cargo-select-setor');
  if (!el) return;
  el.innerHTML =
    '<option value="">Sem setor</option>' +
    G.setores.filter((s) => s.ativo).map((s) => `<option value="${s.id}">${escHtml(s.nome)}</option>`).join('');
}

function renderAdmSetores() {
  const el = document.getElementById('adm-lista-setores');
  if (!el) return;
  el.innerHTML =
    G.setores
      .map(
        (s) => `
    <tr>
      <td>${escHtml(s.nome)}</td>
      <td>${s.ativo ? 'Ativo' : 'Inativo'}</td>
      <td><button class="btn-link" onclick="toggleSetorAtivo('${s.id}', ${!s.ativo})">${s.ativo ? 'Desativar' : 'Reativar'}</button></td>
    </tr>
  `
      )
      .join('') || '<tr><td colspan="3">Nenhum setor cadastrado.</td></tr>';
}

async function criarSetor(nome) {
  if (!nome.trim()) { showToast('Informe o nome do setor.'); return; }
  if (nomeJaExiste(G.setores, nome)) { showToast('Já existe esse setor.'); return; }
  try {
    await sbFetch('/setores', { method: 'POST', body: JSON.stringify({ nome: nome.trim() }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe esse setor.' : 'Erro ao criar setor.');
    return;
  }
  await carregarSetores();
  showToast('Setor criado.');
}

async function toggleSetorAtivo(id, novoValor) {
  await sbFetch('/setores?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
  await carregarSetores();
}
