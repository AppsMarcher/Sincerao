// Gera o PDF de uma avaliação concluída e o envia ao gestor e colaborador.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}
function label(chave: string) { return chave.replace(/_/g, ' ').replace(/\b\w/g, (letra) => letra.toUpperCase()); }
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function relatorioHtml(av: any, notas: any[], plano: any[]) {
  const dados = av.dados || {};
  const perguntas = (grupo: string, campos: string[]) => {
    const respostas = dados[grupo] || {};
    const itens = campos.filter((campo) => respostas[campo]).map((campo) => `<section><h3>${esc(label(campo))}</h3><p>${esc(respostas[campo]).replace(/\n/g, '<br>')}</p></section>`).join('');
    return itens || '<p>Não há respostas registradas nesta etapa.</p>';
  };
  const pagina = (numero: number, titulo: string, conteudo: string) => `<article class="pagina"><header><span>Etapa ${numero} de 8</span><h1>${esc(titulo)}</h1><div class="meta"><strong>Colaborador:</strong> ${esc(av.colaborador?.nome)} &nbsp; | &nbsp; <strong>Gestor:</strong> ${esc(av.gestor?.nome)}<br><strong>Ciclo:</strong> ${esc(av.ciclo?.nome || '—')}</div></header>${conteudo}</article>`;
  const notasHtml = notas.length
    ? `<table><thead><tr><th>Competência</th><th>Nota</th><th>Comentários</th></tr></thead><tbody>${notas.map((nota) => `<tr><td>${esc(nota.competencia?.nome || '—')}</td><td>${esc(nota.nota)}</td><td>${esc(nota.comentario || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<p>Não há competências avaliadas.</p>';
  const planoHtml = plano.length
    ? `<table><thead><tr><th>Competência</th><th>Ação</th><th>Prazo</th><th>Responsável</th><th>Indicador de sucesso</th><th>Acompanhamento</th></tr></thead><tbody>${plano.map((linha) => `<tr><td>${esc(linha.competencia)}</td><td>${esc(linha.acao)}</td><td>${esc(linha.prazo)}</td><td>${esc(linha.responsavel)}</td><td>${esc(linha.indicador_sucesso)}</td><td>${esc(linha.acompanhamento)}</td></tr>`).join('')}</tbody></table>`
    : '<p>Não há plano de desenvolvimento registrado.</p>';
  const parecer = dados.parecer?.parecer_consenso || [dados.parecer?.parecer_gestor, dados.parecer?.parecer_colaborador].filter(Boolean).join('\n\n');
  const paginas = [
    pagina(1, 'Resultados do período', perguntas('resultados', ['entregas', 'impacto', 'metas_atingidas', 'metas_nao_atingidas', 'desafios', 'melhorias'])),
    pagina(2, 'Avaliação das competências', notasHtml),
    pagina(3, 'Feedback do gestor', perguntas('feedback_gestor', ['reconhecer', 'desenvolver', 'evoluiu', 'expectativas'])),
    pagina(4, 'Autoavaliação', perguntas('autoavaliacao', ['como_avalia', 'orgulho', 'dificuldades', 'faria_diferente', 'competencias_desenvolver', 'apoio_empresa', 'apoio_gestor'])),
    pagina(5, 'Feedback do colaborador ao gestor', perguntas('feedback_colaborador', ['suporte_gestor', 'gestor_faria_diferente', 'sobre_lideranca'])),
    pagina(6, 'Plano de desenvolvimento', planoHtml),
    pagina(7, 'Resumo da avaliação', perguntas('resumo', ['fortalezas', 'oportunidades', 'prioridade_desenvolvimento', 'treinamentos_recomendados'])),
    pagina(8, 'Parecer final', `<section><h3>Parecer do gestor e colaborador</h3><p>${esc(parecer || 'Não informado.').replace(/\n/g, '<br>')}</p></section><h2>Resultado final</h2><p><strong>Pontuação geral:</strong> ${esc(av.pontuacao_geral ?? '—')} / 5<br><strong>Percentual:</strong> ${esc(av.percentual ?? '—')}%<br><strong>Classificação:</strong> ${esc(av.classificacao || '—')}</p>`),
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { size:A4; margin:14mm; } *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#25212a;font-size:11px;line-height:1.45} .pagina{min-height:260mm;break-after:page}.pagina:last-child{break-after:auto} header{border-bottom:3px solid #5a0048;padding-bottom:14px;margin-bottom:22px} header span{color:#755a70;font-size:10px;text-transform:uppercase;font-weight:bold} h1{color:#5a0048;margin:4px 0 5px;font-size:24px} h2{color:#5a0048;margin:26px 0 10px;font-size:17px} h3{color:#5a0048;margin:16px 0 4px;font-size:12px} p{margin:0 0 8px}.meta{color:#655b67}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th{background:#5a0048;color:#fff;text-align:left}th,td{padding:7px;border:1px solid #ded7df;vertical-align:top}tr:nth-child(even){background:#faf7fa}section{break-inside:avoid}
  </style></head><body>${paginas.join('')}</body></html>`;
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
    const { avaliacao_id } = await req.json();
    if (!avaliacao_id) return json({ error: 'Avaliação não informada.' }, 400);

    const admin = createClient(url, service);
    const { data: av } = await admin.from('avaliacoes').select('id,status,dados,pontuacao_geral,percentual,classificacao,colaborador_id,gestor_id,colaborador:colaborador_id(nome,email),gestor:gestor_id(nome,email),ciclo:ciclo_id(nome)').eq('id', avaliacao_id).single();
    if (!av || av.status !== 'concluida') return json({ error: 'Somente avaliações concluídas podem ser enviadas.' }, 400);
    const { data: perfil } = await admin.from('perfis').select('papel').eq('id', user.id).single();
    const autorizado = user.id === av.gestor_id || ['rh', 'admin'].includes(perfil?.papel);
    if (!autorizado) return json({ error: 'Você não tem permissão para enviar esta avaliação.' }, 403);

    const [notasResult, planoResult] = await Promise.all([
      admin.from('avaliacao_notas').select('nota,comentario,competencia:competencia_id(nome)').eq('avaliacao_id', av.id),
      admin.from('avaliacao_plano_desenvolvimento').select('competencia,acao,prazo,responsavel,indicador_sucesso,acompanhamento').eq('avaliacao_id', av.id).order('ordem'),
    ]);
    const destinatarios = Array.from(new Set([av.colaborador?.email, av.gestor?.email].filter(Boolean)));
    if (!destinatarios.length) return json({ error: 'Os envolvidos não possuem e-mail cadastrado.' }, 400);
    const token = Deno.env.get('BROWSERLESS_API_TOKEN');
    if (!token) return json({ error: 'Geração de PDF não configurada (BROWSERLESS_API_TOKEN ausente).' }, 500);
    const pdf = await fetch(`https://production-sfo.browserless.io/pdf?token=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: relatorioHtml(av, notasResult.data || [], planoResult.data || []), options: { printBackground: true, format: 'A4', margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' } } }) });
    if (!pdf.ok) return json({ error: 'Não foi possível gerar o PDF da avaliação.' }, 502);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Envio de e-mail não configurado.' }, 500);
    const nomeArquivo = `avaliacao-${String(av.colaborador?.nome || 'colaborador').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    const envio = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('RESEND_FROM') || 'Sincerão <no-reply@marcher.com.br>', to: destinatarios, subject: `Avaliação concluída — ${av.colaborador?.nome || ''}`, html: `<p>Olá,</p><p>Segue em anexo a avaliação de desempenho concluída de <strong>${esc(av.colaborador?.nome)}</strong>.</p><p>Atenciosamente,<br>Sincerão</p>`, attachments: [{ filename: nomeArquivo, content: bytesToBase64(new Uint8Array(await pdf.arrayBuffer())), content_type: 'application/pdf' }] }) });
    if (!envio.ok) return json({ error: 'Não foi possível enviar o e-mail.' }, 502);
    return json({ ok: true });
  } catch (erro) { return json({ error: String(erro) }, 500); }
});
