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
    '<tr><td colspan="5">Nenhuma competência cadastrada.</td></tr>';
}

function linhaCompetenciaHtml(c) {
  return `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${c.tipo === 'comportamental' ? 'Comportamental' : 'Técnica'}</td>
      <td>${escHtml(c.definicao || '—')}</td>
      <td>${c.ativo ? 'Ativa' : 'Inativa'}</td>
      <td>
        <button class="btn-link" onclick="editarCompetencia('${c.id}')">Editar</button>
        <button class="btn-link" onclick="toggleCompetenciaAtiva('${c.id}', ${!c.ativo})">${c.ativo ? 'Desativar' : 'Reativar'}</button>
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
      <td>${c.ativo ? 'Ativa' : 'Inativa'}</td>
      <td>
        <button class="btn-link" onclick="salvarEdicaoCompetencia('${c.id}')">Salvar</button>
        <button class="btn-link" onclick="cancelarEdicaoCompetencia()">Cancelar</button>
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
  await sbFetch('/competencias?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ nome, tipo, definicao: definicao || null }) });
  _competenciaEmEdicaoId = null;
  await carregarCompetencias();
  showToast('Competência atualizada.');
}

async function criarCompetencia(nome, tipo, definicao) {
  if (!nome.trim()) { showToast('Informe o nome da competência.'); return; }
  await sbFetch('/competencias', { method: 'POST', body: JSON.stringify({ nome: nome.trim(), tipo, definicao: definicao.trim() || null }) });
  await carregarCompetencias();
  showToast('Competência criada.');
}

async function toggleCompetenciaAtiva(id, novoValor) {
  await sbFetch('/competencias?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
  await carregarCompetencias();
}
