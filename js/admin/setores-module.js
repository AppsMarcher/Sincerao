// admin/setores-module.js — CRUD de setores

let _setorEmEdicaoId = null;

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
    G.setores.map((s) => (s.id === _setorEmEdicaoId ? linhaSetorEdicaoHtml(s) : linhaSetorHtml(s))).join('') ||
    '<tr><td colspan="2">Nenhum setor cadastrado.</td></tr>';
}

function linhaSetorHtml(s) {
  return `
    <tr>
      <td>${escHtml(s.nome)}</td>
      <td class="tabela-acoes">
        <button class="btn-icon" title="Editar" onclick="editarSetor('${s.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon ${s.ativo ? 'btn-icon--ativo' : 'btn-icon--inativo'}" title="${s.ativo ? 'Desativar' : 'Reativar'}" onclick="toggleSetorAtivo('${s.id}', ${!s.ativo})"><svg class="icon" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        <button class="btn-icon btn-icon--perigo" title="Excluir" onclick="excluirSetor('${s.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>
  `;
}

function linhaSetorEdicaoHtml(s) {
  return `
    <tr data-edicao="${s.id}">
      <td><input type="text" class="edit-nome" value="${escHtml(s.nome)}"></td>
      <td class="tabela-acoes">
        <button class="btn-icon" title="Salvar" onclick="salvarEdicaoSetor('${s.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoSetor()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </td>
    </tr>
  `;
}

function editarSetor(id) {
  _setorEmEdicaoId = id;
  renderAdmSetores();
}

function cancelarEdicaoSetor() {
  _setorEmEdicaoId = null;
  renderAdmSetores();
}

async function salvarEdicaoSetor(id) {
  const linha = document.querySelector(`tr[data-edicao="${id}"]`);
  const nome = linha.querySelector('.edit-nome').value.trim();
  if (!nome) { showToast('Informe o nome do setor.'); return; }
  if (nomeJaExiste(G.setores, nome, id)) { showToast('Já existe esse setor.'); return; }
  try {
    await sbFetch('/setores?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ nome }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe esse setor.' : 'Erro ao salvar setor.');
    return;
  }
  _setorEmEdicaoId = null;
  await carregarSetores();
  showToast('Setor atualizado.');
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

async function excluirSetor(id) {
  const setor = G.setores.find((s) => s.id === id);
  if (!confirm(`Excluir o setor "${setor?.nome || ''}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await sbFetch('/setores?id=eq.' + id, { method: 'DELETE' });
  } catch (e) {
    showToast(String(e.message || '').includes('foreign key') ? 'Não é possível excluir: há cargos vinculados a esse setor.' : 'Erro ao excluir setor.');
    return;
  }
  await carregarSetores();
  showToast('Setor excluído.');
}
