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
  try { renderIndicadoresGestao(await sbRpc('indicadores_gestao',{p_ciclo_id:document.getElementById('gestao-ciclo').value || null}) || {}); }
  catch { el.innerHTML = '<p class="empty">Não foi possível carregar os indicadores.</p>'; }
}
function tabelaGestao(titulos, linhas) { return `<div class="tabela-scroll"><table class="tabela"><thead><tr>${titulos.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${linhas || '<tr><td colspan="9">Sem dados para este filtro.</td></tr>'}</tbody></table></div>`; }
function renderIndicadoresGestao(d) {
  const t=d.totais||{}, n=v=>v??'—';
  document.getElementById('gestao-conteudo').innerHTML=`<div class="gestao-kpis"><article><span>Avaliações</span><strong>${n(t.total)}</strong></article><article><span>Concluídas</span><strong>${n(t.concluidas)}</strong></article><article><span>Conclusão</span><strong>${t.total?Math.round((t.concluidas||0)/t.total*100):0}%</strong></article><article><span>Nota média</span><strong>${n(t.nota_media)}</strong></article></div><section class="card"><h3>Resultados por setor</h3>${tabelaGestao(['Setor','Avaliações','Concluídas','Nota média'],(d.por_setor||[]).map(x=>`<tr><td>${escHtml(x.setor)}</td><td>${x.total}</td><td>${x.concluidas}</td><td>${n(x.nota_media)}</td></tr>`).join(''))}</section><section class="card"><h3>Andamento do ciclo</h3>${tabelaGestao(['Fase','Quantidade'],(d.por_status||[]).map(x=>`<tr><td>${escHtml(statusLabel(x.status))}</td><td>${x.quantidade}</td></tr>`).join(''))}</section><section class="card"><h3>Distribuição das classificações</h3>${tabelaGestao(['Classificação','Quantidade'],(d.por_classificacao||[]).map(x=>`<tr><td>${escHtml(x.classificacao)}</td><td>${x.quantidade}</td></tr>`).join(''))}</section><section class="card"><h3>Prioridades de desenvolvimento</h3><p class="muted">Competências com menor nota média nas avaliações concluídas.</p>${tabelaGestao(['Competência','Nota média','Avaliações'],(d.competencias||[]).map(x=>`<tr><td>${escHtml(x.competencia)}</td><td>${n(x.nota_media)}</td><td>${x.avaliacoes}</td></tr>`).join(''))}</section>`;
}
