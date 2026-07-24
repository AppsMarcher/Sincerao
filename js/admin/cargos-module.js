// admin/cargos-module.js — CRUD de cargos

async function carregarCargos() {
  G.cargos = (await sbFetch('/cargos?select=*,setor:setor_id(id,nome)&order=nome.asc')) || [];
  renderAdmCargos();
}

function renderAdmCargos() {
  const el = document.getElementById('adm-lista-cargos');
  if (!el) return;
  el.innerHTML =
    G.cargos
      .map(
        (c) => `
    <tr>
      <td>${escHtml(c.nome)}</td>
      <td>${escHtml(c.setor?.nome || '—')}</td>
      <td>${c.ativo ? 'Ativo' : 'Inativo'}</td>
      <td><button class="btn-link" onclick="toggleCargoAtivo('${c.id}', ${!c.ativo})">${c.ativo ? 'Desativar' : 'Reativar'}</button></td>
    </tr>
  `
      )
      .join('') || '<tr><td colspan="4">Nenhum cargo cadastrado.</td></tr>';
}

async function criarCargo(nome, setorId) {
  if (!nome.trim()) { showToast('Informe o nome do cargo.'); return; }
  const jaExiste = G.cargos.some(
    (c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase() && (c.setor?.id || '') === (setorId || '')
  );
  if (jaExiste) { showToast('Já existe esse cargo nesse setor.'); return; }
  try {
    await sbFetch('/cargos', { method: 'POST', body: JSON.stringify({ nome: nome.trim(), setor_id: setorId || null }) });
  } catch (e) {
    showToast(String(e.message || '').includes('duplicate') ? 'Já existe esse cargo nesse setor.' : 'Erro ao criar cargo.');
    return;
  }
  await carregarCargos();
  showToast('Cargo criado.');
}

async function toggleCargoAtivo(id, novoValor) {
  await sbFetch('/cargos?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
  await carregarCargos();
}
