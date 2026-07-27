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

function mostrarProgressoDownloadPdf(mostrar) {
  const popover = document.getElementById('popover-download-pdf');
  if (popover) popover.hidden = !mostrar;
}

let _confirmacaoTrigger = null;
function abrirConfirmacao({ titulo, texto, acao, rotuloConfirmar = 'Confirmar', perigosa = false }) {
  const modal = document.getElementById('modal-confirmar-fluxo');
  const botao = document.getElementById('confirmar-fluxo-botao');
  _confirmacaoTrigger = document.activeElement;
  document.getElementById('confirmar-fluxo-titulo').textContent = titulo;
  document.getElementById('confirmar-fluxo-texto').textContent = texto;
  botao.textContent = rotuloConfirmar;
  botao.classList.toggle('btn-primary--perigo', perigosa);
  modal._acaoConfirmada = acao;
  modal.classList.add('open');
  botao.focus();
}

function fecharModalConfirmarFluxo() {
  const modal = document.getElementById('modal-confirmar-fluxo');
  modal.classList.remove('open');
  modal._acaoConfirmada = null;
  if (_confirmacaoTrigger?.isConnected) _confirmacaoTrigger.focus();
  _confirmacaoTrigger = null;
}

async function executarConfirmacaoFluxo() {
  const modal = document.getElementById('modal-confirmar-fluxo');
  const acao = modal._acaoConfirmada;
  fecharModalConfirmarFluxo();
  await acao?.();
}

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && document.getElementById('modal-confirmar-fluxo')?.classList.contains('open')) {
    fecharModalConfirmarFluxo();
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function cargoLabel(c) {
  return c.setor?.nome ? `${c.nome} — ${c.setor.nome}` : c.nome;
}

function nomeJaExiste(lista, nome, ignorarId = null) {
  const alvo = nome.trim().toLowerCase();
  return lista.some((item) => item.id !== ignorarId && item.nome.trim().toLowerCase() === alvo);
}

const ICONE_OLHO_ABERTO = '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONE_OLHO_FECHADO = '<svg class="icon" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.8 21.8 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.8 21.8 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function togglePasswordVisibility(btn) {
  const input = btn.parentElement.querySelector('input');
  const paraTexto = input.type === 'password';
  input.type = paraTexto ? 'text' : 'password';
  btn.innerHTML = paraTexto ? ICONE_OLHO_FECHADO : ICONE_OLHO_ABERTO;
  btn.setAttribute('aria-label', paraTexto ? 'Ocultar senha' : 'Mostrar senha');
}

// Toda resposta de texto da avaliação (perguntas abertas, comentário de
// competência, plano de desenvolvimento, parecer final) precisa ter conteúdo
// de verdade — não vazio e não só 1-2 letras preenchidas só pra passar.
const MIN_CHARS_RESPOSTA_AVALIACAO = 10;
function respostaValida(texto) {
  return String(texto ?? '').trim().length >= MIN_CHARS_RESPOSTA_AVALIACAO;
}

function statusLabel(status) {
  return {
    rascunho: 'Avaliação do Gestor',
    aguardando_autoavaliacao: 'Aguardando autoavaliação',
    aguardando_alinhamento: 'Aguardando alinhamento',
    aguardando_ciencia: 'Aguardando aceite/ciência',
    concluida: 'Concluída',
  }[status] || status;
}
