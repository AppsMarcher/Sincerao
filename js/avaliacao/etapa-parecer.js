// avaliacao/etapa-parecer.js — etapa 8: parecer final, cálculo de pontuação e ciência digital

function renderEtapaParecer() {
  const av = G.avaliacaoAtual;
  const dados = av.dados.parecer || {};
  const papel = meuPapelNaAvaliacao(av);
  const podeEditar = (papel === 'gestor' || papel === 'rh') && av.status === 'aguardando_alinhamento';
  const concluida = av.status === 'concluida';
  const podeReabrir = concluida && ehRhOuAdmin();
  const rascunho = podeEditar ? lerRascunhoEtapa(av.id, 'parecer_consenso') : null;
  const parecerLegado = [dados.parecer_gestor, dados.parecer_colaborador].filter(Boolean).join('\n\n');
  const valor = rascunho?.valores?.valor ?? dados.parecer_consenso ?? parecerLegado;
  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Parecer Final</h3>
    ${renderAvisoReabertura(av)}
    ${rascunho ? '<p class="muted">Rascunho local recuperado. Salve para concluir a avaliação.</p>' : ''}
    <label class="campo"><span>Parecer do Gestor e Colaborador</span><textarea id="parecer-consenso" ${podeEditar ? '' : 'disabled'}>${escHtml(valor)}</textarea></label>
    ${podeEditar ? '<div class="etapa-acoes"><button class="btn-primary" onclick="salvarParecerConsenso()">Salvar e concluir avaliação</button></div>' : ''}
    ${concluida ? renderResultadoFinal(av) : ''}
    ${av.status === 'aguardando_alinhamento' ? '<p class="muted">Registre aqui o parecer definido no consenso para concluir a avaliação.</p>' : ''}
    ${concluida ? renderCiencia(av, papel) : ''}
    ${podeReabrir ? '<div class="etapa-acoes"><button class="btn-link btn-link--perigo" onclick="abrirModalReabrirAvaliacao()">Reabrir avaliação</button></div>' : ''}
  `;
  if (podeEditar) {
    document.getElementById('parecer-consenso').addEventListener('input', (e) => {
      salvarRascunhoEtapa(av.id, 'parecer_consenso', { valor: e.target.value });
    });
  }
}

function renderAvisoReabertura(av) {
  const r = av.dados?.reabertura;
  if (!r) return '';
  return `<div class="aviso-reabertura"><strong>Avaliação reaberta${r.reaberto_por_nome ? ' por ' + escHtml(r.reaberto_por_nome) : ''}</strong> em ${new Date(r.reaberto_em).toLocaleString('pt-BR')}.<br>Motivo: ${escHtml(r.motivo)}</div>`;
}

function abrirModalReabrirAvaliacao() {
  document.getElementById('reabrir-motivo').value = '';
  document.getElementById('modal-reabrir-avaliacao').classList.add('open');
}

function fecharModalReabrirAvaliacao() {
  document.getElementById('modal-reabrir-avaliacao').classList.remove('open');
}

async function confirmarReabrirAvaliacao() {
  const av = G.avaliacaoAtual;
  const motivo = document.getElementById('reabrir-motivo').value.trim();
  if (!respostaValida(motivo)) {
    showToast(`Descreva o motivo da reabertura (mínimo ${MIN_CHARS_RESPOSTA_AVALIACAO} caracteres).`);
    return;
  }
  const novosDados = {
    ...av.dados,
    reabertura: {
      motivo,
      reaberto_por_nome: G.perfil?.nome || null,
      reaberto_por_email: G.perfil?.email || null,
      reaberto_em: new Date().toISOString(),
    },
  };
  try {
    await atualizarAvaliacao({
      dados: novosDados,
      status: 'aguardando_alinhamento',
      ciencia_colaborador_em: null,
      ciencia_gestor_em: null,
    });
    fecharModalReabrirAvaliacao();
    showToast('Avaliação reaberta. Plano, Resumo e Parecer voltaram a ficar editáveis.');
    document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
    renderBotoesTransicao();
    renderEtapaAtiva();
  } catch (err) {
    showToast(mensagemErroAvaliacao(err, 'Não foi possível reabrir a avaliação.'));
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
  </div>`;
}

async function salvarParecerConsenso() {
  const av = G.avaliacaoAtual;
  const valor = document.getElementById('parecer-consenso').value.trim();
  if (!respostaValida(valor)) {
    showToast(`Preencha o parecer final com um texto completo (mínimo ${MIN_CHARS_RESPOSTA_AVALIACAO} caracteres) antes de concluir.`);
    return;
  }
  const notas = (av.notas || []).map((n) => n.nota).filter((n) => n != null);
  const { pontuacaoGeral, percentual, classificacao } = calcularPontuacao(notas);
  if (pontuacaoGeral == null) {
    showToast('Preencha as notas das competências antes de concluir.');
    return;
  }
  const novosDados = { ...av.dados, parecer: { ...(av.dados.parecer || {}), parecer_consenso: valor } };
  try {
    await atualizarAvaliacao({ dados: novosDados, status: 'concluida', concluida_em: new Date().toISOString(), pontuacao_geral: pontuacaoGeral, percentual, classificacao });
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
    const patch = { ['ciencia_' + papel + '_em']: new Date().toISOString() };
    await atualizarAvaliacao(patch);
    showToast('Ciência registrada.');
    renderEtapaAtiva();
    const av = G.avaliacaoAtual;
    if (av.ciencia_colaborador_em && av.ciencia_gestor_em) await finalizarConsensoAutomatico(av);
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível registrar a ciência.');
  }
}

// Dispara só pra quem registrou a 2ª ciência do par (colaborador/gestor, em
// qualquer ordem) -- a checagem acima só dá as duas preenchidas pra quem de
// fato completou o par, graças à fila com merge por versão de
// atualizarAvaliacao (a mesma gravação nunca vê "as duas preenchidas" duas
// vezes). Reenvio de e-mail continua disponível manualmente em Exportar, caso
// o envio automático falhe.
async function finalizarConsensoAutomatico(av) {
  const souColaborador = meuPapelNaAvaliacao(av) === 'colaborador';
  const outroNome = souColaborador ? (av.gestor?.nome || 'o gestor') : (av.colaborador?.nome || 'o colaborador');
  try {
    await sbInvokeFunction('enviar-avaliacao', { avaliacao_id: av.id });
  } catch {
    // Melhor esforço, igual dispararEmailFluxo -- não bloqueia a experiência.
  }
  abrirModalConsensoConcluido(`Você e ${outroNome} já deram ciência do consenso. A avaliação foi enviada por e-mail aos envolvidos.`);
}

function abrirModalConsensoConcluido(mensagem) {
  document.getElementById('consenso-concluido-texto').textContent = mensagem;
  document.getElementById('modal-consenso-concluido').classList.add('open');
}

function fecharModalConsensoConcluido() {
  document.getElementById('modal-consenso-concluido').classList.remove('open');
}
