// hub/hub-module.js — seleção de módulo (Avaliação × Clima), só pra RH/Admin

async function abrirHub() {
  if (!ehRhOuAdmin()) { showToast('Acesso restrito ao RH.'); return; }
  goTo('screen-hub');
  const primeiroNome = (G.perfil?.nome || '').trim().split(/\s+/)[0];
  document.getElementById('hub-saudacao').textContent = primeiroNome ? `Olá, ${primeiroNome}` : 'Olá';
  carregarResumoClimaNoHub();
}
