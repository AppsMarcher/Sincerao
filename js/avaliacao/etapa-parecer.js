// avaliacao/etapa-parecer.js — etapa 8: parecer final, cálculo de pontuação e ciência digital

function renderEtapaParecer() {
  const av = G.avaliacaoAtual;
  const dados = av.dados.parecer || {};
  const papel = meuPapelNaAvaliacao(av);
  const podeGestor = (papel === 'gestor' || papel === 'rh') && av.status === 'aguardando_alinhamento';
  const podeColaborador = (papel === 'colaborador' || papel === 'rh') && av.status === 'aguardando_alinhamento';
  const concluida = av.status === 'concluida';
  const rascunhoGestor = podeGestor ? lerRascunhoEtapa(av.id, 'parecer_gestor') : null;
  const rascunhoColaborador = podeColaborador ? lerRascunhoEtapa(av.id, 'parecer_colaborador') : null;
  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Parecer Final</h3>
    ${(rascunhoGestor || rascunhoColaborador) ? '<p class="muted">Rascunho local recuperado. Salve o parecer para confirmar no banco.</p>' : ''}
    <label class="campo"><span>Parecer do Gestor</span><textarea id="parecer-gestor" ${podeGestor ? '' : 'disabled'}>${escHtml(rascunhoGestor?.valores?.valor ?? dados.parecer_gestor ?? '')}</textarea></label>
    ${podeGestor ? '<button class="btn-link" onclick="salvarParecer(\'parecer_gestor\')">Salvar parecer do gestor</button>' : ''}
    <label class="campo"><span>Parecer do Colaborador</span><textarea id="parecer-colaborador" ${podeColaborador ? '' : 'disabled'}>${escHtml(rascunhoColaborador?.valores?.valor ?? dados.parecer_colaborador ?? '')}</textarea></label>
    ${podeColaborador ? '<button class="btn-link" onclick="salvarParecer(\'parecer_colaborador\')">Salvar parecer do colaborador</button>' : ''}
    ${concluida ? renderResultadoFinal(av) : ''}
    ${(papel === 'gestor' || papel === 'rh') && av.status === 'aguardando_alinhamento' ? '<button class="btn-primary" onclick="concluirAvaliacao()">Concluir avaliação</button>' : ''}
    ${concluida ? renderCiencia(av, papel) : ''}
  `;
  if (podeGestor) {
    document.getElementById('parecer-gestor').addEventListener('input', (e) => {
      salvarRascunhoEtapa(av.id, 'parecer_gestor', { valor: e.target.value });
    });
  }
  if (podeColaborador) {
    document.getElementById('parecer-colaborador').addEventListener('input', (e) => {
      salvarRascunhoEtapa(av.id, 'parecer_colaborador', { valor: e.target.value });
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

async function salvarParecer(campo) {
  const av = G.avaliacaoAtual;
  const valor = document.getElementById(campo === 'parecer_gestor' ? 'parecer-gestor' : 'parecer-colaborador').value;
  const novosDados = { ...av.dados, parecer: { ...(av.dados.parecer || {}), [campo]: valor } };
  try {
    await atualizarAvaliacao({ dados: novosDados });
    limparRascunhoEtapa(av.id, campo);
    showToast('Parecer salvo no banco.');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) {
      showToast('Não foi possível salvar. O parecer continua guardado neste navegador.');
    }
  }
}

async function concluirAvaliacao() {
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
