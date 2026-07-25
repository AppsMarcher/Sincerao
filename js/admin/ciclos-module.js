// admin/ciclos-module.js — CRUD de ciclos de avaliação + gatilho para criação de avaliações do ciclo

let _cicloEmEdicaoId = null;

async function carregarCiclos() {
  G.ciclos = (await sbFetch('/ciclos_avaliacao?order=data_inicio.desc')) || [];
}

function renderAdmCiclos() {
  const el = document.getElementById('adm-lista-ciclos');
  el.innerHTML =
    G.ciclos.map((c) => (c.id === _cicloEmEdicaoId ? linhaCicloEdicaoHtml(c) : linhaCicloHtml(c))).join('') ||
    '<tr><td colspan="4">Nenhum ciclo cadastrado.</td></tr>';
}

function linhaCicloHtml(c) {
  return `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${fmtData(c.data_inicio)} – ${fmtData(c.data_fim)}</td>
      <td><span class="badge badge-ciclo-${escHtml(c.status)}">${escHtml(statusCicloLabel(c.status))}</span></td>
      <td><div class="tabela-acoes">
        <button class="btn-icon" title="Criar avaliações" onclick="abrirCriacaoAvaliacoes('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg></button>
        <button class="btn-icon" title="Editar" onclick="editarCiclo('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon btn-icon--perigo" title="Excluir" onclick="excluirCiclo('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div></td>
    </tr>
  `;
}

function linhaCicloEdicaoHtml(c) {
  return `
    <tr data-edicao="${c.id}">
      <td><input type="text" class="edit-nome" value="${escHtml(c.nome)}"></td>
      <td>
        <input type="date" class="edit-data-inicio" value="${c.data_inicio}">
        <input type="date" class="edit-data-fim" value="${c.data_fim}">
      </td>
      <td>
        <select class="edit-status">
          <option value="planejado" ${c.status === 'planejado' ? 'selected' : ''}>Planejado</option>
          <option value="em_andamento" ${c.status === 'em_andamento' ? 'selected' : ''}>Em andamento</option>
          <option value="encerrado" ${c.status === 'encerrado' ? 'selected' : ''}>Encerrado</option>
        </select>
      </td>
      <td><div class="tabela-acoes">
        <button class="btn-icon" title="Salvar" onclick="salvarEdicaoCiclo('${c.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoCiclo()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div></td>
    </tr>
  `;
}

function statusCicloLabel(status) {
  return { planejado: 'Planejado', em_andamento: 'Em andamento', encerrado: 'Encerrado' }[status] || status;
}

function editarCiclo(id) {
  _cicloEmEdicaoId = id;
  renderAdmCiclos();
}

function cancelarEdicaoCiclo() {
  _cicloEmEdicaoId = null;
  renderAdmCiclos();
}

async function salvarEdicaoCiclo(id) {
  const linha = document.querySelector(`tr[data-edicao="${id}"]`);
  const nome = linha.querySelector('.edit-nome').value.trim();
  const data_inicio = linha.querySelector('.edit-data-inicio').value;
  const data_fim = linha.querySelector('.edit-data-fim').value;
  const status = linha.querySelector('.edit-status').value;
  if (!nome || !data_inicio || !data_fim) { showToast('Preencha nome e datas do ciclo.'); return; }
  try {
    await sbFetch('/ciclos_avaliacao?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ nome, data_inicio, data_fim, status }) });
  } catch (e) {
    showToast('Erro ao salvar ciclo.');
    return;
  }
  _cicloEmEdicaoId = null;
  await carregarCiclos();
  renderAdmCiclos();
  showToast('Ciclo atualizado.');
}

async function excluirCiclo(id) {
  const ciclo = G.ciclos.find((c) => c.id === id);
  if (!confirm(`Excluir o ciclo "${ciclo?.nome || ''}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await sbFetch('/ciclos_avaliacao?id=eq.' + id, { method: 'DELETE' });
  } catch (e) {
    showToast(String(e.message || '').includes('foreign key') ? 'Não é possível excluir: há avaliações vinculadas a esse ciclo.' : 'Erro ao excluir ciclo.');
    return;
  }
  await carregarCiclos();
  renderAdmCiclos();
  showToast('Ciclo excluído.');
}

async function criarCiclo(nome, dataInicio, dataFim) {
  if (!nome.trim() || !dataInicio || !dataFim) { showToast('Preencha nome e datas do ciclo.'); return; }
  await sbFetch('/ciclos_avaliacao', { method: 'POST', body: JSON.stringify({ nome: nome.trim(), data_inicio: dataInicio, data_fim: dataFim, status: 'planejado' }) });
  await carregarCiclos();
  renderAdmCiclos();
  showToast('Ciclo criado.');
}
