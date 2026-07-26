// avaliacao/avaliacao-core.js — abertura da avaliação, permissões por etapa, navegação do wizard e transições de status

function meuPapelNaAvaliacao(av) {
  if (ehRhOuAdmin()) return 'rh';
  if (av.gestor_id === G.perfil.id) return 'gestor';
  if (av.colaborador_id === G.perfil.id) return 'colaborador';
  return null;
}

function podeEditarEtapa(av, etapaId) {
  const papel = meuPapelNaAvaliacao(av);
  if (papel === 'rh') return true;
  const status = av.status;
  if (['resultados', 'competencias', 'feedback_gestor'].includes(etapaId)) {
    return papel === 'gestor' && status === 'rascunho';
  }
  if (['autoavaliacao', 'feedback_colaborador'].includes(etapaId)) {
    return papel === 'colaborador' && status === 'aguardando_autoavaliacao';
  }
  if (etapaId === 'plano_desenvolvimento' || etapaId === 'resumo') {
    return (papel === 'gestor' || papel === 'colaborador') && status === 'aguardando_alinhamento';
  }
  return false;
}

async function abrirAvaliacao(id) {
  let rows = await sbFetch(
    '/avaliacoes?id=eq.' + id + '&select=*,colaborador:colaborador_id(id,nome,cargo_id),gestor:gestor_id(id,nome),ciclo:ciclo_id(nome)'
  );
  let av = rows[0];
  // Na Fase 2 o banco bloqueia a linha original para o colaborador, pois ela
  // contém o parecer e as notas do gestor. A RPC retorna só seus campos.
  if (!av) av = await sbRpc('obter_avaliacao_para_fluxo', { p_avaliacao_id: id });
  if (!av) {
    showToast('Essa avaliação não está disponível — o ciclo pode estar fora do período de vigência.');
    return;
  }
  goTo('screen-avaliacao');
  const [notas, plano, cargoComp] = await Promise.all([
    sbFetch('/avaliacao_notas?avaliacao_id=eq.' + id),
    sbFetch('/avaliacao_plano_desenvolvimento?avaliacao_id=eq.' + id + '&order=ordem.asc'),
    av.colaborador?.cargo_id
      ? sbFetch('/cargo_competencias?cargo_id=eq.' + av.colaborador.cargo_id + '&select=competencia:competencia_id(id,nome,tipo,definicao)')
      : Promise.resolve([]),
  ]);
  av.notas = notas || [];
  av.plano = plano || [];
  av.competenciasCargo = (cargoComp || []).map((cc) => cc.competencia);
  G.avaliacaoAtual = av;
  document.getElementById('screen-avaliacao').classList.toggle(
    'avaliacao-colaborador-mobile',
    meuPapelNaAvaliacao(av) === 'colaborador' && av.status === 'aguardando_autoavaliacao'
  );
  const ciclo = av.ciclo || (await sbFetch('/ciclos_avaliacao?id=eq.' + av.ciclo_id + '&select=nome'))?.[0];
  av.ciclo = ciclo;
  G.etapaAtiva = ETAPAS.find((e) => e.n === av.etapa_atual)?.id || etapaInicialDisponivel(av);
  document.getElementById('avaliacao-titulo').textContent = `Avaliação de ${av.colaborador?.nome || ''} — ${av.ciclo?.nome || ''}`;
  document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
  renderBotoesTransicao();
  renderEtapaAtiva();
}

function renderBotoesTransicao() {
  const av = G.avaliacaoAtual;
  const papel = meuPapelNaAvaliacao(av);
  const el = document.getElementById('avaliacao-transicao');
  if (av.status === 'rascunho' && G.etapaAtiva === 'feedback_gestor' && (papel === 'gestor' || papel === 'rh')) {
    el.innerHTML = '<button class="btn-primary" onclick="confirmarTransicaoFase(\'fase_1\')">Enviar Fase 1 ao colaborador</button>';
  } else if (av.status === 'aguardando_autoavaliacao' && G.etapaAtiva === 'feedback_colaborador' && (papel === 'colaborador' || papel === 'rh')) {
    el.innerHTML = '<button class="btn-primary" onclick="confirmarTransicaoFase(\'fase_2\')">Devolver ao gestor</button>';
  } else {
    el.innerHTML = '';
  }
}

function valoresIguais(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mensagemErroAvaliacao(erro, padrao) {
  const bruto = String(erro?.message || '');
  try {
    const detalhe = JSON.parse(bruto);
    return detalhe.message || detalhe.error || detalhe.details || padrao;
  } catch {
    return bruto || padrao;
  }
}

function mesclarPatchAvaliacao(base, remoto, patch) {
  const resultado = { ...patch };

  if (patch.dados) {
    const dadosMesclados = { ...(remoto.dados || {}) };
    const chavesAlteradas = Object.keys(patch.dados).filter(
      (chave) => !valoresIguais(patch.dados[chave], base.dados?.[chave])
    );
    for (const chave of chavesAlteradas) {
      if (
        !valoresIguais(remoto.dados?.[chave], base.dados?.[chave])
        && !valoresIguais(remoto.dados?.[chave], patch.dados[chave])
      ) return null;
      dadosMesclados[chave] = patch.dados[chave];
    }
    resultado.dados = dadosMesclados;
  }

  for (const [campo, valor] of Object.entries(patch)) {
    if (campo === 'dados') continue;
    if (!valoresIguais(remoto[campo], base[campo]) && !valoresIguais(remoto[campo], valor)) return null;
    resultado[campo] = valor;
  }

  return resultado;
}

let _filaAtualizacaoAvaliacao = Promise.resolve();

function atualizarAvaliacao(patch) {
  const baseAoSolicitar = JSON.parse(JSON.stringify(G.avaliacaoAtual));
  const tarefa = _filaAtualizacaoAvaliacao
    .catch(() => {})
    .then(() => {
      let patchSeguro = patch;
      if (Number(G.avaliacaoAtual.versao) !== Number(baseAoSolicitar.versao)) {
        patchSeguro = mesclarPatchAvaliacao(baseAoSolicitar, G.avaliacaoAtual, patch);
        if (!patchSeguro) {
          showToast('Conflito: outra gravação local alterou esta mesma etapa. Revise antes de salvar novamente.');
          throw new Error('Conflito de edição concorrente.');
        }
      }
      return atualizarAvaliacaoComConcorrencia(patchSeguro);
    });
  _filaAtualizacaoAvaliacao = tarefa;
  return tarefa;
}

async function atualizarAvaliacaoComConcorrencia(patch) {
  const av = G.avaliacaoAtual;
  let patchAtual = patch;

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const versaoEsperada = Number(av.versao) || 1;
    const salvo = await sbFetch('/avaliacoes?id=eq.' + av.id + '&versao=eq.' + versaoEsperada, {
      method: 'PATCH',
      body: JSON.stringify(patchAtual),
    });

    if (salvo?.length) {
      Object.assign(av, salvo[0]);
      return salvo[0];
    }

    const rows = await sbFetch('/avaliacoes?id=eq.' + av.id + '&select=*');
    const remoto = rows?.[0];
    if (!remoto) throw new Error('A avaliação não está mais disponível.');

    const patchMesclado = mesclarPatchAvaliacao(av, remoto, patchAtual);
    Object.assign(av, remoto);
    if (!patchMesclado) {
      showToast('Conflito: outra sessão alterou esta mesma etapa. Seus dados continuam na tela; revise antes de salvar novamente.');
      throw new Error('Conflito de edição concorrente.');
    }
    patchAtual = patchMesclado;
  }

  showToast('Não foi possível salvar com segurança após várias alterações simultâneas.');
  throw new Error('Concorrência excessiva ao salvar a avaliação.');
}

async function liberarParaAutoavaliacao() {
  try {
    await atualizarAvaliacao({ status: 'aguardando_autoavaliacao', liberado_autoavaliacao_em: new Date().toISOString(), etapa_atual: 4 });
    document.getElementById('avaliacao-status').textContent = statusLabel(G.avaliacaoAtual.status);
    renderBotoesTransicao();
    renderEtapaAtiva();
    dispararEmailFluxo('fase_1_enviada');
    showToast('Liberado para autoavaliação do colaborador.');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível liberar a autoavaliação.');
  }
}

async function enviarParaAlinhamento() {
  try {
    await atualizarAvaliacao({ status: 'aguardando_alinhamento', alinhamento_em: new Date().toISOString(), etapa_atual: 6 });
    document.getElementById('avaliacao-status').textContent = statusLabel(G.avaliacaoAtual.status);
    renderBotoesTransicao();
    renderEtapaAtiva();
    dispararEmailFluxo('fase_2_devolvida');
    showToast('Enviado para alinhamento.');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível enviar para alinhamento.');
  }
}

function renderNavEtapas() {
  const el = document.getElementById('etapas-nav');
  const permitidas = etapasDisponiveis(G.avaliacaoAtual);
  if (!permitidas.includes(G.etapaAtiva)) G.etapaAtiva = permitidas[0];
  el.innerHTML = ETAPAS.filter((e) => permitidas.includes(e.id)).map(
    (e) => `<button class="etapa-btn ${G.etapaAtiva === e.id ? 'active' : ''}" onclick="irParaEtapa('${e.id}')">${e.n}. ${escHtml(e.label)}</button>`
  ).join('');
}

function irParaEtapa(id) {
  if (!etapasDisponiveis(G.avaliacaoAtual).includes(id)) return;
  G.etapaAtiva = id;
  renderEtapaAtiva();
}

function etapasDisponiveis(av) {
  if (av.status === 'concluida') return ETAPAS.map((e) => e.id);
  if (av.status === 'rascunho') return meuPapelNaAvaliacao(av) === 'gestor' || meuPapelNaAvaliacao(av) === 'rh' ? ['resultados', 'competencias', 'feedback_gestor'] : [];
  if (av.status === 'aguardando_autoavaliacao') return meuPapelNaAvaliacao(av) === 'colaborador' ? ['autoavaliacao', 'feedback_colaborador'] : [];
  return ['plano_desenvolvimento', 'resumo', 'parecer_final'];
}
function etapaInicialDisponivel(av) { return etapasDisponiveis(av)[0] || 'resultados'; }
function proximaEtapaAtual() {
  const etapas = etapasDisponiveis(G.avaliacaoAtual); const i = etapas.indexOf(G.etapaAtiva);
  return etapas[i + 1] || null;
}
async function salvarEtapaEAvancar(patch = {}) {
  await atualizarAvaliacao({ ...patch, etapa_atual: ETAPAS.find((e) => e.id === (proximaEtapaAtual() || G.etapaAtiva)).n });
  const proxima = proximaEtapaAtual();
  if (proxima) { G.etapaAtiva = proxima; renderEtapaAtiva(); return; }
  confirmarTransicaoFase(G.avaliacaoAtual.status === 'rascunho' ? 'fase_1' : 'fase_2');
}
function confirmarTransicaoFase(tipo) {
  const dados = tipo === 'fase_1'
    ? ['Enviar avaliação ao colaborador?', 'Após o envio, as etapas da Fase 1 ficarão bloqueadas para edição.', liberarParaAutoavaliacao]
    : tipo === 'fase_2'
      ? ['Devolver avaliação ao gestor?', 'Após o envio, as respostas da Fase 2 ficarão bloqueadas para edição.', enviarParaAlinhamento]
      : ['Concluir avaliação?', 'Os dois pareceres foram salvos e a avaliação ficará bloqueada.', concluirAvaliacaoAgora];
  const modal = document.getElementById('modal-confirmar-fluxo');
  document.getElementById('confirmar-fluxo-titulo').textContent = dados[0];
  document.getElementById('confirmar-fluxo-texto').textContent = dados[1];
  modal._acaoConfirmada = dados[2]; modal.classList.add('open');
}
function fecharModalConfirmarFluxo() { document.getElementById('modal-confirmar-fluxo').classList.remove('open'); }
async function executarConfirmacaoFluxo() { const modal = document.getElementById('modal-confirmar-fluxo'); fecharModalConfirmarFluxo(); await modal._acaoConfirmada?.(); }
async function dispararEmailFluxo(evento) { try { await sbInvokeFunction('notificar-fluxo', { avaliacao_id: G.avaliacaoAtual.id, evento }); } catch { showToast('Notificação criada; não foi possível enviar o e-mail.'); } }

// Cada módulo de etapa (etapa-texto, etapa-competencias, etapa-plano, etapa-parecer)
// expõe uma função render* própria; este dispatcher só decide qual chamar.
function renderEtapaAtiva() {
  renderNavEtapas();
  renderBotoesTransicao();
  const id = G.etapaAtiva;
  if (!ETAPAS.some((etapa) => etapa.id === id)) {
    document.getElementById('etapa-conteudo').innerHTML = '<p class="empty">Esta etapa não está disponível para o seu perfil no momento.</p>';
    return;
  }
  if (id === 'competencias') renderEtapaCompetencias();
  else if (id === 'plano_desenvolvimento') renderEtapaPlano();
  else if (id === 'parecer_final') renderEtapaParecer();
  else renderEtapaTexto(id);
}
