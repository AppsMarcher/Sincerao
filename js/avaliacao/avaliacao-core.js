// avaliacao/avaliacao-core.js — abertura da avaliação, permissões por etapa, navegação do wizard e transições de status

function meuPapelNaAvaliacao(av) {
  // Participação direta (gestor/colaborador DESTA avaliação) tem prioridade
  // sobre o papel de RH/admin do perfil -- alguém de RH que é gestor ou
  // colaborador na própria avaliação deve seguir as regras de gestor/colaborador
  // dela, não o bypass geral de RH (senão RH acaba conseguindo editar/pular
  // etapas na própria avaliação, ou ficar sem nenhuma etapa liberada quando é
  // a colaboradora e a tela cai no fallback de "papel rh" sem etapas).
  if (av.gestor_id === G.perfil.id) return 'gestor';
  if (av.colaborador_id === G.perfil.id) return 'colaborador';
  if (ehRhOuAdmin()) return 'rh';
  return null;
}

function podeEditarEtapa(av, etapaId) {
  const papel = meuPapelNaAvaliacao(av);
  const status = av.status;
  // RH/admin edita nas mesmas fases que o gestor (rascunho e alinhamento) —
  // nunca numa avaliação concluída só por ter o papel de RH/admin.
  if (['resultados', 'competencias', 'feedback_gestor'].includes(etapaId)) {
    return (papel === 'gestor' || papel === 'rh') && status === 'rascunho';
  }
  if (etapaId === 'autoavaliacao') {
    return papel === 'colaborador' && status === 'aguardando_autoavaliacao';
  }
  if (etapaId === 'resumo') {
    return (papel === 'gestor' || papel === 'rh') && status === 'aguardando_alinhamento';
  }
  return false;
}

async function abrirAvaliacao(id) {
  let rows = await sbFetch(
    '/avaliacoes?id=eq.' + id + '&select=*,colaborador:colaborador_id(id,nome,email,cargo_id),gestor:gestor_id(id,nome,email),ciclo:ciclo_id(nome)'
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
    showToast('Autoavaliação já enviada. Aguarde o consenso do gestor.');
    return;
  }
  goTo('screen-avaliacao');
  const [notas, cargoComp] = await Promise.all([
    sbFetch('/avaliacao_notas?avaliacao_id=eq.' + id),
    av.colaborador?.cargo_id
      ? sbFetch('/cargo_competencias?cargo_id=eq.' + av.colaborador.cargo_id + '&select=competencia:competencia_id(id,nome,tipo,definicao)')
      : Promise.resolve([]),
  ]);
  av.notas = notas || [];
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
  // Cada fase em digitação (rascunho/gestor, aguardando_autoavaliacao/colaborador,
  // aguardando_alinhamento/consenso) abre na primeira etapa DELA, não na última.
  // aguardando_alinhamento fixa em 'resumo' (label "Plano de Desenvolvimento")
  // mesmo quando reaberta mostra as 6 etapas pra contexto (etapasDisponiveis()[0]
  // viraria 'resultados', que é só leitura nesse caso -- a primeira etapa
  // realmente editável da fase 3 continua sendo essa). Fora essas fases (ex:
  // concluida, só consulta), mantém o comportamento de abrir na última etapa disponível.
  const ETAPA_INICIAL_POR_FASE = {
    rascunho: 'resultados',
    aguardando_autoavaliacao: 'autoavaliacao',
    aguardando_alinhamento: 'resumo',
  };
  // Só arquivada (concluida + as duas ciências) abre na capa -- concluida sem
  // ciência de alguém ainda cai direto no Parecer Final, onde a ciência é
  // declarada, igual sempre funcionou.
  G.etapaAtiva = avaliacaoArquivada(av) ? 'capa' : ETAPA_INICIAL_POR_FASE[av.status] || etapaFinalDisponivel(av);
  document.getElementById('avaliacao-titulo').textContent = `Avaliação de ${av.colaborador?.nome || ''} — ${av.ciclo?.nome || ''}`;
  document.getElementById('avaliacao-status').textContent = statusLabel(av.status);
  document.getElementById('avaliacao-exportar').classList.remove('open');
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

const RELATORIO_LOGO_URL = 'assets/logo-b.png';

function relatorioCorNota(nota) {
  const v = Number(nota);
  if (!Number.isFinite(v)) return '#9a95a0';
  if (v >= 4) return '#16a34a';
  if (v === 3) return '#5a0048';
  if (v === 2) return '#d97706';
  return '#dc2626';
}
function relatorioCorClassificacao(label) {
  if (label === 'Excelente' || label === 'Acima das expectativas') return '#16a34a';
  if (label === 'Atende às expectativas') return '#5a0048';
  if (label === 'Em desenvolvimento') return '#d97706';
  if (label === 'Necessita desenvolvimento imediato') return '#dc2626';
  return '#5a0048';
}

const RELATORIO_ESTILO = `
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box}
  body{margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;line-height:1.55;color:#2a2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pagina+.pagina{break-before:page;page-break-before:always}
  h1,h2,h3{font-family:'Space Grotesk','DM Sans',Arial,sans-serif;margin:0}
  p{margin:0 0 8px}

  .capa{min-height:248mm;border-radius:20px;background:#5a0048;color:#fff;padding:38px 34px;display:flex;flex-direction:column}
  .capa-topo{display:flex;justify-content:space-between;align-items:center}
  .capa-topo img{height:26px}
  .capa-topo span{font-size:9.5px;color:rgba(255,255,255,.65)}
  .capa-meio{margin:auto 0;padding:40px 0}
  .capa-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ff8fd6;margin-bottom:14px}
  .capa h1{font-size:38px;margin-bottom:10px}
  .capa-sub{font-size:13px;color:rgba(255,255,255,.75)}
  .capa-stats{display:flex;gap:14px;margin-top:auto}
  .capa-stats .stat{flex:1;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:16px 18px}
  .capa-stats .stat .label{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.65);font-weight:700;margin-bottom:8px}
  .capa-stats .stat .value{font-size:22px;font-weight:700;font-family:'Space Grotesk'}

  .banda{background:#5a0048;color:#fff;border-radius:16px;padding:20px 24px;margin-bottom:20px}
  .banda-topo{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .banda-topo img{height:20px}
  .etapa-pill{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.16);padding:5px 12px;border-radius:100px}
  .banda h1{font-size:21px;margin-bottom:10px}
  .banda .meta{display:flex;gap:20px;flex-wrap:wrap;font-size:10px;color:rgba(255,255,255,.78)}
  .banda .meta strong{color:#fff}

  .pergunta{border-left:3px solid #5a0048;background:#faf7fa;border-radius:0 10px 10px 0;padding:10px 14px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
  .pergunta h3{font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#5a0048;font-weight:700;margin-bottom:4px}
  .pergunta p{margin:0;color:#332e37}
  .vazio{color:#8a8390;font-style:italic}

  table{width:100%;border-collapse:separate;border-spacing:0;margin:4px 0 20px;border:1px solid #e6e0e8;border-radius:10px;overflow:hidden}
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  th{background:#5a0048;color:#fff;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;padding:9px 10px;font-weight:700}
  td{padding:9px 10px;border-top:1px solid #ede8ee;vertical-align:top}
  tbody tr:nth-child(even) td{background:#faf7fa}
  .nota-badge{display:inline-block;min-width:20px;text-align:center;padding:2px 9px;border-radius:100px;font-weight:700;color:#fff;font-size:10.5px}

  h2{font-size:16px;color:#5a0048;margin:24px 0 10px}

  .stats-final{display:flex;gap:12px;margin:12px 0 22px}
  .stats-final .stat{flex:1;background:#faf7fa;border:1px solid #e6e0e8;border-radius:12px;padding:14px 16px;text-align:center}
  .stats-final .stat .label{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#8a8390;font-weight:700;margin-bottom:6px}
  .stats-final .stat .value{font-size:21px;font-weight:700;font-family:'Space Grotesk';color:#5a0048}

  .rodape-pagina{margin-top:24px;padding-top:10px;border-top:1px solid #ede8ee;font-size:8.5px;color:#a49da8;text-align:center}
`;

function imprimirAvaliacao() {
  const av = G.avaliacaoAtual;
  fecharExportarAvaliacao();
  if (!av) return;

  const dados = av.dados || {};
  const texto = (etapaId) => (CAMPOS_ETAPA[etapaId] || []).map(([chave, pergunta]) => {
    const resposta = dados[etapaId]?.[chave];
    return resposta ? `<div class="pergunta"><h3>${escHtml(pergunta)}</h3><p>${escHtml(resposta).replace(/\n/g, '<br>')}</p></div>` : '';
  }).join('') || '<p class="vazio">Não há respostas registradas nesta etapa.</p>';
  const nomeCompetencia = (nota) => nota.competencia?.nome || av.competenciasCargo?.find((competencia) => competencia.id === nota.competencia_id)?.nome || '—';
  const notas = (av.notas || []).length
    ? `<table><thead><tr><th>Competência</th><th>Nota</th><th>Comentários</th></tr></thead><tbody>${av.notas.map((nota) => `<tr><td>${escHtml(nomeCompetencia(nota))}</td><td><span class="nota-badge" style="background:${relatorioCorNota(nota.nota)}">${escHtml(nota.nota ?? '—')}</span></td><td>${escHtml(nota.comentario || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Não há competências avaliadas.</p>';
  const parecer = dados.parecer?.parecer_consenso || [dados.parecer?.parecer_gestor, dados.parecer?.parecer_colaborador].filter(Boolean).join('\n\n') || 'Não informado.';
  const dataHora = (data) => data ? new Date(data).toLocaleString('pt-BR') : 'Pendente';
  const ciencia = `<h2>Ciência</h2><table><thead><tr><th>Participante</th><th>E-mail</th><th>Data e hora</th></tr></thead><tbody>${[
    ['Colaborador', av.colaborador?.nome, av.colaborador?.email, av.ciencia_colaborador_em],
    ['Gestor', av.gestor?.nome, av.gestor?.email, av.ciencia_gestor_em],
  ].map(([papel, nome, email, data]) => `<tr><td><strong>${escHtml(papel)}</strong><br>${escHtml(nome || 'Não identificado')}</td><td>${escHtml(email || '—')}</td><td>${escHtml(dataHora(data))}</td></tr>`).join('')}</tbody></table>`;
  const meta = `<div class="meta"><span>Colaborador <strong>${escHtml(av.colaborador?.nome || '—')}</strong></span><span>Gestor <strong>${escHtml(av.gestor?.nome || '—')}</strong></span><span>Ciclo <strong>${escHtml(av.ciclo?.nome || '—')}</strong></span></div>`;
  const pagina = (numero, titulo, conteudo) => `<article class="pagina"><header class="banda"><div class="banda-topo"><img src="${RELATORIO_LOGO_URL}" alt="Sincerão"><span class="etapa-pill">Etapa ${numero} de 6</span></div><h1>${escHtml(titulo)}</h1>${meta}</header>${conteudo}<div class="rodape-pagina">Sincerão · Avaliação de Desempenho · Documento confidencial</div></article>`;
  const paginas = [
    pagina(1, 'Resultados do período', texto('resultados')),
    pagina(2, 'Avaliação das competências', notas),
    pagina(3, 'Feedback do gestor', texto('feedback_gestor')),
    pagina(4, 'Autoavaliação', texto('autoavaliacao')),
    pagina(5, 'Plano de desenvolvimento', texto('resumo')),
    pagina(6, 'Parecer final', `<div class="pergunta"><h3>Parecer do gestor e colaborador</h3><p>${escHtml(parecer).replace(/\n/g, '<br>')}</p></div><h2>Resultado final</h2><div class="stats-final"><div class="stat"><div class="label">Pontuação geral</div><div class="value">${escHtml(av.pontuacao_geral ?? '—')}/5</div></div><div class="stat"><div class="label">Percentual</div><div class="value">${escHtml(av.percentual ?? '—')}%</div></div><div class="stat"><div class="label">Classificação</div><div class="value" style="color:${relatorioCorClassificacao(av.classificacao)}">${escHtml(av.classificacao || '—')}</div></div></div>${ciencia}`),
  ];
  const geradoEm = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const capa = `<article class="pagina"><div class="capa"><div class="capa-topo"><img src="${RELATORIO_LOGO_URL}" alt="Sincerão"><span>Gerado em ${escHtml(geradoEm)}</span></div><div class="capa-meio"><div class="capa-eyebrow">Relatório de Avaliação de Desempenho</div><h1>${escHtml(av.colaborador?.nome || '—')}</h1><div class="capa-sub">Gestor: ${escHtml(av.gestor?.nome || '—')} &nbsp;·&nbsp; Ciclo: ${escHtml(av.ciclo?.nome || '—')}</div></div><div class="capa-stats"><div class="stat"><div class="label">Pontuação geral</div><div class="value">${escHtml(av.pontuacao_geral ?? '—')}/5</div></div><div class="stat"><div class="label">Percentual</div><div class="value">${escHtml(av.percentual ?? '—')}%</div></div><div class="stat"><div class="label">Classificação</div><div class="value">${escHtml(av.classificacao || '—')}</div></div></div></div></article>`;
  const janela = window.open('', '_blank');
  if (!janela) { showToast('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.'); return; }
  const baseHref = new URL('.', window.location.href).href;
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Avaliação de desempenho</title><base href="${baseHref}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap"><style>${RELATORIO_ESTILO}</style></head><body>${capa}${paginas.join('')}</body></html>`);
  janela.document.close();
  janela.addEventListener('load', () => { janela.focus(); janela.print(); });
}

function enviarAvaliacaoPorEmail() {
  const av = G.avaliacaoAtual;
  fecharExportarAvaliacao();
  if (!av || av.status !== 'concluida' || !['gestor', 'rh'].includes(meuPapelNaAvaliacao(av))) {
    showToast('Apenas avaliações concluídas podem ser enviadas.');
    return;
  }
  const modal = document.getElementById('modal-confirmar-fluxo');
  document.getElementById('confirmar-fluxo-titulo').textContent = 'Enviar avaliação por e-mail?';
  document.getElementById('confirmar-fluxo-texto').textContent = `${av.colaborador?.nome || 'O colaborador'} e ${av.gestor?.nome || 'o gestor'} receberão o PDF da avaliação concluída por e-mail.`;
  modal._acaoConfirmada = enviarAvaliacaoPorEmailConfirmado;
  modal.classList.add('open');
}

async function enviarAvaliacaoPorEmailConfirmado() {
  const av = G.avaliacaoAtual;
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

// Chamado direto do card do dashboard (sem precisar abrir a avaliação) e da
// capa da avaliação concluída. Usa fetch cru em vez de sbInvokeFunction
// porque a resposta aqui é o PDF binário, não JSON.
async function baixarPdfAvaliacao(avaliacaoId) {
  try {
    const token = await getSupabaseAccessToken();
    const r = await fetch(SUPABASE_URL + '/functions/v1/enviar-avaliacao', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ avaliacao_id: avaliacaoId, modo: 'download' }),
    });
    if (!r.ok) {
      let mensagem = 'Não foi possível gerar o PDF.';
      try { mensagem = (JSON.parse(await r.text()))?.error || mensagem; } catch {}
      throw new Error(mensagem);
    }
    const blob = await r.blob();
    const nomeArquivo = /filename="?([^"]+)"?/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'avaliacao.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast(err.message || 'Não foi possível gerar o PDF.');
  }
}

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

// Avaliação concluída E com as duas ciências (colaborador/gestor) já dadas --
// só nesse ponto ela "arquiva" e abre na capa em vez de cair direto no
// Parecer Final. Concluída sem alguma ciência continua caindo lá, que é onde
// a ciência é declarada (ver renderCiencia em etapa-parecer.js).
function avaliacaoArquivada(av) {
  return av.status === 'concluida' && !!av.ciencia_colaborador_em && !!av.ciencia_gestor_em;
}

function renderNavEtapas() {
  const el = document.getElementById('etapas-nav');
  if (G.etapaAtiva === 'capa') { el.innerHTML = ''; return; }
  const av = G.avaliacaoAtual;
  const permitidas = etapasDisponiveis(av);
  if (!permitidas.includes(G.etapaAtiva)) G.etapaAtiva = permitidas[0];
  const limite = maiorEtapaAlcancavel(av);
  const voltarCapa = avaliacaoArquivada(av)
    ? '<button class="btn-link etapa-btn-capa" onclick="irParaCapa()">← Capa</button>'
    : '';
  el.innerHTML = voltarCapa + ETAPAS.filter((e) => permitidas.includes(e.id)).map((e) => {
    const travada = permitidas.indexOf(e.id) > limite;
    return `<button class="etapa-btn ${G.etapaAtiva === e.id ? 'active' : ''}" ${
      travada ? 'disabled title="Grave a etapa anterior antes de avançar"' : `onclick="irParaEtapa('${e.id}')"`
    }>${e.n}. ${escHtml(e.label)}</button>`;
  }).join('');
}

function irParaEtapa(id) {
  const permitidas = etapasDisponiveis(G.avaliacaoAtual);
  const idx = permitidas.indexOf(id);
  if (idx === -1 || idx > maiorEtapaAlcancavel(G.avaliacaoAtual)) return;
  G.etapaAtiva = id;
  renderEtapaAtiva();
}

function irParaCapa() {
  G.etapaAtiva = 'capa';
  renderEtapaAtiva();
}

function entrarDetalheAvaliacao() {
  G.etapaAtiva = 'resultados';
  renderEtapaAtiva();
}

function renderCapaAvaliacao() {
  const av = G.avaliacaoAtual;
  const dataConclusao = av.concluida_em
    ? new Date(av.concluida_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—';
  document.getElementById('etapa-conteudo').innerHTML = `
    <section class="card capa-avaliacao">
      <h3>Avaliação concluída</h3>
      <p class="muted">Colaborador e gestor já deram ciência do consenso. Os 6 passos continuam disponíveis pra consulta.</p>
      <dl class="dados-lista">
        <dt>Ciclo</dt><dd>${escHtml(av.ciclo?.nome || '—')}</dd>
        <dt>Colaborador</dt><dd>${escHtml(av.colaborador?.nome || '—')}</dd>
        <dt>Gestor</dt><dd>${escHtml(av.gestor?.nome || '—')}</dd>
        <dt>Concluída em</dt><dd>${dataConclusao}</dd>
      </dl>
      ${renderResultadoFinal(av)}
      <div class="etapa-acoes">
        <button class="btn-link" onclick="baixarPdfAvaliacao('${av.id}')">Baixar PDF</button>
        <button class="btn-primary" onclick="entrarDetalheAvaliacao()">Ver avaliação completa</button>
      </div>
    </section>
  `;
}

// Não avança pra próxima etapa da fase sem a anterior estar gravada no banco.
// Só considera etapas que são a vez de quem está vendo agora (podeEditarEtapa)
// -- etapas só de leitura (ex: histórico de uma avaliação reaberta) nunca
// travam nada, já que não há o que gravar nelas.
function etapaEstaGravada(av, etapaId) {
  if (etapaId === 'competencias') {
    const competencias = av.competenciasCargo || [];
    if (!competencias.length) return true;
    return competencias.every((c) => {
      const nota = (av.notas || []).find((n) => n.competencia_id === c.id);
      return !!nota?.nota && respostaValida(nota.comentario);
    });
  }
  const campos = CAMPOS_ETAPA[etapaId];
  if (!campos) return true;
  return campos.every(([campo]) => respostaValida(av.dados?.[etapaId]?.[campo]));
}
function maiorEtapaAlcancavel(av) {
  const etapas = etapasDisponiveis(av);
  for (let i = 0; i < etapas.length; i++) {
    if (podeEditarEtapa(av, etapas[i]) && !etapaEstaGravada(av, etapas[i])) return i;
  }
  return etapas.length;
}

function etapasDisponiveis(av) {
  if (av.status === 'concluida') return ETAPAS.map((e) => e.id);
  if (av.status === 'rascunho') return meuPapelNaAvaliacao(av) === 'gestor' || meuPapelNaAvaliacao(av) === 'rh' ? ['resultados', 'competencias', 'feedback_gestor'] : [];
  if (av.status === 'aguardando_autoavaliacao') return meuPapelNaAvaliacao(av) === 'colaborador' ? ['autoavaliacao'] : [];
  if (av.status === 'aguardando_alinhamento') {
    if (!['gestor', 'rh'].includes(meuPapelNaAvaliacao(av))) return [];
    // Avaliação reaberta (já foi concluída uma vez): continua mostrando as 6
    // etapas pra revisão, mesmo com só Plano de Desenvolvimento/Parecer editáveis.
    return av.dados?.reabertura ? ETAPAS.map((e) => e.id) : ['resumo', 'parecer_final'];
  }
  return ['resumo', 'parecer_final'];
}
// Ao abrir uma avaliação, sempre cai na última etapa disponível (não na
// etapa_atual salva) — etapa_atual só avança pelo fluxo "avançar" sequencial e
// fica desatualizada quando a navegação é feita pelas abas.
function etapaFinalDisponivel(av) { const etapas = etapasDisponiveis(av); return etapas[etapas.length - 1] || 'resultados'; }
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

// Cada módulo de etapa (etapa-texto, etapa-competencias, etapa-parecer)
// expõe uma função render* própria; este dispatcher só decide qual chamar.
// O botão Exportar só faz sentido na última etapa (Parecer Final), com a
// avaliação concluída — nas demais abas fica escondido.
function atualizarExportarAvaliacao() {
  const av = G.avaliacaoAtual;
  const exportar = document.getElementById('avaliacao-exportar');
  exportar.style.display =
    av.status === 'concluida' && G.etapaAtiva === 'parecer_final' && ['gestor', 'rh'].includes(meuPapelNaAvaliacao(av))
      ? ''
      : 'none';
}

function renderEtapaAtiva() {
  renderNavEtapas();
  renderBotoesTransicao();
  atualizarExportarAvaliacao();
  const id = G.etapaAtiva;
  if (id === 'capa') { renderCapaAvaliacao(); return; }
  if (!ETAPAS.some((etapa) => etapa.id === id)) {
    document.getElementById('etapa-conteudo').innerHTML = '<p class="empty">Esta etapa não está disponível para o seu perfil no momento.</p>';
    return;
  }
  if (id === 'competencias') renderEtapaCompetencias();
  else if (id === 'parecer_final') renderEtapaParecer();
  else renderEtapaTexto(id);
}
