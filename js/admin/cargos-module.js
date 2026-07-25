// admin/cargos-module.js — CRUD de cargos

let _cargoEmEdicaoId = null;

async function carregarCargos() {
  G.cargos = (await sbFetch('/cargos?select=*,setor:setor_id(id,nome)&order=nome.asc')) || [];
  renderAdmCargos();
}

function renderAdmCargos() {
  const el = document.getElementById('adm-lista-cargos');
  if (!el) return;
  el.innerHTML =
    G.cargos.map((c) => (c.id === _cargoEmEdicaoId ? linhaCargoEdicaoHtml(c) : linhaCargoHtml(c))).join('') ||
    '<tr><td colspan="3">Nenhum cargo cadastrado.</td></tr>';
}

function linhaCargoHtml(c) {
  return `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${escHtml(c.setor?.nome || '—')}</td>
      <td><div class="tabela-acoes">
        <button class="btn-icon" title="Editar" onclick="editarCargo('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon ${c.ativo ? 'btn-icon--ativo' : 'btn-icon--inativo'}" title="${c.ativo ? 'Desativar' : 'Reativar'}" onclick="toggleCargoAtivo('${c.id}', ${!c.ativo})"><svg class="icon" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        <button class="btn-icon btn-icon--perigo" title="Excluir" onclick="excluirCargo('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div></td>
    </tr>
  `;
}

function opcoesSetorHtml(selectedId) {
  return (
    `<option value="">Sem setor</option>` +
    G.setores.filter((s) => s.ativo).map((s) => `<option value="${s.id}" ${selectedId === s.id ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')
  );
}

function linhaCargoEdicaoHtml(c) {
  return `
    <tr data-edicao="${c.id}">
      <td><input type="text" class="edit-nome" value="${escHtml(c.nome)}"></td>
      <td><select class="edit-setor">${opcoesSetorHtml(c.setor?.id || null)}</select></td>
      <td><div class="tabela-acoes">
        <button class="btn-icon" title="Salvar" onclick="salvarEdicaoCargo('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoCargo()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div></td>
    </tr>
  `;
}

function editarCargo(id) {
  _cargoEmEdicaoId = id;
  renderAdmCargos();
}

function cancelarEdicaoCargo() {
  _cargoEmEdicaoId = null;
  renderAdmCargos();
}

async function salvarEdicaoCargo(id) {
  const linha = document.querySelector(`tr[data-edicao="${id}"]`);
  const nome = linha.querySelector('.edit-nome').value.trim();
  const setorId = linha.querySelector('.edit-setor').value || null;
  if (!nome) { showToast('Informe o nome do cargo.'); return; }
  const jaExiste = G.cargos.some(
    (c) => c.id !== id && c.nome.trim().toLowerCase() === nome.toLowerCase() && (c.setor?.id || null) === setorId
  );
  if (jaExiste) { showToast('Já existe esse cargo nesse setor.'); return; }
  try {
    await sbFetch('/cargos?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ nome, setor_id: setorId }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe esse cargo nesse setor.' : 'Erro ao salvar cargo.');
    return;
  }
  _cargoEmEdicaoId = null;
  await carregarCargos();
  showToast('Cargo atualizado.');
}

async function criarCargo(nome, setorId) {
  if (!nome.trim()) { showToast('Informe o nome do cargo.'); return; }
  const jaExiste = G.cargos.some(
    (c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase() && (c.setor?.id || '') === (setorId || '')
  );
  if (jaExiste) { showToast('Já existe esse cargo nesse setor.'); return; }
  try {
    await sbFetch('/cargos', { method: 'POST', body: JSON.stringify({ nome: nome.trim(), setor_id: setorId || null }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe esse cargo nesse setor.' : 'Erro ao criar cargo.');
    return;
  }
  await carregarCargos();
  showToast('Cargo criado.');
}

async function toggleCargoAtivo(id, novoValor) {
  await sbFetch('/cargos?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
  await carregarCargos();
}

async function excluirCargo(id) {
  const cargo = G.cargos.find((c) => c.id === id);
  if (!confirm(`Excluir o cargo "${cargo?.nome || ''}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await sbFetch('/cargos?id=eq.' + id, { method: 'DELETE' });
  } catch (e) {
    showToast(String(e.message || '').includes('foreign key') ? 'Não é possível excluir: há colaboradores vinculados a esse cargo.' : 'Erro ao excluir cargo.');
    return;
  }
  await carregarCargos();
  showToast('Cargo excluído.');
}
