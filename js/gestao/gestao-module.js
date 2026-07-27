let _dadosGestao = null;
let _ordenacaoGestao = {};

async function abrirGestao() {
  if (!podeVerGestao()) { showToast('Acesso restrito à gestão.'); return; }
  goTo('screen-gestao');
  const ciclos = (await sbFetch('/ciclos_avaliacao?order=data_inicio.desc')) || [];
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
  document.getElementById('gestao-conteudo').innerHTML=`<div class="gestao-kpis"><article><span>Avaliações</span><strong>${n(t.total)}</strong></article><article><span>Concluídas</span><strong>${n(t.concluidas)}</strong></article><article><span>Conclusão</span><strong>${t.total?Math.round((t.concluidas||0)/t.total*100):0}%</strong></article><article><span>Nota média</span><strong>${n(t.nota_media)}</strong></article></div><section class="card"><h3>Resultados por gestor</h3>${tabelaGestao('gestor',[['gestor','Gestor'],['avaliacoes','Avaliações'],['concluidas','Concluídas'],['nota_media','Nota média']],d.por_gestor||[],(x,c)=>c==='gestor'?x.gestor.toLowerCase():c==='avaliacoes'?x.total:c==='concluidas'?x.concluidas:(x.nota_media??-1),x=>`<tr><td>${escHtml(x.gestor)}</td><td>${x.total}</td><td>${x.concluidas}</td><td>${n(x.nota_media)}</td></tr>`)}</section><section class="card"><h3>Resultados por setor</h3>${tabelaGestao('setor',[['setor','Setor'],['avaliacoes','Avaliações'],['concluidas','Concluídas'],['nota_media','Nota média']],d.por_setor||[],(x,c)=>c==='setor'?x.setor.toLowerCase():c==='avaliacoes'?x.total:c==='concluidas'?x.concluidas:(x.nota_media??-1),x=>`<tr><td>${escHtml(x.setor)}</td><td>${x.total}</td><td>${x.concluidas}</td><td>${n(x.nota_media)}</td></tr>`)}</section><section class="card"><h3>Andamento do ciclo</h3>${tabelaGestao('status',[['fase','Fase'],['quantidade','Quantidade']],d.por_status||[],(x,c)=>c==='fase'?statusLabel(x.status).toLowerCase():x.quantidade,x=>`<tr><td>${escHtml(statusLabel(x.status))}</td><td>${x.quantidade}</td></tr>`)}</section><section class="card"><h3>Distribuição das classificações</h3>${tabelaGestao('classificacao',[['classificacao','Classificação'],['quantidade','Quantidade']],d.por_classificacao||[],(x,c)=>c==='classificacao'?x.classificacao.toLowerCase():x.quantidade,x=>`<tr><td>${escHtml(x.classificacao)}</td><td>${x.quantidade}</td></tr>`)}</section><section class="card"><h3>Prioridades de desenvolvimento</h3><p class="muted">Competências com menor nota média nas avaliações concluídas.</p>${tabelaGestao('competencias',[['competencia','Competência'],['nota_media','Nota média'],['avaliacoes','Avaliações']],d.competencias||[],(x,c)=>c==='competencia'?x.competencia.toLowerCase():c==='nota_media'?(x.nota_media??-1):x.avaliacoes,x=>`<tr><td>${escHtml(x.competencia)}</td><td>${n(x.nota_media)}</td><td>${x.avaliacoes}</td></tr>`)}</section>`;
}
