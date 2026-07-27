// Gera o PDF de uma avaliação concluída (Chrome de verdade, via Browserless)
// e envia ao gestor e colaborador por e-mail (Resend). Mesmo padrão usado em
// VectonPlan/supabase/functions/send-report-email — replicado aqui de propósito
// (cada Edge Function é deployada e configurada isoladamente).
//
// Por que Browserless: garante fidelidade total ao HTML/CSS do relatório (o
// mesmo motor por trás do "Imprimir" do navegador). Por que Resend e não SMTP:
// Supabase Edge Functions bloqueiam as portas 25/587 — só HTTPS (443) sai.
//
// Pré-requisito (secrets do projeto Supabase do SINCERÃO — não herdam de
// VectonPlan/ExiladosApp mesmo sendo a mesma conta Browserless/Resend, secret
// é por projeto). Configurar uma vez pelo dashboard do Supabase (Project
// Settings > Edge Functions > Secrets) ou via CLI:
//   supabase secrets set BROWSERLESS_API_TOKEN=xxxxxxxxx
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
//   supabase secrets set RESEND_FROM="Sincerão Marcher <no-reply@marcher.com.br>"
// BROWSERLESS_API_TOKEN vem do dashboard de conta em browserless.io (mesma
// conta já usada pelo VectonPlan) — tem free tier limitado, verificar
// necessidade de plano pago com o uso somado dos apps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const LOGO_URL = 'https://sincerao.marcher.com.br/assets/logo-b.png';

// Espelha CAMPOS_ETAPA de js/core/constants.js — duplicado de propósito, igual o
// restante desta function, porque o deploy é manual e colado direto no painel.
const CAMPOS_ETAPA: Record<string, [string, string][]> = {
  resultados: [
    ['entregas', 'Quais foram as principais entregas realizadas pelo colaborador?'],
    ['impacto', 'Quais resultados geraram impacto para a equipe ou empresa?'],
    ['metas_atingidas', 'Quais metas foram alcançadas?'],
    ['metas_nao_atingidas', 'Houve alguma meta que não foi atingida? Se sim, por quê?'],
    ['desafios', 'Quais desafios foram enfrentados?'],
    ['melhorias', 'Quais melhorias ou iniciativas partiram deste colaborador?'],
  ],
  feedback_gestor: [
    ['reconhecer', 'Quais comportamentos devem ser reconhecidos? Cite exemplos.'],
    ['desenvolver', 'Quais comportamentos precisam ser desenvolvidos? Cite exemplos.'],
    ['evoluiu', 'O colaborador evoluiu em relação ao último ciclo?'],
    ['expectativas', 'Quais expectativas existem para o próximo período?'],
  ],
  autoavaliacao: [
    ['como_avalia', 'Como você avalia seu desempenho?'],
    ['orgulho', 'Do que você mais se orgulha?'],
    ['dificuldades', 'Quais dificuldades enfrentou?'],
    ['faria_diferente', 'O que faria diferente?'],
    ['competencias_desenvolver', 'Quais competências gostaria de desenvolver?'],
    ['apoio_empresa', 'Que apoio espera da empresa?'],
    ['apoio_gestor', 'Que apoio espera do gestor?'],
  ],
  feedback_colaborador: [
    ['suporte_gestor', 'O gestor forneceu o suporte necessário durante o período?'],
    ['gestor_faria_diferente', 'O que poderia fazer de forma diferente para apoiar seu desenvolvimento?'],
    ['sobre_lideranca', 'Há algo que gostaria de compartilhar sobre a liderança?'],
  ],
  resumo: [
    ['fortalezas', 'Principais fortalezas'],
    ['oportunidades', 'Principais oportunidades'],
    ['prioridade_desenvolvimento', 'Prioridade de desenvolvimento'],
    ['treinamentos_recomendados', 'Treinamentos recomendados'],
  ],
};

function corNota(nota: unknown) {
  const v = Number(nota);
  if (!Number.isFinite(v)) return '#9a95a0';
  if (v >= 4) return '#16a34a';
  if (v === 3) return '#5a0048';
  if (v === 2) return '#d97706';
  return '#dc2626';
}
function corClassificacao(label: string | null | undefined) {
  if (label === 'Excelente' || label === 'Acima das expectativas') return '#16a34a';
  if (label === 'Atende às expectativas') return '#5a0048';
  if (label === 'Em desenvolvimento') return '#d97706';
  if (label === 'Necessita desenvolvimento imediato') return '#dc2626';
  return '#5a0048';
}

const ESTILO = `
  *{box-sizing:border-box}
  body{margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;line-height:1.55;color:#2a2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pagina+.pagina{break-before:page;page-break-before:always}
  h1,h2,h3{font-family:'Space Grotesk','DM Sans',Arial,sans-serif;margin:0}
  p{margin:0 0 8px}

  .capa{min-height:248mm;border-radius:20px;background:#5a0048;color:#fff;padding:38px 34px;display:flex;flex-direction:column}
  .capa-topo{display:flex;justify-content:space-between;align-items:center}
  .capa-topo img{height:26px}
  .capa-topo span{font-size:9.5px;color:rgba(255,255,255,.65)}
  .capa-meio{margin:auto 0;padding:40px 0}
  .capa-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ff8fd6;margin-bottom:14px}
  .capa h1{font-size:38px;margin-bottom:10px}
  .capa-sub{font-size:13px;color:rgba(255,255,255,.75)}
  .capa-stats{display:flex;gap:14px;margin-top:auto}
  .capa-stats .stat{flex:1;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:16px 18px}
  .capa-stats .stat .label{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.65);font-weight:700;margin-bottom:8px}
  .capa-stats .stat .value{font-size:22px;font-weight:700;font-family:'Space Grotesk'}

  .banda{background:#5a0048;color:#fff;border-radius:16px;padding:20px 24px;margin-bottom:20px}
  .banda-topo{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .banda-topo img{height:20px}
  .etapa-pill{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.16);padding:5px 12px;border-radius:100px}
  .banda h1{font-size:21px;margin-bottom:10px}
  .banda .meta{display:flex;gap:20px;flex-wrap:wrap;font-size:10px;color:rgba(255,255,255,.78)}
  .banda .meta strong{color:#fff}

  .pergunta{border-left:3px solid #5a0048;background:#faf7fa;border-radius:0 10px 10px 0;padding:10px 14px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
  .pergunta h3{font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#5a0048;font-weight:700;margin-bottom:4px}
  .pergunta p{margin:0;color:#332e37}
  .vazio{color:#8a8390;font-style:italic}

  table{width:100%;border-collapse:separate;border-spacing:0;margin:4px 0 20px;border:1px solid #e6e0e8;border-radius:10px;overflow:hidden}
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  th{background:#5a0048;color:#fff;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;padding:9px 10px;font-weight:700}
  td{padding:9px 10px;border-top:1px solid #ede8ee;vertical-align:top}
  tbody tr:nth-child(even) td{background:#faf7fa}
  .nota-badge{display:inline-block;min-width:20px;text-align:center;padding:2px 9px;border-radius:100px;font-weight:700;color:#fff;font-size:10.5px}

  h2{font-size:16px;color:#5a0048;margin:24px 0 10px}

  .stats-final{display:flex;gap:12px;margin:12px 0 22px}
  .stats-final .stat{flex:1;background:#faf7fa;border:1px solid #e6e0e8;border-radius:12px;padding:14px 16px;text-align:center}
  .stats-final .stat .label{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#8a8390;font-weight:700;margin-bottom:6px}
  .stats-final .stat .value{font-size:21px;font-weight:700;font-family:'Space Grotesk';color:#5a0048}

  .rodape-pagina{margin-top:24px;padding-top:10px;border-top:1px solid #ede8ee;font-size:8.5px;color:#a49da8;text-align:center}
`;

function relatorioHtml(av: any, notas: any[], plano: any[]) {
  const dados = av.dados || {};
  const perguntas = (grupo: string) => {
    const respostas = dados[grupo] || {};
    const itens = (CAMPOS_ETAPA[grupo] || [])
      .filter(([campo]) => respostas[campo])
      .map(([campo, pergunta]) => `<div class="pergunta"><h3>${esc(pergunta)}</h3><p>${esc(respostas[campo]).replace(/\n/g, '<br>')}</p></div>`)
      .join('');
    return itens || '<p class="vazio">Não há respostas registradas nesta etapa.</p>';
  };
  const meta = `<div class="meta"><span>Colaborador <strong>${esc(av.colaborador?.nome)}</strong></span><span>Gestor <strong>${esc(av.gestor?.nome)}</strong></span><span>Ciclo <strong>${esc(av.ciclo?.nome || '—')}</strong></span></div>`;
  const pagina = (numero: number, titulo: string, conteudo: string) => `<article class="pagina"><header class="banda"><div class="banda-topo"><img src="${LOGO_URL}" alt="Sincerão"><span class="etapa-pill">Etapa ${numero} de 8</span></div><h1>${esc(titulo)}</h1>${meta}</header>${conteudo}<div class="rodape-pagina">Sincerão · Avaliação de Desempenho · Documento confidencial</div></article>`;
  const notasHtml = notas.length
    ? `<table><thead><tr><th>Competência</th><th>Nota</th><th>Comentários</th></tr></thead><tbody>${notas.map((nota) => `<tr><td>${esc(nota.competencia?.nome || '—')}</td><td><span class="nota-badge" style="background:${corNota(nota.nota)}">${esc(nota.nota ?? '—')}</span></td><td>${esc(nota.comentario || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Não há competências avaliadas.</p>';
  const planoHtml = plano.length
    ? `<table><thead><tr><th>Competência</th><th>Ação</th><th>Prazo</th><th>Responsável</th><th>Indicador de sucesso</th><th>Acompanhamento</th></tr></thead><tbody>${plano.map((linha) => `<tr><td>${esc(linha.competencia)}</td><td>${esc(linha.acao)}</td><td>${esc(linha.prazo)}</td><td>${esc(linha.responsavel)}</td><td>${esc(linha.indicador_sucesso)}</td><td>${esc(linha.acompanhamento)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Não há plano de desenvolvimento registrado.</p>';
  const parecer = dados.parecer?.parecer_consenso || [dados.parecer?.parecer_gestor, dados.parecer?.parecer_colaborador].filter(Boolean).join('\n\n');
  const dataHora = (data: string | null | undefined) => data ? new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Pendente';
  const cienciaHtml = `<h2>Ciência</h2><table><thead><tr><th>Participante</th><th>E-mail</th><th>Data e hora</th></tr></thead><tbody>${[
    ['Colaborador', av.colaborador?.nome, av.colaborador?.email, av.ciencia_colaborador_em],
    ['Gestor', av.gestor?.nome, av.gestor?.email, av.ciencia_gestor_em],
  ].map(([papel, nome, email, data]) => `<tr><td><strong>${esc(papel)}</strong><br>${esc(nome || 'Não identificado')}</td><td>${esc(email || '—')}</td><td>${esc(dataHora(data as string | null | undefined))}</td></tr>`).join('')}</tbody></table>`;

  const geradoEm = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const capa = `<article class="pagina"><div class="capa"><div class="capa-topo"><img src="${LOGO_URL}" alt="Sincerão"><span>Gerado em ${esc(geradoEm)}</span></div><div class="capa-meio"><div class="capa-eyebrow">Relatório de Avaliação de Desempenho</div><h1>${esc(av.colaborador?.nome || '—')}</h1><div class="capa-sub">Gestor: ${esc(av.gestor?.nome || '—')} &nbsp;·&nbsp; Ciclo: ${esc(av.ciclo?.nome || '—')}</div></div><div class="capa-stats"><div class="stat"><div class="label">Pontuação geral</div><div class="value">${esc(av.pontuacao_geral ?? '—')}/5</div></div><div class="stat"><div class="label">Percentual</div><div class="value">${esc(av.percentual ?? '—')}%</div></div><div class="stat"><div class="label">Classificação</div><div class="value">${esc(av.classificacao || '—')}</div></div></div></div></article>`;

  const paginas = [
    capa,
    pagina(1, 'Resultados do período', perguntas('resultados')),
    pagina(2, 'Avaliação das competências', notasHtml),
    pagina(3, 'Feedback do gestor', perguntas('feedback_gestor')),
    pagina(4, 'Autoavaliação', perguntas('autoavaliacao')),
    pagina(5, 'Feedback do colaborador ao gestor', perguntas('feedback_colaborador')),
    pagina(6, 'Plano de desenvolvimento', planoHtml),
    pagina(7, 'Resumo da avaliação', perguntas('resumo')),
    pagina(8, 'Parecer final', `<div class="pergunta"><h3>Parecer do gestor e colaborador</h3><p>${esc(parecer || 'Não informado.').replace(/\n/g, '<br>')}</p></div><h2>Resultado final</h2><div class="stats-final"><div class="stat"><div class="label">Pontuação geral</div><div class="value">${esc(av.pontuacao_geral ?? '—')}/5</div></div><div class="stat"><div class="label">Percentual</div><div class="value">${esc(av.percentual ?? '—')}%</div></div><div class="stat"><div class="label">Classificação</div><div class="value" style="color:${corClassificacao(av.classificacao)}">${esc(av.classificacao || '—')}</div></div></div>${cienciaHtml}`),
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap">
    <style>${ESTILO}</style></head><body>${paginas.join('')}</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const { avaliacao_id, modo } = await req.json();
    if (!avaliacao_id) return json({ error: 'Avaliação não informada.' }, 400);

    const admin = createClient(url, service);
    const { data: av } = await admin.from('avaliacoes').select('id,status,dados,pontuacao_geral,percentual,classificacao,ciencia_colaborador_em,ciencia_gestor_em,colaborador_id,gestor_id,colaborador:colaborador_id(nome,email),gestor:gestor_id(nome,email),ciclo:ciclo_id(nome)').eq('id', avaliacao_id).single();
    if (!av || av.status !== 'concluida') return json({ error: 'Somente avaliações concluídas podem ser enviadas.' }, 400);
    const { data: perfil } = await admin.from('perfis').select('papel').eq('id', user.id).single();
    // colaborador entra aqui porque a nova automação de fim de consenso
    // (ver registrarCiencia() em etapa-parecer.js) dispara o envio pra quem
    // completar a 2ª ciência, seja gestor ou colaborador -- antes só gestor/rh
    // tinham o botão manual, então essa checagem nunca precisou do colaborador.
    const autorizado = user.id === av.gestor_id || user.id === av.colaborador_id || ['rh', 'admin'].includes(perfil?.papel);
    if (!autorizado) return json({ error: 'Você não tem permissão para enviar esta avaliação.' }, 403);

    const [notasResult, planoResult] = await Promise.all([
      admin.from('avaliacao_notas').select('nota,comentario,competencia:competencia_id(nome)').eq('avaliacao_id', av.id),
      admin.from('avaliacao_plano_desenvolvimento').select('competencia,acao,prazo,responsavel,indicador_sucesso,acompanhamento').eq('avaliacao_id', av.id).order('ordem'),
    ]);
    const token = Deno.env.get('BROWSERLESS_API_TOKEN');
    if (!token) return json({ error: 'Geração de PDF não configurada (BROWSERLESS_API_TOKEN ausente).' }, 500);
    const pdf = await fetch(`https://production-sfo.browserless.io/pdf?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: relatorioHtml(av, notasResult.data || [], planoResult.data || []),
        options: {
          printBackground: true,
          format: 'A4',
          margin: { top: '14mm', right: '14mm', bottom: '20mm', left: '14mm' },
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate: '<div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#a49da8;text-align:center;padding:0 14mm;">Sincerão · Avaliação de Desempenho · Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
        },
      }),
    });
    if (!pdf.ok) return json({ error: 'Não foi possível gerar o PDF da avaliação.' }, 502);
    const nomeArquivo = `avaliacao-${String(av.colaborador?.nome || 'colaborador').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());

    // Modo "baixar" -- só gera e devolve o arquivo pro navegador, sem mandar
    // e-mail nenhum (usado pelo botão de download no dashboard e na capa da
    // avaliação concluída). Não exige destinatário nem RESEND_API_KEY.
    if (modo === 'download') {
      return new Response(pdfBytes, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nomeArquivo}"` },
      });
    }

    const destinatariosPorEmail = new Map<string, { nome: string; email: string }>();
    for (const pessoa of [av.colaborador, av.gestor]) {
      if (pessoa?.email) destinatariosPorEmail.set(pessoa.email.toLowerCase(), { nome: pessoa.nome, email: pessoa.email });
    }
    const destinatarios = Array.from(destinatariosPorEmail.values());
    if (!destinatarios.length) return json({ error: 'Os envolvidos não possuem e-mail cadastrado.' }, 400);
    // RH entra em cópia (papel 'rh', não 'admin') pra ter visibilidade da
    // avaliação concluída, já que a ciência do RH deixou de ser exigida no
    // fluxo -- não são "envolvidos" (não têm o botão personalizado "Olá, X"),
    // então recebem num e-mail à parte, best-effort (não falha o envio principal).
    const { data: perfisRh } = await admin.from('perfis').select('email').eq('papel', 'rh').eq('ativo', true);
    const emailsRh = Array.from(new Set((perfisRh || []).map((p) => p.email).filter(Boolean)));
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Envio de e-mail não configurado.' }, 500);
    const pdfBase64 = bytesToBase64(pdfBytes);
    const corpoEmail = (nomeDestinatario: string) => `<p>Olá, ${esc(nomeDestinatario)},</p><p>Segue em anexo a avaliação de desempenho relativa ao ciclo <strong>${esc(av.ciclo?.nome || '—')}</strong> de <strong>${esc(av.colaborador?.nome)}</strong>, realizada em consenso com o gestor <strong>${esc(av.gestor?.nome)}</strong>.</p><p>Atenciosamente,<br>Sincerão Marcher</p>`;
    const envios = await Promise.all(destinatarios.map((pessoa) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') || 'Sincerão Marcher <no-reply@marcher.com.br>',
        to: [pessoa.email],
        subject: `Avaliação concluída — ${av.colaborador?.nome || ''}`,
        html: corpoEmail(pessoa.nome),
        attachments: [{ filename: nomeArquivo, content: pdfBase64, content_type: 'application/pdf' }],
      }),
    })));
    if (envios.some((envio) => !envio.ok)) return json({ error: 'Não foi possível enviar o e-mail.' }, 502);

    if (emailsRh.length) {
      const corpoEmailRh = `<p>Olá,</p><p>Segue em anexo, para conhecimento do RH, a avaliação de desempenho relativa ao ciclo <strong>${esc(av.ciclo?.nome || '—')}</strong> de <strong>${esc(av.colaborador?.nome)}</strong>, concluída em consenso com o gestor <strong>${esc(av.gestor?.nome)}</strong>.</p><p>Atenciosamente,<br>Sincerão Marcher</p>`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('RESEND_FROM') || 'Sincerão Marcher <no-reply@marcher.com.br>',
          to: emailsRh,
          subject: `Avaliação concluída — ${av.colaborador?.nome || ''}`,
          html: corpoEmailRh,
          attachments: [{ filename: nomeArquivo, content: pdfBase64, content_type: 'application/pdf' }],
        }),
      }).catch(() => null);
    }

    return json({ ok: true });
  } catch (erro) { return json({ error: String(erro) }, 500); }
});
