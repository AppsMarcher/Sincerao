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
      <input type="checkbox" data-competencia-id="${c.id}" data-tipo="${c.tipo}" ${vinculadas.has(c.id) ? 'checked' : ''} onchange="toggleVinculoCargoCompetencia('${cargoId}','${c.id}', this.checked)">
      ${escHtml(c.nome)} <span class="tag">${c.tipo === 'comportamental' ? 'comportamental' : 'técnica'}</span>
    </label>
  `
    )
    .join('');
}

async function toggleVinculoCargoCompetencia(cargoId, competenciaId, marcado) {
  try {
    if (marcado) {
      await sbFetch('/cargo_competencias', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=minimal',
        body: JSON.stringify({ cargo_id: cargoId, competencia_id: competenciaId }),
      });
    } else {
      await sbFetch('/cargo_competencias?cargo_id=eq.' + cargoId + '&competencia_id=eq.' + competenciaId, {
        method: 'DELETE',
        prefer: 'return=minimal',
      });
    }
  } catch (err) {
    showToast('Não foi possível atualizar o vínculo: ' + (err.message || err));
    await renderVinculoLista(cargoId);
  }
}

async function aplicarSelecaoVinculos(modo) {
  const cargoId = document.getElementById('vinculo-select-cargo').value;
  if (!cargoId) return;

  const competencias = G.competencias.filter((c) => c.ativo);
  const checkboxes = [...document.querySelectorAll('#vinculo-lista-competencias input[data-competencia-id]')];
  const selecionadas = new Set(checkboxes.filter((input) => input.checked).map((input) => input.dataset.competenciaId));
  const alvo = new Set(selecionadas);

  if (modo === 'todas') {
    competencias.forEach((c) => alvo.add(String(c.id)));
  } else if (modo === 'nenhuma') {
    alvo.clear();
  } else {
    competencias.filter((c) => c.tipo === modo).forEach((c) => alvo.add(String(c.id)));
  }

  const adicionar = [...alvo].filter((id) => !selecionadas.has(id));
  const remover = [...selecionadas].filter((id) => !alvo.has(id));
  if (!adicionar.length && !remover.length) {
    showToast('A seleção já está atualizada.');
    return;
  }

  const barra = document.querySelector('#adm-panel-vinculo .vinculo-acoes');
  barra?.classList.add('is-loading');
  document.getElementById('vinculo-select-cargo').disabled = true;
  checkboxes.forEach((input) => {
    input.checked = alvo.has(input.dataset.competenciaId);
    input.disabled = true;
  });

  try {
    if (adicionar.length) {
      await sbFetch('/cargo_competencias', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=minimal',
        body: JSON.stringify(adicionar.map((competenciaId) => ({ cargo_id: cargoId, competencia_id: competenciaId }))),
      });
    }
    if (remover.length) {
      await sbFetch(
        '/cargo_competencias?cargo_id=eq.' + cargoId + '&competencia_id=in.(' + remover.join(',') + ')',
        { method: 'DELETE', prefer: 'return=minimal' }
      );
    }
    showToast(adicionar.length > 1 || remover.length > 1 ? 'Competências atualizadas.' : 'Competência atualizada.');
  } catch (err) {
    showToast('Não foi possível concluir a seleção: ' + (err.message || err));
  } finally {
    document.getElementById('vinculo-select-cargo').disabled = false;
    barra?.classList.remove('is-loading');
    await renderVinculoLista(cargoId);
  }
}
