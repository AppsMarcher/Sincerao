import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function emailHtml(titulo: string, mensagem: string) {
  return `<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#1e1e1e"><img src="https://sincerao.marcher.com.br/assets/logo.png" alt="Sincerão" width="176"><h1 style="color:#5a0048">${titulo}</h1><p style="line-height:1.6">${mensagem}</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0"><tr><td align="center" bgcolor="#5a0048" style="border-radius:100px"><a href="https://sincerao.marcher.com.br" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff">Abrir o Sincerão</a></td></tr></table></main>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const { avaliacao_id, evento } = await req.json();
    const admin = createClient(url, service);
    const { data: av } = await admin.from('avaliacoes').select('gestor_id,colaborador_id,status, colaborador:colaborador_id(nome), gestor:gestor_id(nome)').eq('id', avaliacao_id).single();
    if (!av || !['fase_1_enviada','fase_2_devolvida','avaliacao_concluida'].includes(evento)) return json({ error: 'Evento inválido.' }, 400);
    const permitido = (evento === 'fase_1_enviada' && user.id === av.gestor_id && av.status === 'aguardando_autoavaliacao') ||
      (evento === 'fase_2_devolvida' && user.id === av.colaborador_id && av.status === 'aguardando_alinhamento') ||
      (evento === 'avaliacao_concluida' && user.id === av.gestor_id && av.status === 'concluida');
    if (!permitido) return json({ error: 'Transição não autorizada.' }, 403);
    const { data: pessoas } = await admin.from('perfis').select('email,nome').in('id',[av.gestor_id,av.colaborador_id]);
    const textos: Record<string, [string,string]> = {
      fase_1_enviada: ['Fase 1 concluída','A avaliação foi enviada para a autoavaliação do colaborador.'],
      fase_2_devolvida: ['Fase 2 concluída','A autoavaliação foi devolvida e o plano de desenvolvimento está disponível.'],
      avaliacao_concluida: ['Avaliação concluída','Os dois pareceres foram registrados e a avaliação foi encerrada.']
    };
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return json({ ok: true, email: 'não configurado' });
    const [titulo,mensagem] = textos[evento];
    const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${key}`,'Content-Type':'application/json' }, body:JSON.stringify({ from:Deno.env.get('RESEND_FROM') || 'Sincerão <no-reply@marcher.com.br>', to:(pessoas || []).map(p=>p.email), subject:titulo, html:emailHtml(titulo,mensagem) }) });
    if (!response.ok) return json({ error: 'Não foi possível enviar o e-mail.' }, 502);
    return json({ ok:true });
  } catch (e) { return json({ error: String(e) }, 500); }
});
