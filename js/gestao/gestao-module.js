let _dadosGestao = null;
let _ordenacaoGestao = {};
let _ciclosGestao = [];
let _notificarGestoresTrigger = null;

async function abrirGestao() {
  if (!podeVerGestao()) { showToast('Acesso restrito à gestão.'); return; }
  goTo('screen-gestao');
  const ciclos = (await sbFetch('/ciclos_avaliacao?order=data_inicio.desc')) || [];
  _ciclosGestao = ciclos;
  const select = document.getElementById('gestao-ciclo');
  select.innerHTML = '<option value="">Todos os ciclos</option>' + ciclos.map((c) => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
  await carregarIndicadoresGestao();
}
async function carregarIndicadoresGestao() {
  const el = document.getElementById('gestao-conteudo'); el.innerHTML = '<p class="muted">Carregando indicadores…</p>';
  try { _dadosGestao = (await sbRpc('indicadores_gestao',{p_ciclo_id:document.getElementById('gestao-ciclo').value || null})) || {}; renderIndicadoresGestao(_dadosGestao); }
  catch { el.innerHTML = '<p class="empty">Não foi possível carregar os indicadores.</p>'; }
}

// Ordenação por coluna, mesmo padrão de ordenarColaboradores() (admin/colaboradores-module.js)
// -- só generalizado pra várias tabelas nesta tela, guardando o estado por
// tabela num único objeto em vez de uma variável por tabela.
function ordenarGestao(tabela, coluna) {
  const o = _ordenacaoGestao[tabela] || (_ordenacaoGestao[tabela] = { coluna: null, dir: 1 });
  if (o.coluna === coluna) o.dir *= -1; else { o.coluna = coluna; o.dir = 1; }
  if (_dadosGestao) renderIndicadoresGestao(_dadosGestao);
}
function setaOrdenacaoGestao(tabela, coluna) {
  const o = _ordenacaoGestao[tabela];
  return o?.coluna === coluna ? (o.dir === 1 ? ' ▲' : ' ▼') : '';
}
function ordenarListaGestao(tabela, lista, valorFn) {
  const o = _ordenacaoGestao[tabela];
  if (!o?.coluna) return lista;
  return [...lista].sort((a, b) => {
    const va = valorFn(a, o.coluna), vb = valorFn(b, o.coluna);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * o.dir;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR') * o.dir;
  });
}

// colunas: [chave, label][]. dados: array bruto (ordenado aqui dentro).
// valorFn(item, chave): valor usado tanto pra ordenar quanto já tipado
// (number pra comparação numérica, string pra alfabética). linhaFn(item): <tr>.
function tabelaGestao(tabela, colunas, dados, valorFn, linhaFn) {
  const lista = ordenarListaGestao(tabela, dados || [], valorFn);
  const cabecalho = colunas
    .map(([chave, label]) => `<th class="th-sort" onclick="ordenarGestao('${tabela}','${chave}')">${escHtml(label)}<span class="sort-ind">${setaOrdenacaoGestao(tabela, chave)}</span></th>`)
    .join('');
  const linhas = lista.map(linhaFn).join('');
  return `<div class="tabela-scroll"><table class="tabela"><thead><tr>${cabecalho}</tr></thead><tbody>${linhas || `<tr><td colspan="${colunas.length}">Sem dados para este filtro.</td></tr>`}</tbody></table></div>`;
}

function renderIndicadoresGestao(d) {
  const t=d.totais||{}, n=v=>v??'—';
  const cicloSelecionado = document.getElementById('gestao-ciclo').value;
  const botaoNotificar = `<button type="button" class="btn-primary btn-notificar-gestores" onclick="abrirModalNotificarGestores()"${cicloSelecionado ? '' : ' disabled title="Selecione um ciclo específico"'}><svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg> Notificar gestores</button>`;
  document.getElementById('gestao-conteudo').innerHTML=`<div class="gestao-kpis"><article><span>Avaliações</span><strong>${n(t.total)}</strong></article><article><span>Concluídas</span><strong>${n(t.concluidas)}</strong></article><article><span>Conclusão</span><strong>${t.total?Math.round((t.concluidas||0)/t.total*100):0}%</strong></article><article><span>Nota média</span><strong>${n(t.nota_media)}</strong></article></div><section class="card"><div class="gestao-secao-cabecalho"><h3>Resultados por gestor</h3>${botaoNotificar}</div>${tabelaGestao('gestor',[['gestor','Gestor'],['avaliacoes','Avaliações'],['concluidas','Concluídas'],['pendentes','Pendentes'],['progresso','Progresso'],['ultimo_aviso','Último aviso']],d.por_gestor||[],(x,c)=>c==='gestor'?x.gestor.toLowerCase():c==='avaliacoes'?x.total:c==='concluidas'?x.concluidas:c==='pendentes'?x.pendentes:c==='progresso'?(x.total?x.concluidas/x.total:0):(x.ultimo_aviso||''),x=>`<tr><td>${escHtml(x.gestor)}</td><td>${x.total}</td><td>${x.concluidas}</td><td>${x.pendentes??Math.max(0,x.total-x.concluidas)}</td><td>${x.total?Math.round(x.concluidas/x.total*100):0}%</td><td>${x.ultimo_aviso?formatarDataHoraNotificacao(x.ultimo_aviso):'—'}</td></tr>`)}</section><section class="card"><h3>Resultados por setor</h3>${tabelaGestao('setor',[['setor','Setor'],['avaliacoes','Avaliações'],['concluidas','Concluídas'],['nota_media','Nota média']],d.por_setor||[],(x,c)=>c==='setor'?x.setor.toLowerCase():c==='avaliacoes'?x.total:c==='concluidas'?x.concluidas:(x.nota_media??-1),x=>`<tr><td>${escHtml(x.setor)}</td><td>${x.total}</td><td>${x.concluidas}</td><td>${n(x.nota_media)}</td></tr>`)}</section><section class="card"><h3>Andamento do ciclo</h3>${tabelaGestao('status',[['fase','Fase'],['quantidade','Quantidade']],d.por_status||[],(x,c)=>c==='fase'?statusLabel(x.status).toLowerCase():x.quantidade,x=>`<tr><td>${escHtml(statusLabel(x.status))}</td><td>${x.quantidade}</td></tr>`)}</section><section class="card"><h3>Distribuição das classificações</h3>${tabelaGestao('classificacao',[['classificacao','Classificação'],['quantidade','Quantidade']],d.por_classificacao||[],(x,c)=>c==='classificacao'?x.classificacao.toLowerCase():x.quantidade,x=>`<tr><td>${escHtml(x.classificacao)}</td><td>${x.quantidade}</td></tr>`)}</section><section class="card"><h3>Prioridades de desenvolvimento</h3><p class="muted">Competências com menor nota média nas avaliações concluídas.</p>${tabelaGestao('competencias',[['competencia','Competência'],['nota_media','Nota média'],['avaliacoes','Avaliações']],d.competencias||[],(x,c)=>c==='competencia'?x.competencia.toLowerCase():c==='nota_media'?(x.nota_media??-1):x.avaliacoes,x=>`<tr><td>${escHtml(x.competencia)}</td><td>${n(x.nota_media)}</td><td>${x.avaliacoes}</td></tr>`)}</section>`;
}

function abrirModalNotificarGestores() {
  const cicloId = document.getElementById('gestao-ciclo').value;
  if (!cicloId) { showToast('Selecione um ciclo específico para notificar os gestores.'); return; }
  const gestores = (_dadosGestao?.por_gestor || []).filter((gestor) => Number(gestor.pendentes) > 0 && gestor.gestor_id);
  if (!gestores.length) { showToast('Este ciclo não possui gestores com avaliações pendentes.'); return; }
  const ciclo = _ciclosGestao.find((item) => item.id === cicloId);
  document.getElementById('notificar-gestores-ciclo').textContent = ciclo
    ? `${ciclo.nome} · encerramento em ${fmtData(ciclo.data_fim)}` : '';
  document.getElementById('notificar-gestores-lista').innerHTML = gestores.map((gestor) => {
    const fases = [
      [gestor.rascunho, 'em preparação'],
      [gestor.aguardando_autoavaliacao, 'aguardando autoavaliação'],
      [gestor.aguardando_alinhamento, 'aguardando alinhamento'],
      [gestor.aguardando_ciencia, 'aguardando ciência'],
    ].filter(([quantidade]) => Number(quantidade) > 0).map(([quantidade, nome]) => `${quantidade} ${nome}`).join(' · ');
    return `<label class="notificar-gestor-item"><input type="checkbox" value="${gestor.gestor_id}" checked onchange="atualizarResumoGestoresNotificacao()"><span><strong>${escHtml(gestor.gestor)}</strong><small>${gestor.pendentes} ${gestor.pendentes===1?'pendência':'pendências'} · ${escHtml(fases)}</small><small>Último aviso: ${gestor.ultimo_aviso?escHtml(formatarDataHoraNotificacao(gestor.ultimo_aviso)):'nenhum'}</small></span></label>`;
  }).join('');
  document.getElementById('notificar-gestores-todos').checked = true;
  _notificarGestoresTrigger = document.activeElement;
  document.getElementById('modal-notificar-gestores').classList.add('open');
  atualizarResumoGestoresNotificacao();
  document.querySelector('#notificar-gestores-lista input')?.focus();
}

function fecharModalNotificarGestores() {
  document.getElementById('modal-notificar-gestores').classList.remove('open');
  if (_notificarGestoresTrigger?.isConnected) _notificarGestoresTrigger.focus();
  _notificarGestoresTrigger = null;
}

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && document.getElementById('modal-notificar-gestores')?.classList.contains('open')) {
    fecharModalNotificarGestores();
  }
});

function selecionarTodosGestoresNotificacao(marcado) {
  document.querySelectorAll('#notificar-gestores-lista input[type="checkbox"]').forEach((input) => { input.checked = marcado; });
  atualizarResumoGestoresNotificacao();
}

function atualizarResumoGestoresNotificacao() {
  const caixas = [...document.querySelectorAll('#notificar-gestores-lista input[type="checkbox"]')];
  const quantidade = caixas.filter((input) => input.checked).length;
  document.getElementById('notificar-gestores-resumo').textContent = `${quantidade} ${quantidade===1?'selecionado':'selecionados'}`;
  document.getElementById('btn-enviar-lembretes-gestores').disabled = quantidade === 0;
  const todos = document.getElementById('notificar-gestores-todos');
  todos.checked = quantidade > 0 && quantidade === caixas.length;
  todos.indeterminate = quantidade > 0 && quantidade < caixas.length;
}

async function enviarLembretesGestores() {
  const botao = document.getElementById('btn-enviar-lembretes-gestores');
  const gestorIds = [...document.querySelectorAll('#notificar-gestores-lista input[type="checkbox"]:checked')].map((input) => input.value);
  if (!gestorIds.length) return;
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  try {
    const resultado = await sbInvokeFunction('notificar-gestores', {
      modo: 'manual', ciclo_id: document.getElementById('gestao-ciclo').value, gestor_ids: gestorIds,
    });
    fecharModalNotificarGestores();
    await carregarIndicadoresGestao();
    const partes = [`${resultado.sucessos || 0} enviados`];
    if (resultado.ignorados) partes.push(`${resultado.ignorados} protegidos contra duplicidade`);
    if (resultado.falhas) partes.push(`${resultado.falhas} falhas`);
    showToast(`Lembretes processados: ${partes.join(', ')}.`);
  } catch (erro) {
    showToast('Não foi possível enviar os lembretes: ' + (erro.message || erro));
  } finally {
    botao.textContent = 'Enviar lembrete';
    botao.disabled = false;
  }
}
