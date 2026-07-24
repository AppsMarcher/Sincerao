// avaliacao/etapa-competencias.js — etapa 2: notas 1-5 por competência do cargo do colaborador

function renderEtapaCompetencias() {
  const av = G.avaliacaoAtual;
  const editavel = podeEditarEtapa(av, 'competencias');
  const notasPorCompetencia = {};
  (av.notas || []).forEach((n) => (notasPorCompetencia[n.competencia_id] = n));
  const grupos = { comportamental: [], tecnica: [] };
  (av.competenciasCargo || []).forEach((cc) => grupos[cc.tipo].push(cc));
  const escalaHtml = ESCALA_NOTAS.map((e) => `<div class="escala-item"><strong>${e.nota}</strong> — ${escHtml(e.descricao)}</div>`).join('');

  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Avaliação das Competências</h3>
    <details><summary>Escala de notas</summary>${escalaHtml}</details>
    ${renderGrupoCompetencias('Competências comportamentais', grupos.comportamental, notasPorCompetencia, editavel)}
    ${renderGrupoCompetencias('Competências técnicas', grupos.tecnica, notasPorCompetencia, editavel)}
  `;
}

function renderGrupoCompetencias(titulo, lista, notasPorCompetencia, editavel) {
  if (!lista.length) return `<h4>${escHtml(titulo)}</h4><p class="muted">Nenhuma competência vinculada ao cargo deste colaborador.</p>`;
  return `
    <h4>${escHtml(titulo)}</h4>
    ${lista
      .map((c) => {
        const n = notasPorCompetencia[c.id] || {};
        return `
      <div class="competencia-row" data-competencia="${c.id}">
        <div><strong>${escHtml(c.nome)}</strong><div class="muted">${escHtml(c.definicao || '')}</div></div>
        <select ${editavel ? '' : 'disabled'}>
          <option value="">Nota</option>
          ${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${n.nota === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <textarea placeholder="Comentários" ${editavel ? '' : 'disabled'}>${escHtml(n.comentario || '')}</textarea>
        ${editavel ? `<button class="btn-link" onclick="salvarNotaCompetencia('${c.id}')">Salvar</button>` : ''}
      </div>`;
      })
      .join('')}
  `;
}

async function salvarNotaCompetencia(competenciaId) {
  const row = document.querySelector(`.competencia-row[data-competencia="${competenciaId}"]`);
  const nota = Number(row.querySelector('select').value) || null;
  const comentario = row.querySelector('textarea').value;
  const av = G.avaliacaoAtual;
  const salvo = await sbFetch('/avaliacao_notas?on_conflict=avaliacao_id,competencia_id', {
    method: 'POST',
    body: JSON.stringify({ avaliacao_id: av.id, competencia_id: competenciaId, nota, comentario }),
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
  av.notas = av.notas.filter((n) => n.competencia_id !== competenciaId).concat(salvo || []);
  showToast('Nota salva.');
}
