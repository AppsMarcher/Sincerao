// Página pública /clima. Independente de js/core/* de propósito: não
// reaproveita o client/estado global do app autenticado, pra essa página
// nunca ficar acoplada a uma sessão de login (ela nunca loga ninguém).
(function () {
  var sb = window.supabase.createClient(window.AVD_SUPABASE.projectUrl, window.AVD_SUPABASE.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  var SCALE_LABELS = ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'];

  // Montado a partir de clima_perguntas (editável pelo RH) quando o código é validado.
  var sections = [];

  function buildSections(rows) {
    var out = [];
    rows.forEach(function (r) {
      var last = out[out.length - 1];
      if (!last || last.title !== r.secao) {
        last = { title: r.secao, questions: [] };
        out.push(last);
      }
      last.questions.push({ id: r.id, text: r.texto, tipo: r.tipo, left: r.rotulo_esq || '', right: r.rotulo_dir || '' });
    });
    return out;
  }

  var answers = {};
  var cicloId = null;

  var telaHero = document.getElementById('tela-hero');
  var telaApp = document.getElementById('tela-app');
  var card = document.getElementById('card');
  var progressWrap = document.getElementById('progress-wrap');
  var progressFill = document.getElementById('progress-fill');
  var progressCount = document.getElementById('progress-count');
  var toastEl = document.getElementById('toast');

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function checkIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  }

  document.getElementById('btn-comecar').addEventListener('click', function () {
    telaHero.hidden = true;
    telaApp.hidden = false;
    renderCodeScreen();
    window.scrollTo(0, 0);
  });

  var MENSAGENS_ERRO = {
    codigo_invalido: 'Código inválido. Confira os 6 dígitos do seu cartão.',
    codigo_usado: 'Este código já foi utilizado. Pegue um novo cartão na urna.',
    ciclo_encerrado: 'Esta pesquisa já foi encerrada. Obrigado pelo interesse.',
    muitas_tentativas: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  };

  function renderCodeScreen(preservedValue, errorMsg) {
    progressWrap.hidden = true;
    card.innerHTML =
      '<div class="clima-eyebrow">Acesso</div>' +
      '<h2 class="clima-section-title">Digite o código do seu cartão</h2>' +
      '<p class="muted" style="margin:6px 0 0;">Código de 6 dígitos impresso no cartão que você retirou na urna.</p>' +
      '<input id="code-input" class="clima-code-input" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="000000" value="' + (preservedValue ? esc(preservedValue) : '') + '">' +
      (errorMsg
        ? '<p class="clima-code-error"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path></svg><span>' + esc(errorMsg) + '</span></p>'
        : '<p class="clima-code-hint">Não tem um cartão? Peça um na urna antes de começar.</p>') +
      '<div class="clima-actions">' +
        '<button class="btn-link" id="btn-voltar-hero">Voltar</button>' +
        '<button class="btn-primary" id="btn-validar">Validar código</button>' +
      '</div>';

    document.getElementById('btn-voltar-hero').addEventListener('click', function () {
      telaApp.hidden = true;
      telaHero.hidden = false;
      window.scrollTo(0, 0);
    });
    var input = document.getElementById('code-input');
    input.focus();
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') validar(); });
    document.getElementById('btn-validar').addEventListener('click', validar);

    async function validar() {
      var valor = input.value.trim();
      if (valor.length !== 6 || !/^\d{6}$/.test(valor)) {
        renderCodeScreen(valor, 'Digite os 6 dígitos do código do cartão.');
        return;
      }
      var botao = document.getElementById('btn-validar');
      botao.disabled = true;
      botao.textContent = 'Validando…';

      // Carrega as perguntas ANTES de consumir o código: se falhar, o cartão não é gasto.
      var perg = await sb.from('clima_perguntas').select('id,secao,texto,tipo,rotulo_esq,rotulo_dir').eq('ativo', true).order('ordem').order('id');
      if (perg.error || !perg.data || !perg.data.length) {
        renderCodeScreen(valor, 'Não foi possível carregar as perguntas agora. Tente novamente em instantes.');
        return;
      }
      sections = buildSections(perg.data);

      var { data, error } = await sb.rpc('clima_validar_e_consumir_codigo', { p_codigo: valor });
      if (error) {
        var chave = (error.message || '').match(/codigo_invalido|codigo_usado|ciclo_encerrado|muitas_tentativas/);
        renderCodeScreen(valor, (chave && MENSAGENS_ERRO[chave[0]]) || 'Não foi possível validar o código agora. Tente novamente.');
        return;
      }

      cicloId = data;
      renderSection(0);
      window.scrollTo(0, 0);
    }
  }

  function sectionComplete(idx) {
    return sections[idx].questions.every(function (q) { return answers[q.id] !== undefined; });
  }

  function renderSection(idx) {
    var sec = sections[idx];
    progressWrap.hidden = false;
    progressFill.style.width = (idx / sections.length * 100) + '%';
    progressCount.textContent = 'Etapa ' + (idx + 1) + '/' + sections.length;

    var qHtml = sec.questions.map(function (q) {
      if (q.tipo === 'likert') {
        var btns = SCALE_LABELS.map(function (label, i) {
          var val = i + 1;
          var sel = answers[q.id] === val ? ' selected' : '';
          return '<button class="clima-likert-btn' + sel + '" data-q="' + q.id + '" data-v="' + val + '" title="' + esc(label) + '">' + val + '</button>';
        }).join('');
        return '<div class="clima-question"><div class="qtext"><span class="clima-qnum">' + String(q.id).padStart(2, '0') + '</span>' + esc(q.text) + '</div><div class="clima-likert-row">' + btns + '</div></div>';
      }
      var nbtns = '';
      for (var v = 0; v <= 10; v++) {
        var sel2 = answers[q.id] === v ? ' selected' : '';
        nbtns += '<button class="clima-nps-btn' + sel2 + '" data-q="' + q.id + '" data-v="' + v + '">' + v + '</button>';
      }
      return '<div class="clima-question"><div class="qtext"><span class="clima-qnum">' + String(q.id).padStart(2, '0') + '</span>' + esc(q.text) + '</div><div class="clima-nps-row">' + nbtns + '</div><div class="clima-nps-labels"><span>' + esc(q.left) + '</span><span>' + esc(q.right) + '</span></div></div>';
    }).join('');

    var legend = sec.questions.some(function (q) { return q.tipo === 'likert'; })
      ? '<div class="clima-scale-legend">' + SCALE_LABELS.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</div>'
      : '';
    var isLast = idx === sections.length - 1;

    card.innerHTML =
      '<div class="clima-eyebrow">Bloco ' + (idx + 1) + ' de ' + sections.length + '</div>' +
      '<h2 class="clima-section-title">' + esc(sec.title) + '</h2>' +
      legend +
      '<div class="clima-questions">' + qHtml + '</div>' +
      '<div class="clima-actions">' +
        '<button class="btn-link" id="btn-back">Voltar</button>' +
        '<button class="btn-primary" id="btn-next"' + (sectionComplete(idx) ? '' : ' disabled') + '>' + (isLast ? 'Enviar respostas' : 'Próxima') + '</button>' +
      '</div>';

    card.querySelectorAll('.clima-likert-btn, .clima-nps-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        answers[Number(btn.getAttribute('data-q'))] = Number(btn.getAttribute('data-v'));
        renderSection(idx);
      });
    });
    document.getElementById('btn-back').addEventListener('click', function () {
      if (idx === 0) renderCodeScreen();
      else renderSection(idx - 1);
      window.scrollTo(0, 0);
    });
    document.getElementById('btn-next').addEventListener('click', async function () {
      if (!sectionComplete(idx)) return;
      if (!isLast) { renderSection(idx + 1); window.scrollTo(0, 0); return; }

      var botao = document.getElementById('btn-next');
      botao.disabled = true;
      botao.textContent = 'Enviando…';

      var respostas = {};
      sections.forEach(function (s) { s.questions.forEach(function (q) { respostas['q' + q.id] = answers[q.id]; }); });

      var { error } = await sb.from('clima_respostas').insert({ ciclo_id: cicloId, respostas: respostas });
      if (error) {
        toast('Não foi possível enviar agora. Tente novamente em instantes.');
        botao.disabled = false;
        botao.textContent = 'Enviar respostas';
        return;
      }

      renderThanks();
      window.scrollTo(0, 0);
    });
  }

  function renderThanks() {
    progressWrap.hidden = true;
    card.innerHTML =
      '<div class="clima-thanks-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></div>' +
      '<h2 class="clima-section-title">Resposta enviada</h2>' +
      '<p class="muted" style="margin:8px 0 0;line-height:1.55;">Obrigado pelo seu tempo. Sua resposta foi registrada de forma 100% anônima.</p>' +
      '<ul class="clima-anon-list" style="margin-top:18px;">' +
        '<li style="color:var(--text);">' + checkIcon() + '<span>Este código de acesso não pode ser reaberto e não fica associado à sua resposta.</span></li>' +
        '<li style="color:var(--text);">' + checkIcon() + '<span>Nenhuma pessoa da empresa consegue ligar esta resposta a você.</span></li>' +
        '<li style="color:var(--text);">' + checkIcon() + '<span>Os resultados saem em relatório agregado, com no mínimo 5 respostas.</span></li>' +
      '</ul>';
  }
})();
