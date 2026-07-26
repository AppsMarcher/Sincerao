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
    ${editavel ? '<div class="etapa-acoes"><button class="btn-primary" onclick="avancarCompetencias()">Salvar e avançar</button></div>' : ''}
  `;
}

async function avancarCompetencias() {
  try { await salvarEtapaEAvancar(); showToast('Etapa de competências concluída.'); }
  catch { showToast('Não foi possível avançar nesta etapa.'); }
}

function renderGrupoCompetencias(titulo, lista, notasPorCompetencia, editavel) {
  if (!lista.length) return `<h4>${escHtml(titulo)}</h4><p class="muted">Nenhuma competência vinculada ao cargo deste colaborador.</p>`;
  return `
    <h4>${escHtml(titulo)}</h4>
    ${lista
      .map((c) => {
        const n = notasPorCompetencia[c.id] || {};
        const rascunho = editavel ? lerRascunhoEtapa(G.avaliacaoAtual.id, 'nota_' + c.id) : null;
        const valorNota = rascunho?.valores?.nota ?? n.nota ?? '';
        const valorComentario = rascunho?.valores?.comentario ?? n.comentario ?? '';
        return `
      <div class="competencia-row" data-competencia="${c.id}">
        <div><strong>${escHtml(c.nome)}</strong><div class="muted">${escHtml(c.definicao || '')}</div></div>
        <select ${editavel ? `onchange="salvarRascunhoNota('${c.id}')"` : 'disabled'}>
          <option value="">Nota</option>
          ${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${Number(valorNota) === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <textarea placeholder="Comentários" ${editavel ? `oninput="salvarRascunhoNota('${c.id}')"` : 'disabled'}>${escHtml(valorComentario)}</textarea>
        ${editavel ? `<button class="btn-link" onclick="salvarNotaCompetencia('${c.id}')">Salvar</button>` : ''}
      </div>`;
      })
      .join('')}
  `;
}

function salvarRascunhoNota(competenciaId) {
  const row = document.querySelector(`.competencia-row[data-competencia="${competenciaId}"]`);
  if (!row) return;
  salvarRascunhoEtapa(G.avaliacaoAtual.id, 'nota_' + competenciaId, {
    nota: row.querySelector('select').value,
    comentario: row.querySelector('textarea').value,
  });
}

async function salvarNotaCompetencia(competenciaId) {
  const row = document.querySelector(`.competencia-row[data-competencia="${competenciaId}"]`);
  const nota = Number(row.querySelector('select').value) || null;
  const comentario = row.querySelector('textarea').value;
  const av = G.avaliacaoAtual;
  const existente = av.notas.find((n) => n.competencia_id === competenciaId);

  try {
    let salvo;
    if (existente) {
      salvo = await sbFetch('/avaliacao_notas?id=eq.' + existente.id + '&versao=eq.' + (Number(existente.versao) || 1), {
        method: 'PATCH',
        body: JSON.stringify({ nota, comentario }),
      });
      if (!salvo?.length) {
        const remoto = await sbFetch('/avaliacao_notas?id=eq.' + existente.id);
        av.notas = av.notas.filter((n) => n.id !== existente.id).concat(remoto || []);
        showToast('Conflito: esta competência foi alterada em outra sessão. Revise e clique em Salvar novamente.');
        return;
      }
    } else {
      salvo = await sbFetch('/avaliacao_notas', {
        method: 'POST',
        body: JSON.stringify({ avaliacao_id: av.id, competencia_id: competenciaId, nota, comentario }),
      });
    }
    av.notas = av.notas.filter((n) => n.competencia_id !== competenciaId).concat(salvo || []);
    limparRascunhoEtapa(av.id, 'nota_' + competenciaId);
    showToast('Nota salva no banco.');
  } catch (err) {
    if (String(err?.message || '').includes('duplicate')) {
      const remoto = await sbFetch('/avaliacao_notas?avaliacao_id=eq.' + av.id + '&competencia_id=eq.' + competenciaId);
      av.notas = av.notas.filter((n) => n.competencia_id !== competenciaId).concat(remoto || []);
      showToast('Conflito: outra sessão criou esta nota primeiro. Revise e salve novamente.');
      return;
    }
    showToast('Não foi possível salvar a nota. O conteúdo permanece na tela.');
  }
}
