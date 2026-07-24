// admin/vinculo-module.js — vínculo N:N entre cargos e competências

async function renderVinculoCargoCompetencia() {
  const select = document.getElementById('vinculo-select-cargo');
  select.innerHTML = G.cargos.filter((c) => c.ativo).map((c) => `<option value="${c.id}">${escHtml(cargoLabel(c))}</option>`).join('');
  if (select.options.length) await renderVinculoLista(select.value || select.options[0].value);
}

async function renderVinculoLista(cargoId) {
  if (!cargoId) return;
  const vinculos = (await sbFetch('/cargo_competencias?cargo_id=eq.' + cargoId)) || [];
  const vinculadas = new Set(vinculos.map((v) => v.competencia_id));
  const el = document.getElementById('vinculo-lista-competencias');
  el.innerHTML = G.competencias
    .filter((c) => c.ativo)
    .map(
      (c) => `
    <label class="check-row">
      <input type="checkbox" ${vinculadas.has(c.id) ? 'checked' : ''} onchange="toggleVinculoCargoCompetencia('${cargoId}','${c.id}', this.checked)">
      ${escHtml(c.nome)} <span class="tag">${c.tipo === 'comportamental' ? 'comportamental' : 'técnica'}</span>
    </label>
  `
    )
    .join('');
}

async function toggleVinculoCargoCompetencia(cargoId, competenciaId, marcado) {
  if (marcado) {
    await sbFetch('/cargo_competencias', { method: 'POST', body: JSON.stringify({ cargo_id: cargoId, competencia_id: competenciaId }) });
  } else {
    await sbFetch('/cargo_competencias?cargo_id=eq.' + cargoId + '&competencia_id=eq.' + competenciaId, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }
}
