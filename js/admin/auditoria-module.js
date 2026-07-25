// admin/auditoria-module.js — consulta e exportação do histórico imutável

const AUDITORIA_PAGINA = 100;
let _auditoriaLogs = [];
let _auditoriaOffset = 0;
let _auditoriaCarregando = false;

const AUDITORIA_ENTIDADES = {
  avaliacoes: 'Avaliação',
  avaliacao_notas: 'Nota',
  avaliacao_plano_desenvolvimento: 'Plano de desenvolvimento',
  perfis: 'Colaborador',
  ciclos_avaliacao: 'Ciclo',
  cargos: 'Cargo',
  setores: 'Setor',
  competencias: 'Competência',
  cargo_competencias: 'Cargo × competência',
};

const AUDITORIA_ACOES = {
  INSERT: 'Inclusão',
  UPDATE: 'Alteração',
  DELETE: 'Exclusão',
};

function valorFiltroAuditoria(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function montarQueryAuditoria(offset, limite) {
  const params = new URLSearchParams({
    select: '*',
    order: 'ocorrido_em.desc',
    offset: String(offset),
    limit: String(limite),
  });
  const tabela = valorFiltroAuditoria('auditoria-tabela');
  const acao = valorFiltroAuditoria('auditoria-acao');
  const inicio = valorFiltroAuditoria('auditoria-data-inicio');
  const fim = valorFiltroAuditoria('auditoria-data-fim');
  const busca = valorFiltroAuditoria('auditoria-busca').replace(/[,*()]/g, ' ').trim();

  if (tabela) params.set('tabela', 'eq.' + tabela);
  if (acao) params.set('acao', 'eq.' + acao);
  if (inicio && fim) {
    params.set('and', `(ocorrido_em.gte.${inicio}T00:00:00-03:00,ocorrido_em.lte.${fim}T23:59:59.999-03:00)`);
  } else if (inicio) {
    params.set('ocorrido_em', 'gte.' + inicio + 'T00:00:00-03:00');
  } else if (fim) {
    params.set('ocorrido_em', 'lte.' + fim + 'T23:59:59.999-03:00');
  }
  if (busca) {
    params.set('or', `(ator_nome.ilike.*${busca}*,ator_email.ilike.*${busca}*,registro_id.ilike.*${busca}*)`);
  }
  return '/auditoria_logs?' + params.toString();
}

async function carregarAuditoria(reiniciar = true) {
  if (_auditoriaCarregando) return;
  _auditoriaCarregando = true;
  const status = document.getElementById('auditoria-status');
  const btnMais = document.getElementById('auditoria-mais');
  if (reiniciar) {
    _auditoriaOffset = 0;
    _auditoriaLogs = [];
  }
  if (status) status.textContent = 'Carregando registros...';
  if (btnMais) btnMais.disabled = true;

  try {
    const pagina = (await sbFetch(montarQueryAuditoria(_auditoriaOffset, AUDITORIA_PAGINA))) || [];
    _auditoriaLogs = reiniciar ? pagina : _auditoriaLogs.concat(pagina);
    _auditoriaOffset = _auditoriaLogs.length;
    renderAuditoria();
    if (status) {
      status.textContent = `${_auditoriaLogs.length} registro(s) carregado(s)${pagina.length === AUDITORIA_PAGINA ? ' — há mais resultados' : ''}.`;
    }
    if (btnMais) btnMais.style.display = pagina.length === AUDITORIA_PAGINA ? '' : 'none';
  } catch (err) {
    if (status) status.textContent = 'Não foi possível carregar a auditoria.';
    showToast('Erro ao carregar auditoria: ' + (err.message || err));
  } finally {
    _auditoriaCarregando = false;
    if (btnMais) btnMais.disabled = false;
  }
}

function camposAuditadosLabel(campos) {
  const tecnicos = new Set(['updated_at', 'versao']);
  const relevantes = (campos || []).filter((campo) => !tecnicos.has(campo));
  if (!relevantes.length) return 'Controle técnico';
  return relevantes.map((campo) => campo.replaceAll('_', ' ')).join(', ');
}

function resumoRegistroAuditoria(log) {
  const dados = log.dados_novos || log.dados_anteriores || {};
  return dados.nome || dados.email || dados.competencia || dados.acao || log.registro_id || '—';
}

function jsonAuditoriaHtml(valor) {
  if (valor == null) return '<span class="muted">Não se aplica</span>';
  return `<pre>${escHtml(JSON.stringify(valor, null, 2))}</pre>`;
}

function detalhesAuditoriaHtml(log) {
  return `
    <details class="auditoria-detalhes">
      <summary>Ver</summary>
      <div class="auditoria-meta">
        <span><strong>Registro:</strong> ${escHtml(log.registro_id || '—')}</span>
        <span><strong>Transação:</strong> ${escHtml(log.transacao_id)}</span>
      </div>
      <div class="auditoria-comparacao">
        <div><strong>Antes</strong>${jsonAuditoriaHtml(log.dados_anteriores)}</div>
        <div><strong>Depois</strong>${jsonAuditoriaHtml(log.dados_novos)}</div>
      </div>
    </details>`;
}

function renderAuditoria() {
  const el = document.getElementById('auditoria-lista');
  if (!el) return;
  el.innerHTML = _auditoriaLogs.map((log) => `
    <tr>
      <td class="auditoria-data">${new Date(log.ocorrido_em).toLocaleString('pt-BR')}</td>
      <td><strong>${escHtml(log.ator_nome || 'Sistema')}</strong><br><small>${escHtml(log.ator_email || '')}</small></td>
      <td><span class="badge auditoria-acao-${escHtml(log.acao.toLowerCase())}">${escHtml(AUDITORIA_ACOES[log.acao] || log.acao)}</span></td>
      <td><strong>${escHtml(AUDITORIA_ENTIDADES[log.tabela] || log.tabela)}</strong><br><small>${escHtml(resumoRegistroAuditoria(log))}</small></td>
      <td class="auditoria-campos">${escHtml(camposAuditadosLabel(log.campos_alterados))}</td>
      <td>${detalhesAuditoriaHtml(log)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">Nenhum registro encontrado para os filtros informados.</td></tr>';
}

function limparFiltrosAuditoria() {
  document.getElementById('form-filtros-auditoria')?.reset();
  carregarAuditoria(true);
}

function csvCampo(valor) {
  const texto = valor == null ? '' : String(valor);
  return `"${texto.replaceAll('"', '""')}"`;
}

async function buscarTodosLogsFiltrados() {
  const todos = [];
  const lote = 1000;
  for (let offset = 0; offset < 10000; offset += lote) {
    const pagina = (await sbFetch(montarQueryAuditoria(offset, lote))) || [];
    todos.push(...pagina);
    if (pagina.length < lote) break;
  }
  return todos;
}

async function exportarAuditoriaCsv() {
  const status = document.getElementById('auditoria-status');
  if (status) status.textContent = 'Preparando exportação...';
  try {
    const logs = await buscarTodosLogsFiltrados();
    const cabecalho = ['Data e hora', 'Usuário', 'E-mail', 'Ação', 'Entidade', 'Registro', 'Campos alterados', 'Antes (JSON)', 'Depois (JSON)'];
    const linhas = logs.map((log) => [
      new Date(log.ocorrido_em).toLocaleString('pt-BR'),
      log.ator_nome || 'Sistema',
      log.ator_email || '',
      AUDITORIA_ACOES[log.acao] || log.acao,
      AUDITORIA_ENTIDADES[log.tabela] || log.tabela,
      log.registro_id || '',
      camposAuditadosLabel(log.campos_alterados),
      JSON.stringify(log.dados_anteriores || null),
      JSON.stringify(log.dados_novos || null),
    ].map(csvCampo).join(';'));
    const csv = '\uFEFF' + [cabecalho.map(csvCampo).join(';'), ...linhas].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria-sincerao-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (status) status.textContent = `${logs.length} registro(s) exportado(s).`;
  } catch (err) {
    if (status) status.textContent = 'Falha ao exportar auditoria.';
    showToast('Erro ao exportar: ' + (err.message || err));
  }
}
