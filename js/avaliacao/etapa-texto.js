// avaliacao/etapa-texto.js — etapas de perguntas abertas (resultados, feedback_gestor, autoavaliacao, feedback_colaborador, resumo)

function chaveRascunhoEtapa(avaliacaoId, etapaId) {
  return `sincerao_rascunho_v1:${G.perfil?.id || 'anon'}:${avaliacaoId}:${etapaId}`;
}

function lerRascunhoEtapa(avaliacaoId, etapaId) {
  try {
    const raw = localStorage.getItem(chaveRascunhoEtapa(avaliacaoId, etapaId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function salvarRascunhoEtapa(avaliacaoId, etapaId, valores) {
  try {
    localStorage.setItem(
      chaveRascunhoEtapa(avaliacaoId, etapaId),
      JSON.stringify({ valores, salvoEm: new Date().toISOString() })
    );
  } catch {
    // O salvamento no banco continua funcionando mesmo se o navegador bloquear
    // armazenamento local (modo privado, política corporativa ou quota cheia).
  }
}

function limparRascunhoEtapa(avaliacaoId, etapaId) {
  try {
    localStorage.removeItem(chaveRascunhoEtapa(avaliacaoId, etapaId));
  } catch {}
}

function renderEtapaTexto(etapaId) {
  const av = G.avaliacaoAtual;
  const etapa = ETAPAS.find((item) => item.id === etapaId);
  const campos = CAMPOS_ETAPA[etapaId];
  if (!etapa || !campos) {
    document.getElementById('etapa-conteudo').innerHTML = '<p class="empty">Esta etapa não está disponível para o seu perfil no momento.</p>';
    return;
  }
  const dados = av.dados[etapaId] || {};
  const editavel = podeEditarEtapa(av, etapaId);
  const rascunho = editavel ? lerRascunhoEtapa(av.id, etapaId) : null;
  const valoresExibidos = rascunho?.valores || dados;
  const container = document.getElementById('etapa-conteudo');
  container.innerHTML = `
    <h3>${escHtml(etapa.label)}</h3>
    ${rascunho ? '<p class="muted">Rascunho local recuperado deste navegador. Salve a etapa para confirmar no banco.</p>' : ''}
    <form id="form-etapa">
      ${campos
        .map(
          ([key, label]) => `
        <label class="campo">
          <span>${escHtml(label)}</span>
          <textarea name="${key}" ${editavel ? '' : 'disabled'}>${escHtml(valoresExibidos[key] || '')}</textarea>
        </label>
      `
        )
        .join('')}
      ${editavel ? '<div class="etapa-acoes"><button type="submit" class="btn-link">Salvar sem avançar</button><button type="button" class="btn-primary" id="btn-salvar-avancar">Salvar e avançar</button></div>' : '<p class="muted">Etapa somente leitura no momento.</p>'}
    </form>
  `;
  if (editavel) {
    const form = document.getElementById('form-etapa');
    form.addEventListener('input', () => {
      salvarRascunhoEtapa(av.id, etapaId, Object.fromEntries(new FormData(form).entries()));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const novosDados = { ...av.dados, [etapaId]: Object.fromEntries(fd.entries()) };
      try {
        await atualizarAvaliacao({ dados: novosDados });
        limparRascunhoEtapa(av.id, etapaId);
        showToast('Etapa salva no banco.');
      } catch (err) {
        if (!String(err?.message || '').includes('Conflito')) {
          showToast('Não foi possível salvar. O rascunho continua guardado neste navegador.');
        }
      }
    });
    document.getElementById('btn-salvar-avancar').addEventListener('click', async () => {
      const novosDados = { ...av.dados, [etapaId]: Object.fromEntries(new FormData(form).entries()) };
      try { await salvarEtapaEAvancar({ dados: novosDados }); limparRascunhoEtapa(av.id, etapaId); showToast('Etapa salva.'); }
      catch (err) { if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível salvar esta etapa.'); }
    });
  }
}
