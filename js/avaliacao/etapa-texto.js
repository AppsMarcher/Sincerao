// avaliacao/etapa-texto.js — etapas de perguntas abertas (resultados, feedback_gestor, autoavaliacao, feedback_colaborador, resumo)

function renderEtapaTexto(etapaId) {
  const av = G.avaliacaoAtual;
  const campos = CAMPOS_ETAPA[etapaId];
  const dados = av.dados[etapaId] || {};
  const editavel = podeEditarEtapa(av, etapaId);
  const container = document.getElementById('etapa-conteudo');
  container.innerHTML = `
    <h3>${escHtml(ETAPAS.find((e) => e.id === etapaId).label)}</h3>
    <form id="form-etapa">
      ${campos
        .map(
          ([key, label]) => `
        <label class="campo">
          <span>${escHtml(label)}</span>
          <textarea name="${key}" ${editavel ? '' : 'disabled'}>${escHtml(dados[key] || '')}</textarea>
        </label>
      `
        )
        .join('')}
      ${editavel ? '<button type="submit" class="btn-primary">Salvar etapa</button>' : '<p class="muted">Etapa somente leitura no momento.</p>'}
    </form>
  `;
  if (editavel) {
    document.getElementById('form-etapa').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const novosDados = { ...av.dados, [etapaId]: Object.fromEntries(fd.entries()) };
      await atualizarAvaliacao({ dados: novosDados });
      showToast('Etapa salva.');
    });
  }
}
