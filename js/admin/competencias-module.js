// admin/competencias-module.js — CRUD de competências

let _competenciaEmEdicaoId = null;

async function carregarCompetencias() {
  G.competencias = (await sbFetch('/competencias?order=tipo.asc,nome.asc')) || [];
  renderAdmCompetencias();
}

function renderAdmCompetencias() {
  const el = document.getElementById('adm-lista-competencias');
  if (!el) return;
  el.innerHTML =
    G.competencias.map((c) => (c.id === _competenciaEmEdicaoId ? linhaCompetenciaEdicaoHtml(c) : linhaCompetenciaHtml(c))).join('') ||
    '<tr><td colspan="4">Nenhuma competência cadastrada.</td></tr>';
}

function linhaCompetenciaHtml(c) {
  return `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${c.tipo === 'comportamental' ? 'Comportamental' : 'Técnica'}</td>
      <td>${escHtml(c.definicao || '—')}</td>
      <td class="tabela-acoes">
        <button class="btn-icon" title="Editar" onclick="editarCompetencia('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon ${c.ativo ? 'btn-icon--ativo' : 'btn-icon--inativo'}" title="${c.ativo ? 'Desativar' : 'Reativar'}" onclick="toggleCompetenciaAtiva('${c.id}', ${!c.ativo})"><svg class="icon" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
      </td>
    </tr>
  `;
}

function linhaCompetenciaEdicaoHtml(c) {
  return `
    <tr data-edicao="${c.id}">
      <td><input type="text" class="edit-nome" value="${escHtml(c.nome)}"></td>
      <td>
        <select class="edit-tipo">
          <option value="comportamental" ${c.tipo === 'comportamental' ? 'selected' : ''}>Comportamental</option>
          <option value="tecnica" ${c.tipo === 'tecnica' ? 'selected' : ''}>Técnica</option>
        </select>
      </td>
      <td><input type="text" class="edit-definicao" value="${escHtml(c.definicao || '')}"></td>
      <td class="tabela-acoes">
        <button class="btn-icon" title="Salvar" onclick="salvarEdicaoCompetencia('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoCompetencia()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </td>
    </tr>
  `;
}

function editarCompetencia(id) {
  _competenciaEmEdicaoId = id;
  renderAdmCompetencias();
}

function cancelarEdicaoCompetencia() {
  _competenciaEmEdicaoId = null;
  renderAdmCompetencias();
}

async function salvarEdicaoCompetencia(id) {
  const linha = document.querySelector(`tr[data-edicao="${id}"]`);
  const nome = linha.querySelector('.edit-nome').value.trim();
  const tipo = linha.querySelector('.edit-tipo').value;
  const definicao = linha.querySelector('.edit-definicao').value.trim();
  if (!nome) { showToast('Informe o nome da competência.'); return; }
  if (nomeJaExiste(G.competencias, nome, id)) { showToast('Já existe uma competência com esse nome.'); return; }
  try {
    await sbFetch('/competencias?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ nome, tipo, definicao: definicao || null }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe uma competência com esse nome.' : 'Erro ao salvar competência.');
    return;
  }
  _competenciaEmEdicaoId = null;
  await carregarCompetencias();
  showToast('Competência atualizada.');
}

async function criarCompetencia(nome, tipo, definicao) {
  if (!nome.trim()) { showToast('Informe o nome da competência.'); return; }
  if (nomeJaExiste(G.competencias, nome)) { showToast('Já existe uma competência com esse nome.'); return; }
  try {
    await sbFetch('/competencias', { method: 'POST', body: JSON.stringify({ nome: nome.trim(), tipo, definicao: definicao.trim() || null }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe uma competência com esse nome.' : 'Erro ao criar competência.');
    return;
  }
  await carregarCompetencias();
  showToast('Competência criada.');
}

async function toggleCompetenciaAtiva(id, novoValor) {
  await sbFetch('/competencias?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
  await carregarCompetencias();
}
