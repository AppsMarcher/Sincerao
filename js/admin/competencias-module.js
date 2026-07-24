// admin/competencias-module.js — CRUD de competências

async function carregarCompetencias() {
  G.competencias = (await sbFetch('/competencias?order=tipo.asc,nome.asc')) || [];
  renderAdmCompetencias();
}

function renderAdmCompetencias() {
  const el = document.getElementById('adm-lista-competencias');
  if (!el) return;
  el.innerHTML =
    G.competencias
      .map(
        (c) => `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${c.tipo === 'comportamental' ? 'Comportamental' : 'Técnica'}</td>
      <td>${escHtml(c.definicao || '—')}</td>
      <td>${c.ativo ? 'Ativa' : 'Inativa'}</td>
      <td><button class="btn-link" onclick="toggleCompetenciaAtiva('${c.id}', ${!c.ativo})">${c.ativo ? 'Desativar' : 'Reativar'}</button></td>
    </tr>
  `
      )
      .join('') || '<tr><td colspan="5">Nenhuma competência cadastrada.</td></tr>';
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
