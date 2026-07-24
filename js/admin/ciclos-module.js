// admin/ciclos-module.js — CRUD de ciclos de avaliação + gatilho para criação de avaliações do ciclo

async function carregarCiclos() {
  G.ciclos = (await sbFetch('/ciclos_avaliacao?order=data_inicio.desc')) || [];
}

function renderAdmCiclos() {
  const el = document.getElementById('adm-lista-ciclos');
  el.innerHTML =
    G.ciclos
      .map(
        (c) => `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${fmtData(c.data_inicio)} – ${fmtData(c.data_fim)}</td>
      <td>${escHtml(c.status)}</td>
      <td><button class="btn-link" onclick="abrirCriacaoAvaliacoes('${c.id}')">Criar avaliações</button></td>
    </tr>
  `
      )
      .join('') || '<tr><td colspan="4">Nenhum ciclo cadastrado.</td></tr>';
}

async function criarCiclo(nome, dataInicio, dataFim) {
  if (!nome.trim() || !dataInicio || !dataFim) { showToast('Preencha nome e datas do ciclo.'); return; }
  await sbFetch('/ciclos_avaliacao', { method: 'POST', body: JSON.stringify({ nome: nome.trim(), data_inicio: dataInicio, data_fim: dataFim, status: 'planejado' }) });
  await carregarCiclos();
  renderAdmCiclos();
  showToast('Ciclo criado.');
}
