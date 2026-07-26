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
    return papel === 'gestor' && status === 'aguardando_alinhamento';
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
  if (av.status === 'aguardando_alinhamento' && av.colaborador_id === G.perfil.id && !ehRhOuAdmin()) {
    showToast('Sua autoavaliação já foi enviada. Aguarde o gestor concluir o consenso.');
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
    'avaliacao-mobile-prioritaria',
    // As fases 2 e 3 são preenchidas pelo colaborador e/ou pelo gestor e
    // precisam da mesma experiência de toque no celular.
    ['aguardando_autoavaliacao', 'aguardando_alinhamento'].includes(av.status)
  );
  const ciclo = av.ciclo || (await sbFetch('/ciclos_avaliacao?id=eq.' + av.ciclo_id + '&select=nome'))?.[0];
  av.ciclo = ciclo;
  G.etapaAtiva = ETAPAS.find((e) => e.n === av.etapa_atual)?.id || etapaInicialDisponivel(av);
  document.getElementById('avaliacao-titulo').textContent = `Avaliação de ${av.colaborador?.nome || ''} — ${av.ciclo?.nome || ''}`;
  document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
  const exportar = document.getElementById('avaliacao-exportar');
  exportar.style.display = av.status === 'concluida' && ['gestor', 'rh'].includes(meuPapelNaAvaliacao(av)) ? '' : 'none';
  exportar.classList.remove('open');
  renderBotoesTransicao();
  renderEtapaAtiva();
}

function fecharExportarAvaliacao() {
  const exportar = document.getElementById('avaliacao-exportar');
  exportar?.classList.remove('open');
  exportar?.querySelector('.avaliacao-exportar-toggle')?.setAttribute('aria-expanded', 'false');
}

function toggleExportarAvaliacao(evento) {
  evento.stopPropagation();
  const exportar = document.getElementById('avaliacao-exportar');
  const aberto = !exportar.classList.contains('open');
  exportar.classList.toggle('open', aberto);
  exportar.querySelector('.avaliacao-exportar-toggle')?.setAttribute('aria-expanded', String(aberto));
}

function imprimirAvaliacao() {
  const av = G.avaliacaoAtual;
  fecharExportarAvaliacao();
  if (!av) return;

  const dados = av.dados || {};
  const texto = (etapaId) => (CAMPOS_ETAPA[etapaId] || []).map(([chave, pergunta]) => {
    const resposta = dados[etapaId]?.[chave];
    return `<section><h3>${escHtml(pergunta)}</h3><p>${escHtml(resposta || 'Não informado.').replace(/\n/g, '<br>')}</p></section>`;
  }).join('') || '<p>Não há respostas registradas nesta etapa.</p>';
  const nomeCompetencia = (nota) => nota.competencia?.nome || av.competenciasCargo?.find((competencia) => competencia.id === nota.competencia_id)?.nome || '—';
  const notas = (av.notas || []).length
    ? `<table><thead><tr><th>Competência</th><th>Nota</th><th>Comentários</th></tr></thead><tbody>${av.notas.map((nota) => `<tr><td>${escHtml(nomeCompetencia(nota))}</td><td>${escHtml(nota.nota ?? '—')}</td><td>${escHtml(nota.comentario || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<p>Não há competências avaliadas.</p>';
  const plano = (av.plano || []).length
    ? `<table><thead><tr><th>Competência</th><th>Ação</th><th>Prazo</th><th>Responsável</th><th>Indicador de sucesso</th><th>Acompanhamento</th></tr></thead><tbody>${av.plano.map((linha) => `<tr><td>${escHtml(linha.competencia || '—')}</td><td>${escHtml(linha.acao || '—')}</td><td>${escHtml(linha.prazo || '—')}</td><td>${escHtml(linha.responsavel || '—')}</td><td>${escHtml(linha.indicador_sucesso || '—')}</td><td>${escHtml(linha.acompanhamento || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<p>Não há plano de desenvolvimento registrado.</p>';
  const parecer = dados.parecer?.parecer_consenso || [dados.parecer?.parecer_gestor, dados.parecer?.parecer_colaborador].filter(Boolean).join('\n\n') || 'Não informado.';
  const pagina = (numero, titulo, conteudo) => `<article class="pagina"><header><span>Etapa ${numero} de 8</span><h1>${escHtml(titulo)}</h1><p><strong>Colaborador:</strong> ${escHtml(av.colaborador?.nome || '—')} &nbsp;|&nbsp; <strong>Gestor:</strong> ${escHtml(av.gestor?.nome || '—')}<br><strong>Ciclo:</strong> ${escHtml(av.ciclo?.nome || '—')}</p></header>${conteudo}</article>`;
  const paginas = [
    pagina(1, 'Resultados do período', texto('resultados')),
    pagina(2, 'Avaliação das competências', notas),
    pagina(3, 'Feedback do gestor', texto('feedback_gestor')),
    pagina(4, 'Autoavaliação', texto('autoavaliacao')),
    pagina(5, 'Feedback do colaborador ao gestor', texto('feedback_colaborador')),
    pagina(6, 'Plano de desenvolvimento', plano),
    pagina(7, 'Resumo da avaliação', texto('resumo')),
    pagina(8, 'Parecer final', `<section><h3>Parecer do gestor e colaborador</h3><p>${escHtml(parecer).replace(/\n/g, '<br>')}</p></section><h2>Resultado final</h2><p><strong>Pontuação geral:</strong> ${escHtml(av.pontuacao_geral ?? '—')} / 5<br><strong>Percentual:</strong> ${escHtml(av.percentual ?? '—')}%<br><strong>Classificação:</strong> ${escHtml(av.classificacao || '—')}</p>`),
  ];
  const janela = window.open('', '_blank');
  if (!janela) { showToast('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.'); return; }
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Avaliação de desempenho</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font:11px/1.45 Arial,sans-serif;color:#25212a}.pagina+.pagina{break-before:page;page-break-before:always}header{border-bottom:3px solid #5a0048;padding-bottom:14px;margin-bottom:22px}header span{color:#755a70;font-size:10px;font-weight:bold;text-transform:uppercase}h1{margin:4px 0 5px;color:#5a0048;font-size:24px}h2{margin:26px 0 10px;color:#5a0048;font-size:17px}h3{margin:16px 0 4px;color:#5a0048;font-size:12px}p{margin:0 0 8px}table{width:100%;margin:10px 0 18px;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#5a0048;color:#fff;text-align:left}th,td{padding:7px;border:1px solid #ded7df;vertical-align:top}tr:nth-child(even){background:#faf7fa}section{break-inside:avoid}</style></head><body>${paginas.join('')}</body></html>`);
  janela.document.close();
  janela.addEventListener('load', () => { janela.focus(); janela.print(); });
}

async function enviarAvaliacaoPorEmail() {
  const av = G.avaliacaoAtual;
  fecharExportarAvaliacao();
  if (!av || av.status !== 'concluida' || !['gestor', 'rh'].includes(meuPapelNaAvaliacao(av))) {
    showToast('Apenas avaliações concluídas podem ser enviadas.');
    return;
  }
  if (!confirm(`Enviar a avaliação concluída para ${av.colaborador?.nome || 'o colaborador'} e ${av.gestor?.nome || 'o gestor'}? Eles receberão o PDF por e-mail.`)) return;
  try {
    await sbInvokeFunction('enviar-avaliacao', { avaliacao_id: av.id });
    showToast('Avaliação enviada por e-mail aos envolvidos.');
  } catch (e) {
    showToast(mensagemErroAvaliacao(e, 'Não foi possível enviar a avaliação por e-mail.'));
  }
}

document.addEventListener('click', (evento) => {
  if (!evento.target.closest('.avaliacao-exportar')) fecharExportarAvaliacao();
});

function renderBotoesTransicao() {
  const el = document.getElementById('avaliacao-transicao');
  el.innerHTML = '';
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
  const colaboradorEmAutoavaliacao = () =>
    av.colaborador_id === G.perfil.id && av.status === 'aguardando_autoavaliacao';

  async function carregarRemoto() {
    // Durante a autoavaliação, a linha original é deliberadamente invisível ao
    // colaborador para não expor anotações do gestor. A RPC devolve apenas os
    // campos seguros e também permite confirmar a versão após o PATCH.
    if (colaboradorEmAutoavaliacao()) {
      return sbRpc('obter_avaliacao_para_fluxo', { p_avaliacao_id: av.id });
    }
    const rows = await sbFetch('/avaliacoes?id=eq.' + av.id + '&select=*');
    return rows?.[0] || null;
  }

  // A policy de leitura não entrega a avaliação original ao colaborador na
  // Fase 2. A RPC faz a gravação e devolve somente os campos permitidos.
  if (colaboradorEmAutoavaliacao()) {
    const salvo = await sbRpc('salvar_autoavaliacao_para_fluxo', {
      p_avaliacao_id: av.id,
      p_versao: Number(av.versao) || 1,
      p_dados: patch.dados || av.dados || {},
      p_etapa_atual: patch.etapa_atual ?? av.etapa_atual,
      p_enviar_para_alinhamento: patch.status === 'aguardando_alinhamento',
      p_alinhamento_em: patch.alinhamento_em || null,
    });
    if (!salvo) throw new Error('Não foi possível salvar a autoavaliação.');
    Object.assign(av, salvo);
    return salvo;
  }

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

    const remoto = await carregarRemoto();
    if (!remoto) throw new Error('A avaliação não está mais disponível.');

    // O RLS não devolve representação da linha ao colaborador nesta fase,
    // mesmo quando o PATCH foi aceito. A versão maior confirma o salvamento.
    if (Number(remoto.versao) > versaoEsperada) {
      Object.assign(av, remoto);
      return remoto;
    }

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
  if (av.status === 'aguardando_alinhamento') {
    return ['gestor', 'rh'].includes(meuPapelNaAvaliacao(av))
      ? ['plano_desenvolvimento', 'resumo', 'parecer_final']
      : [];
  }
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
