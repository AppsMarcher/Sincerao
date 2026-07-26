// avaliacao/etapa-parecer.js — etapa 8: parecer final, cálculo de pontuação e ciência digital

function renderEtapaParecer() {
  const av = G.avaliacaoAtual;
  const dados = av.dados.parecer || {};
  const papel = meuPapelNaAvaliacao(av);
  const podeEditar = (papel === 'gestor' || papel === 'rh') && av.status === 'aguardando_alinhamento';
  const concluida = av.status === 'concluida';
  const rascunho = podeEditar ? lerRascunhoEtapa(av.id, 'parecer_consenso') : null;
  const parecerLegado = [dados.parecer_gestor, dados.parecer_colaborador].filter(Boolean).join('\n\n');
  const valor = rascunho?.valores?.valor ?? dados.parecer_consenso ?? parecerLegado;
  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Parecer Final</h3>
    ${rascunho ? '<p class="muted">Rascunho local recuperado. Salve para concluir a avaliação.</p>' : ''}
    <label class="campo"><span>Parecer do Gestor e Colaborador</span><textarea id="parecer-consenso" ${podeEditar ? '' : 'disabled'}>${escHtml(valor)}</textarea></label>
    ${podeEditar ? '<div class="etapa-acoes"><button class="btn-primary" onclick="salvarParecerConsenso()">Salvar e concluir avaliação</button></div>' : ''}
    ${concluida ? renderResultadoFinal(av) : ''}
    ${av.status === 'aguardando_alinhamento' ? '<p class="muted">Registre aqui o parecer definido no consenso para concluir a avaliação.</p>' : ''}
    ${concluida ? renderCiencia(av, papel) : ''}
  `;
  if (podeEditar) {
    document.getElementById('parecer-consenso').addEventListener('input', (e) => {
      salvarRascunhoEtapa(av.id, 'parecer_consenso', { valor: e.target.value });
    });
  }
}

function renderResultadoFinal(av) {
  return `
    <div class="resultado-final">
      <div><strong>Pontuação Geral:</strong> ${av.pontuacao_geral ?? '—'} / 5</div>
      <div><strong>Percentual:</strong> ${av.percentual ?? '—'}%</div>
      <div><strong>Classificação:</strong> ${escHtml(av.classificacao || '—')}</div>
    </div>`;
}

function renderCiencia(av, meuPapel) {
  const item = (papel, label, ts) => `
    <div class="ciencia-item">
      <span>${label}: ${ts ? 'confirmado em ' + new Date(ts).toLocaleString('pt-BR') : 'pendente'}</span>
      ${!ts && meuPapel === papel ? `<button class="btn-link" onclick="registrarCiencia('${papel}')">Declarar ciência</button>` : ''}
    </div>`;
  return `<div class="ciencia-wrap">
    <h4>Ciência</h4>
    ${item('colaborador', 'Colaborador', av.ciencia_colaborador_em)}
    ${item('gestor', 'Gestor', av.ciencia_gestor_em)}
    ${item('rh', 'RH', av.ciencia_rh_em)}
  </div>`;
}

async function salvarParecerConsenso() {
  const av = G.avaliacaoAtual;
  const valor = document.getElementById('parecer-consenso').value.trim();
  if (!valor) { showToast('Preencha o parecer final antes de concluir.'); return; }
  const novosDados = { ...av.dados, parecer: { ...(av.dados.parecer || {}), parecer_consenso: valor } };
  try {
    await atualizarAvaliacao({ dados: novosDados, status: 'concluida', concluida_em: new Date().toISOString() });
    limparRascunhoEtapa(av.id, 'parecer_consenso');
    showToast('Parecer salvo e avaliação concluída.');
    document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
    renderEtapaAtiva();
    dispararEmailFluxo('avaliacao_concluida');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) {
      showToast(mensagemErroAvaliacao(err, 'Não foi possível concluir. O parecer continua guardado neste navegador.'));
    }
  }
}

async function concluirAvaliacaoAgora() {
  const av = G.avaliacaoAtual;
  const notas = (av.notas || []).map((n) => n.nota).filter((n) => n != null);
  const { pontuacaoGeral, percentual, classificacao } = calcularPontuacao(notas);
  if (pontuacaoGeral == null) {
    showToast('Preencha as notas das competências antes de concluir.');
    return;
  }
  try {
    await atualizarAvaliacao({
      status: 'concluida',
      concluida_em: new Date().toISOString(),
      pontuacao_geral: pontuacaoGeral,
      percentual,
      classificacao,
    });
    showToast('Avaliação concluída.');
    document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
    renderBotoesTransicao();
    renderEtapaAtiva();
    dispararEmailFluxo('avaliacao_concluida');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível concluir a avaliação.');
  }
}

async function registrarCiencia(papel) {
  try {
    await atualizarAvaliacao({ ['ciencia_' + papel + '_em']: new Date().toISOString() });
    showToast('Ciência registrada.');
    renderEtapaAtiva();
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível registrar a ciência.');
  }
}
