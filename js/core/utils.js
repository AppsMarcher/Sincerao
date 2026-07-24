// core/utils.js — navegação entre telas e utilitários puros (sem estado, sem rede)

function goTo(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) screen.classList.add('active');
  window.scrollTo(0, 0);
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

let _toastTimer = null;
function showToast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = String(m ?? '').trim();
  t.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function fmtData(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function classificacaoPorMedia(media) {
  const faixa = FAIXAS_CLASSIFICACAO.find((f) => media >= f.min);
  return faixa ? faixa.label : FAIXAS_CLASSIFICACAO[FAIXAS_CLASSIFICACAO.length - 1].label;
}

function calcularPontuacao(notas) {
  const validas = notas.filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (!validas.length) return { pontuacaoGeral: null, percentual: null, classificacao: null };
  const media = validas.reduce((a, b) => a + b, 0) / validas.length;
  const percentual = Math.round((media / 5) * 1000) / 10;
  return {
    pontuacaoGeral: Math.round(media * 100) / 100,
    percentual,
    classificacao: classificacaoPorMedia(media),
  };
}

function nomeJaExiste(lista, nome, ignorarId = null) {
  const alvo = nome.trim().toLowerCase();
  return lista.some((item) => item.id !== ignorarId && item.nome.trim().toLowerCase() === alvo);
}

function statusLabel(status) {
  return {
    rascunho: 'Rascunho (gestor)',
    aguardando_autoavaliacao: 'Aguardando autoavaliação',
    aguardando_alinhamento: 'Aguardando alinhamento',
    concluida: 'Concluída',
  }[status] || status;
}
