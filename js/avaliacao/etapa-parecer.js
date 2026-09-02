// avaliacao/etapa-parecer.js — etapa 8: parecer final, cálculo de pontuação e ciência digital

function renderEtapaParecer() {
  const av = G.avaliacaoAtual;
  const dados = av.dados.parecer || {};
  const papel = meuPapelNaAvaliacao(av);
  const podeEditar = (papel === 'gestor' || papel === 'rh') && av.status === 'aguardando_alinhamento';
  const aguardandoCiencia = av.status === 'aguardando_ciencia';
  const concluida = av.status === 'concluida';
  const finalizada = aguardandoCiencia || concluida;
  const rascunho = podeEditar ? lerRascunhoEtapa(av.id, 'parecer_consenso') : null;
  const parecerLegado = [dados.parecer_gestor, dados.parecer_colaborador].filter(Boolean).join('\n\n');
  const valor = rascunho?.valores?.valor ?? dados.parecer_consenso ?? parecerLegado;
  document.getElementById('etapa-conteudo').innerHTML = `
    <h3>Parecer Final</h3>
    ${renderAvisoRetrocesso(av)}
    ${rascunho ? '<p class="muted">Rascunho local recuperado. Salve para solicitar as ciências.</p>' : ''}
    <label class="campo"><span>Parecer do Gestor e Colaborador</span><textarea id="parecer-consenso" ${podeEditar ? '' : 'disabled'}>${escHtml(valor)}</textarea></label>
    ${podeEditar ? '<div class="etapa-acoes"><button class="btn-primary" onclick="salvarParecerConsenso()">Salvar consenso e solicitar ciência</button></div>' : ''}
    ${finalizada ? renderResultadoFinal(av) : ''}
    ${av.status === 'aguardando_alinhamento' ? '<p class="muted">Registre aqui o parecer definido no consenso. Depois, gestor e colaborador precisarão declarar ciência.</p>' : ''}
    ${finalizada ? renderCiencia(av, papel) : ''}
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
  </div>`;
}

async function salvarParecerConsenso() {
  const av = G.avaliacaoAtual;
  const valor = document.getElementById('parecer-consenso').value.trim();
  if (!respostaValida(valor)) {
    showToast(`Preencha o parecer final com um texto completo (mínimo ${MIN_CHARS_RESPOSTA_AVALIACAO} caracteres) antes de solicitar as ciências.`);
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
    await atualizarAvaliacao({ dados: novosDados, status: 'aguardando_ciencia', concluida_em: null, pontuacao_geral: pontuacaoGeral, percentual, classificacao });
    limparRascunhoEtapa(av.id, 'parecer_consenso');
    showToast('Consenso salvo. Aguardando ciência do gestor e do colaborador.');
    document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
    renderEtapaAtiva();
    dispararEmailFluxo('consenso_aguardando_ciencia');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) {
      showToast(mensagemErroAvaliacao(err, 'Não foi possível salvar o consenso. O parecer continua guardado neste navegador.'));
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
      status: 'aguardando_ciencia',
      concluida_em: null,
      pontuacao_geral: pontuacaoGeral,
      percentual,
      classificacao,
    });
    showToast('Consenso salvo. Aguardando ciência do gestor e do colaborador.');
    document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
    renderBotoesTransicao();
    renderEtapaAtiva();
    dispararEmailFluxo('consenso_aguardando_ciencia');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível salvar o consenso.');
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
