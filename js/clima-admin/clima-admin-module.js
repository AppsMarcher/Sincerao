// clima-admin/clima-admin-module.js — gestão da Pesquisa de Clima (RH/Admin):
// ciclos, geração/consulta de códigos e resultados agregados.

let _climaCiclos = [];
let _cicloSelecionadoClimaId = null;
let _cartoesVisiveisClima = false;
let _climaPerguntas = [];
let _perguntaClimaEmEdicaoId = null;

async function abrirClimaAdmin() {
  if (!ehRhOuAdmin()) { showToast('Acesso restrito ao RH.'); return; }
  goTo('screen-clima-admin');
  await Promise.all([carregarClimaCiclos(), carregarPerguntasClima()]);
  climaTab('ciclos');
}

function climaTab(nome) {
  document.querySelectorAll('#screen-clima-admin .adm-tab-panel').forEach((p) => (p.style.display = 'none'));
  document.querySelectorAll('#screen-clima-admin .modulo-tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('clima-panel-' + nome).style.display = 'block';
  document.getElementById('clima-btn-' + nome).classList.add('active');
  if (nome === 'resultados') renderClimaSeletorResultados();
  if (nome === 'administracao') renderPerguntasClima();
}

async function carregarClimaCiclos() {
  _climaCiclos = (await sbFetch('/clima_ciclos?order=created_at.desc')) || [];
  if (!_cicloSelecionadoClimaId && _climaCiclos.length) _cicloSelecionadoClimaId = _climaCiclos[0].id;
  renderClimaCiclosTabela();
  renderClimaDetalheCiclo();
}

function badgeStatusClimaHtml(status) {
  return status === 'aberto'
    ? '<span class="badge badge-ciclo-em_andamento">Em andamento</span>'
    : '<span class="badge badge-ciclo-encerrado">Encerrado</span>';
}

function renderClimaCiclosTabela() {
  const el = document.getElementById('clima-lista-ciclos');
  el.innerHTML = _climaCiclos.map((c) => `
    <tr class="${c.id === _cicloSelecionadoClimaId ? 'is-selected' : ''}" onclick="selecionarCicloClima('${c.id}')">
      <td>${escHtml(c.nome)}</td>
      <td>${badgeStatusClimaHtml(c.status)}</td>
      <td>${c.total_codigos}</td>
      <td>${c.total_respondidos}</td>
      <td>${c.total_codigos ? Math.round((c.total_respondidos / c.total_codigos) * 100) : 0}%</td>
    </tr>
  `).join('') || '<tr><td colspan="5">Nenhum ciclo criado ainda.</td></tr>';
}

function selecionarCicloClima(id) {
  _cicloSelecionadoClimaId = id;
  _cartoesVisiveisClima = false;
  renderClimaCiclosTabela();
  renderClimaDetalheCiclo();
}

function renderClimaDetalheCiclo() {
  const wrap = document.getElementById('clima-detalhe-ciclo');
  const ciclo = _climaCiclos.find((c) => c.id === _cicloSelecionadoClimaId);
  if (!ciclo) { wrap.innerHTML = ''; return; }

  const pct = ciclo.total_codigos ? Math.round((ciclo.total_respondidos / ciclo.total_codigos) * 100) : 0;
  const naoUsados = ciclo.total_codigos - ciclo.total_respondidos;

  wrap.innerHTML = `
    <div class="card">
      <div class="clima-detalhe-cabecalho">
        <div><h3>${escHtml(ciclo.nome)}</h3><p class="muted">Criado em ${fmtData(ciclo.created_at?.slice(0, 10))} ${badgeStatusClimaHtml(ciclo.status)}</p></div>
      </div>
      <div class="clima-geracao-row">
        <div><span class="clima-geracao-n">${ciclo.total_codigos}</span><span class="clima-geracao-l">códigos gerados</span></div>
        <div class="clima-geracao-acoes">
          <button class="btn-link" onclick="toggleCartoesClima()"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg> ${_cartoesVisiveisClima ? 'Esconder cartões' : 'Ver cartões'}</button>
          <button class="btn-link" onclick="imprimirCartoesClima('${ciclo.id}')"><svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir cartões (PDF)</button>
        </div>
      </div>
      <div class="clima-progress-block">
        <div class="clima-progress-top"><strong>${ciclo.total_respondidos} de ${ciclo.total_codigos} usados</strong><span class="muted">${pct}%</span></div>
        <div class="clima-progress-track"><div class="clima-progress-fill" style="width:${pct}%;"></div></div>
      </div>
      <div id="clima-cartoes-preview" class="clima-cartao-grid" ${_cartoesVisiveisClima ? '' : 'hidden'}></div>
      ${ciclo.status === 'aberto' ? `
        <div class="clima-acoes-ciclo">
          <span class="muted">Encerrar invalida os <strong>${naoUsados}</strong> códigos ainda não usados.</span>
          <button class="btn-primary btn-primary--perigo" onclick="confirmarEncerrarCicloClima('${ciclo.id}')">Encerrar ciclo</button>
        </div>
      ` : `
        <div class="clima-acoes-ciclo"><span class="muted">Ciclo encerrado${ciclo.encerrado_em ? ' em ' + fmtData(ciclo.encerrado_em.slice(0, 10)) : ''} — adesão final travada em ${ciclo.total_respondidos}/${ciclo.total_codigos} (${pct}%).</span></div>
      `}
    </div>
  `;

  if (_cartoesVisiveisClima) carregarCartoesClima(ciclo.id);
}

async function toggleCartoesClima() {
  _cartoesVisiveisClima = !_cartoesVisiveisClima;
  renderClimaDetalheCiclo();
}

async function carregarCartoesClima(cicloId) {
  const el = document.getElementById('clima-cartoes-preview');
  if (!el) return;
  let tokens = [];
  try {
    tokens = (await sbFetch('/clima_tokens?ciclo_id=eq.' + cicloId + '&order=codigo.asc&select=codigo,status')) || [];
  } catch (e) {
    el.innerHTML = '<p class="muted">Não foi possível carregar os cartões agora.</p>';
    return;
  }
  el.innerHTML = tokens.map((t) => `
    <div class="clima-cartao${t.status !== 'disponivel' ? ' clima-cartao--usado' : ''}"><small>Código</small><strong>${escHtml(t.codigo)}</strong></div>
  `).join('');
}

// Abre uma folha de cartões pronta para imprimir / salvar como PDF. Só entram
// códigos ainda disponíveis, em ordem embaralhada (crypto) -- a ordem de
// impressão nunca revela nada sobre quem vai receber qual cartão.
async function imprimirCartoesClima(cicloId) {
  let tokens = [];
  try {
    tokens = (await sbFetch('/clima_tokens?ciclo_id=eq.' + cicloId + '&status=eq.disponivel&select=codigo')) || [];
  } catch (e) {
    showToast('Não foi possível carregar os códigos agora.');
    return;
  }
  if (!tokens.length) { showToast('Este ciclo não tem códigos disponíveis para imprimir.'); return; }

  const codigos = tokens.map((t) => t.codigo);
  for (let i = codigos.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [codigos[i], codigos[j]] = [codigos[j], codigos[i]];
  }

  const ciclo = _climaCiclos.find((c) => c.id === cicloId);
  const janela = window.open('', '_blank');
  if (!janela) { showToast('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.'); return; }
  const baseHref = new URL('.', window.location.href).href;
  const estilo = `
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'DM Sans', Arial, sans-serif; color: #1a1a1a; }
    .grade { display: grid; grid-template-columns: repeat(3, 1fr); }
    .cartao { height: 46mm; border: 1px dashed #999; padding: 6mm 5mm; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; break-inside: avoid; }
    .cartao img { height: 8mm; }
    .cartao .marca { font-family: 'Space Grotesk', Arial, sans-serif; font-weight: 700; font-size: 13pt; color: #5b0048; }
    .cartao small { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: .08em; }
    .cartao .codigo { font-family: 'Space Grotesk', Arial, sans-serif; font-weight: 700; font-size: 24pt; letter-spacing: .12em; color: #5b0048; }
    .cartao .url { font-size: 8pt; color: #444; }
  `;
  const cartoes = codigos.map((c) => `<div class="cartao"><span class="marca">Sincerão</span><div><small>Pesquisa de clima · seu código</small><div class="codigo">${escHtml(c)}</div></div><span class="url">Acesse sincerao.marcher.com.br/clima e digite o código. Uso único, 100% anônimo.</span></div>`).join('');
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cartões - ${escHtml(ciclo?.nome || 'Clima')}</title><base href="${baseHref}"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap"><style>${estilo}</style></head><body><div class="grade">${cartoes}</div></body></html>`);
  janela.document.close();
  janela.addEventListener('load', () => { janela.focus(); janela.print(); });
}

function confirmarEncerrarCicloClima(id) {
  const ciclo = _climaCiclos.find((c) => c.id === id);
  const naoUsados = ciclo ? ciclo.total_codigos - ciclo.total_respondidos : 0;
  abrirConfirmacao({
    titulo: 'Encerrar este ciclo?',
    texto: `Os ${naoUsados} códigos ainda não usados serão invalidados para sempre e a adesão fica travada em ${ciclo?.total_respondidos ?? 0}/${ciclo?.total_codigos ?? 0}. Essa ação não pode ser desfeita.`,
    acao: () => executarEncerrarCicloClima(id),
    rotuloConfirmar: 'Invalidar e encerrar',
    perigosa: true,
  });
}

async function executarEncerrarCicloClima(id) {
  try {
    await sbRpc('clima_encerrar_ciclo', { p_ciclo_id: id });
  } catch (e) {
    showToast('Erro ao encerrar o ciclo.');
    return;
  }
  await carregarClimaCiclos();
  showToast('Ciclo encerrado.');
}

// ---------- Novo ciclo ----------

function abrirModalNovoCicloClima() {
  document.getElementById('clima-novo-nome').value = '';
  document.getElementById('clima-novo-quantidade').value = '';
  document.getElementById('modal-novo-ciclo-clima').classList.add('open');
}
function fecharModalNovoCicloClima() {
  document.getElementById('modal-novo-ciclo-clima').classList.remove('open');
}

async function confirmarNovoCicloClima() {
  const nome = document.getElementById('clima-novo-nome').value.trim();
  const quantidade = Number(document.getElementById('clima-novo-quantidade').value);
  if (!nome || !Number.isInteger(quantidade) || quantidade < 1) {
    showToast('Preencha o nome do ciclo e a quantidade de códigos.');
    return;
  }
  const botao = document.getElementById('clima-novo-confirmar');
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  try {
    const resultado = await sbInvokeFunction('gerar-tokens-clima', { nome, quantidade });
    fecharModalNovoCicloClima();
    _cicloSelecionadoClimaId = resultado.ciclo_id;
    _cartoesVisiveisClima = true;
    await carregarClimaCiclos();
    showToast(`${resultado.codigos.length} códigos gerados.`);
  } catch (e) {
    showToast('Erro ao gerar códigos: ' + (e.message || 'tente novamente.'));
  } finally {
    botao.disabled = false;
    botao.textContent = 'Gerar códigos';
  }
}

// ---------- Resultados ----------

function renderClimaSeletorResultados() {
  const select = document.getElementById('clima-resultados-ciclo');
  select.innerHTML = _climaCiclos.map((c) => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
  if (_cicloSelecionadoClimaId) select.value = _cicloSelecionadoClimaId;
  carregarResultadosClima();
}

async function carregarResultadosClima() {
  const select = document.getElementById('clima-resultados-ciclo');
  const cicloId = select.value;
  const wrap = document.getElementById('clima-resultados-conteudo');
  if (!cicloId) { wrap.innerHTML = '<p class="muted">Nenhum ciclo disponível.</p>'; return; }

  wrap.innerHTML = '<p class="muted">Carregando…</p>';
  let r;
  try {
    r = await sbRpc('clima_resultados_agregados', { p_ciclo_id: cicloId });
  } catch (e) {
    wrap.innerHTML = '<p class="muted">Não foi possível carregar os resultados agora.</p>';
    return;
  }

  if (r.insuficiente) {
    wrap.innerHTML = `<div class="card"><p class="muted">Este ciclo ainda tem menos de 5 respostas (${r.total_respondidos} até agora) — os resultados só aparecem a partir daí, pra preservar o anonimato.</p></div>`;
    return;
  }

  const adesao = r.total_codigos ? Math.round((r.total_respondidos / r.total_codigos) * 100) : 0;
  const medias = r.medias_por_pergunta || {};
  const mediaGeral = Object.keys(medias).length
    ? (Object.values(medias).reduce((a, b) => a + Number(b), 0) / Object.keys(medias).length).toFixed(1)
    : '—';
  const nps = r.nps || { promotores: 0, neutros: 0, detratores: 0 };
  const totalNps = nps.promotores + nps.neutros + nps.detratores;
  const enps = totalNps ? Math.round(((nps.promotores - nps.detratores) / totalNps) * 100) : 0;

  wrap.innerHTML = `
    <div class="clima-kpis-mini">
      <div class="clima-kpi-mini"><span>Adesão</span><strong>${adesao}%</strong></div>
      <div class="clima-kpi-mini"><span>Média geral</span><strong>${mediaGeral}</strong></div>
      <div class="clima-kpi-mini"><span>eNPS</span><strong>${enps >= 0 ? '+' : ''}${enps}</strong></div>
      <div class="clima-kpi-mini"><span>Respostas</span><strong>${r.total_respondidos}</strong></div>
    </div>
    <div class="card">
      <h3 class="clima-eyebrow-card">Média por pergunta</h3>
      ${Object.keys(medias).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((chave) => `
        <div class="clima-score-row">
          <span class="clima-score-label" title="${escHtml(textoPerguntaClima(chave))}">Pergunta ${chave.slice(1)}</span>
          <div class="clima-score-track"><div class="clima-score-fill" style="width:${Math.min(100, (Number(medias[chave]) / escalaMaxPerguntaClima(chave)) * 100)}%;"></div></div>
          <span class="clima-score-value">${Number(medias[chave]).toFixed(1)}</span>
        </div>
      `).join('')}
    </div>
    <p class="muted">Resultado sempre da empresa toda — sem recorte por área, turno ou cargo.</p>
  `;
}

function escalaMaxPerguntaClima(chave) {
  const p = _climaPerguntas.find((x) => 'q' + x.id === chave);
  return p && p.tipo === 'nps' ? 10 : 5;
}
function textoPerguntaClima(chave) {
  const p = _climaPerguntas.find((x) => 'q' + x.id === chave);
  return p ? p.texto : '(pergunta removida)';
}

// ---------- Administração: perguntas ----------

async function carregarPerguntasClima() {
  _climaPerguntas = (await sbFetch('/clima_perguntas?order=ordem.asc,id.asc')) || [];
  renderPerguntasClima();
}

function renderPerguntasClima() {
  const el = document.getElementById('clima-lista-perguntas');
  if (!el) return;
  const secoes = [...new Set(_climaPerguntas.map((p) => p.secao))];
  document.getElementById('clima-secoes-lista').innerHTML = secoes.map((s) => `<option value="${escHtml(s)}">`).join('');
  el.innerHTML =
    _climaPerguntas.map((p, i) => (p.id === _perguntaClimaEmEdicaoId ? linhaPerguntaClimaEdicaoHtml(p, i) : linhaPerguntaClimaHtml(p, i))).join('') ||
    '<tr><td colspan="5">Nenhuma pergunta cadastrada.</td></tr>';
}

function linhaPerguntaClimaHtml(p, i) {
  const ultimo = i === _climaPerguntas.length - 1;
  return `
    <tr class="${p.ativo ? '' : 'clima-pergunta-inativa'}">
      <td>${i + 1}</td>
      <td>${escHtml(p.secao)}</td>
      <td>${escHtml(p.texto)}${p.enps ? '<span class="clima-tag-enps">eNPS</span>' : ''}</td>
      <td>${p.tipo === 'nps' ? 'Nota 0 a 10' : 'Escala 1 a 5'}</td>
      <td><div class="tabela-acoes">
        <button class="btn-icon" title="Subir" ${i === 0 ? 'disabled' : ''} onclick="moverPerguntaClima(${p.id}, -1)"><svg class="icon" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></button>
        <button class="btn-icon" title="Descer" ${ultimo ? 'disabled' : ''} onclick="moverPerguntaClima(${p.id}, 1)"><svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button>
        <button class="btn-icon" title="Editar" onclick="editarPerguntaClima(${p.id})"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button class="btn-icon btn-icon--competencia-toggle ${p.ativo ? 'btn-icon--ativo' : 'btn-icon--inativo'}" title="${p.ativo ? 'Desativar' : 'Reativar'}" aria-label="${p.ativo ? 'Desativar' : 'Reativar'} a pergunta ${i + 1}" onclick="togglePerguntaClimaAtiva(${p.id}, ${!p.ativo})"><svg class="icon" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        <button class="btn-icon btn-icon--perigo" title="Excluir" aria-label="Excluir a pergunta ${i + 1}" onclick="excluirPerguntaClima(${p.id})"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div></td>
    </tr>
  `;
}

function linhaPerguntaClimaEdicaoHtml(p, i) {
  return `
    <tr data-edicao-pergunta="${p.id}">
      <td>${i + 1}</td>
      <td><input type="text" class="edit-secao" value="${escHtml(p.secao)}" list="clima-secoes-lista"></td>
      <td><input type="text" class="edit-texto" value="${escHtml(p.texto)}"></td>
      <td><div class="clima-perg-edit">
        <select class="edit-tipo" onchange="this.closest('td').querySelector('.clima-perg-nps').hidden = this.value !== 'nps'">
          <option value="likert" ${p.tipo === 'likert' ? 'selected' : ''}>Escala 1 a 5</option>
          <option value="nps" ${p.tipo === 'nps' ? 'selected' : ''}>Nota 0 a 10</option>
        </select>
        <div class="clima-perg-nps clima-perg-edit" ${p.tipo === 'nps' ? '' : 'hidden'}>
          <input type="text" class="edit-esq" placeholder="Rótulo do 0" value="${escHtml(p.rotulo_esq || '')}">
          <input type="text" class="edit-dir" placeholder="Rótulo do 10" value="${escHtml(p.rotulo_dir || '')}">
          <label><input type="checkbox" class="edit-enps" ${p.enps ? 'checked' : ''}> Base do eNPS</label>
        </div>
      </div></td>
      <td><div class="tabela-acoes">
        <button class="btn-icon" title="Salvar" onclick="salvarEdicaoPerguntaClima(${p.id})"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoPerguntaClima()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div></td>
    </tr>
  `;
}

function editarPerguntaClima(id) { _perguntaClimaEmEdicaoId = id; renderPerguntasClima(); }
function cancelarEdicaoPerguntaClima() { _perguntaClimaEmEdicaoId = null; renderPerguntasClima(); }

async function salvarEdicaoPerguntaClima(id) {
  const linha = document.querySelector(`tr[data-edicao-pergunta="${id}"]`);
  const secao = linha.querySelector('.edit-secao').value.trim();
  const texto = linha.querySelector('.edit-texto').value.trim();
  const tipo = linha.querySelector('.edit-tipo').value;
  if (!secao || !texto) { showToast('Preencha o bloco e o texto da pergunta.'); return; }
  const nps = tipo === 'nps';
  const enps = nps && linha.querySelector('.edit-enps').checked;
  try {
    // A base do eNPS é única: libera a anterior antes de marcar esta.
    if (enps) await sbFetch('/clima_perguntas?enps=eq.true&id=neq.' + id, { method: 'PATCH', body: JSON.stringify({ enps: false }) });
    await sbFetch('/clima_perguntas?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({
        secao, texto, tipo, enps,
        rotulo_esq: nps ? linha.querySelector('.edit-esq').value.trim() || null : null,
        rotulo_dir: nps ? linha.querySelector('.edit-dir').value.trim() || null : null,
      }),
    });
  } catch (e) {
    showToast('Erro ao salvar pergunta.');
    return;
  }
  _perguntaClimaEmEdicaoId = null;
  await carregarPerguntasClima();
  showToast('Pergunta atualizada.');
}

async function criarPerguntaClima(form) {
  const secao = form.secao.value.trim();
  const texto = form.texto.value.trim();
  if (!secao || !texto) { showToast('Preencha o bloco e o texto da pergunta.'); return; }
  const ordem = _climaPerguntas.reduce((m, p) => Math.max(m, p.ordem), 0) + 1;
  try {
    await sbFetch('/clima_perguntas', { method: 'POST', body: JSON.stringify({ secao, texto, tipo: form.tipo.value, ordem }) });
  } catch (e) {
    showToast('Erro ao criar pergunta.');
    return;
  }
  form.reset();
  await carregarPerguntasClima();
  showToast('Pergunta criada.');
}

async function moverPerguntaClima(id, delta) {
  const i = _climaPerguntas.findIndex((p) => p.id === id);
  if (!_climaPerguntas[i + delta]) return;
  const lista = _climaPerguntas.slice();
  [lista[i], lista[i + delta]] = [lista[i + delta], lista[i]];
  try {
    // Renumera a lista inteira: evita empate de "ordem" entre perguntas.
    await Promise.all(lista.map((p, n) => (p.ordem === n + 1 ? null : sbFetch('/clima_perguntas?id=eq.' + p.id, { method: 'PATCH', body: JSON.stringify({ ordem: n + 1 }) }))));
  } catch (e) {
    showToast('Erro ao reordenar.');
  }
  await carregarPerguntasClima();
}

async function togglePerguntaClimaAtiva(id, novoValor) {
  await sbFetch('/clima_perguntas?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
  await carregarPerguntasClima();
}

function excluirPerguntaClima(id) {
  abrirConfirmacao({
    titulo: 'Excluir pergunta?',
    texto: 'A pergunta sai do questionário e as respostas já dadas a ela deixam de aparecer nos resultados. Para só tirá-la do ar, prefira desativar. Essa ação não pode ser desfeita.',
    acao: () => executarExclusaoPerguntaClima(id),
    rotuloConfirmar: 'Excluir',
    perigosa: true,
  });
}

async function executarExclusaoPerguntaClima(id) {
  try {
    await sbFetch('/clima_perguntas?id=eq.' + id, { method: 'DELETE' });
  } catch (e) {
    showToast('Erro ao excluir pergunta.');
    return;
  }
  await carregarPerguntasClima();
  showToast('Pergunta excluída.');
}

// ---------- Resumo no Hub ----------

async function carregarResumoClimaNoHub() {
  const el = document.getElementById('hub-clima-stat');
  if (!el) return;
  try {
    const ciclos = (await sbFetch('/clima_ciclos?status=eq.aberto&order=created_at.desc&limit=1')) || [];
    if (!ciclos.length) { el.textContent = 'Nenhum ciclo em andamento'; el.classList.remove('ativo'); return; }
    const c = ciclos[0];
    const pct = c.total_codigos ? Math.round((c.total_respondidos / c.total_codigos) * 100) : 0;
    el.textContent = `Ciclo em andamento · ${pct}% de adesão`;
    el.classList.add('ativo');
  } catch (e) {
    el.textContent = 'Ver ciclos e resultados';
  }
}
