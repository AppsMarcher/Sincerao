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
  goTo('screen-avaliacao');
  const rows = await sbFetch(
    '/avaliacoes?id=eq.' + id + '&select=*,colaborador:colaborador_id(id,nome,cargo_id),gestor:gestor_id(id,nome),ciclo:ciclo_id(nome)'
  );
  const av = rows[0];
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

async function atualizarAvaliacao(patch) {
  const av = G.avaliacaoAtual;
  await sbFetch('/avaliacoes?id=eq.' + av.id, { method: 'PATCH', body: JSON.stringify(patch) });
  Object.assign(av, patch);
}

async function liberarParaAutoavaliacao() {
  await atualizarAvaliacao({ status: 'aguardando_autoavaliacao', liberado_autoavaliacao_em: new Date().toISOString(), etapa_atual: 4 });
  document.getElementById('avaliacao-status').textContent = statusLabel(G.avaliacaoAtual.status);
  renderBotoesTransicao();
  renderEtapaAtiva();
  showToast('Liberado para autoavaliação do colaborador.');
}

async function enviarParaAlinhamento() {
  await atualizarAvaliacao({ status: 'aguardando_alinhamento', alinhamento_em: new Date().toISOString(), etapa_atual: 6 });
  document.getElementById('avaliacao-status').textContent = statusLabel(G.avaliacaoAtual.status);
  renderBotoesTransicao();
  renderEtapaAtiva();
  showToast('Enviado para alinhamento.');
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
