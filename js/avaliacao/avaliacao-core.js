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
  const rows = await sbFetch(
    '/avaliacoes?id=eq.' + id + '&select=*,colaborador:colaborador_id(id,nome,cargo_id),gestor:gestor_id(id,nome),ciclo:ciclo_id(nome)'
  );
  const av = rows[0];
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
  G.etapaAtiva = 'resultados';
  document.getElementById('avaliacao-titulo').textContent = `Avaliação de ${av.colaborador?.nome || ''} — ${av.ciclo?.nome || ''}`;
  document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
  renderBotoesTransicao();
  renderEtapaAtiva();
}

function renderBotoesTransicao() {
  const av = G.avaliacaoAtual;
  const papel = meuPapelNaAvaliacao(av);
  const el = document.getElementById('avaliacao-transicao');
  if (av.status === 'rascunho' && (papel === 'gestor' || papel === 'rh')) {
    el.innerHTML = '<button class="btn-primary" onclick="liberarParaAutoavaliacao()">Liberar para autoavaliação</button>';
  } else if (av.status === 'aguardando_autoavaliacao' && (papel === 'colaborador' || papel === 'rh')) {
    el.innerHTML = '<button class="btn-primary" onclick="enviarParaAlinhamento()">Enviar para alinhamento</button>';
  } else {
    el.innerHTML = '';
  }
}

function valoresIguais(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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
    showToast('Enviado para alinhamento.');
  } catch (err) {
    if (!String(err?.message || '').includes('Conflito')) showToast('Não foi possível enviar para alinhamento.');
  }
}

function renderNavEtapas() {
  const el = document.getElementById('etapas-nav');
  el.innerHTML = ETAPAS.map(
    (e) => `<button class="etapa-btn ${G.etapaAtiva === e.id ? 'active' : ''}" onclick="irParaEtapa('${e.id}')">${e.n}. ${escHtml(e.label)}</button>`
  ).join('');
}

function irParaEtapa(id) {
  G.etapaAtiva = id;
  renderEtapaAtiva();
}

// Cada módulo de etapa (etapa-texto, etapa-competencias, etapa-plano, etapa-parecer)
// expõe uma função render* própria; este dispatcher só decide qual chamar.
function renderEtapaAtiva() {
  renderNavEtapas();
  const id = G.etapaAtiva;
  if (id === 'competencias') renderEtapaCompetencias();
  else if (id === 'plano_desenvolvimento') renderEtapaPlano();
  else if (id === 'parecer_final') renderEtapaParecer();
  else renderEtapaTexto(id);
}
