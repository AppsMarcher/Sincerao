import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[char] || char));

type Pendencias = {
  gestor_id: string;
  total: number;
  rascunho: number;
  aguardando_autoavaliacao: number;
  aguardando_alinhamento: number;
  aguardando_ciencia: number;
};

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function diferencaDias(dataFim: string, hoje: string) {
  const fim = Date.parse(`${dataFim}T12:00:00Z`);
  const referencia = Date.parse(`${hoje}T12:00:00Z`);
  return Math.round((fim - referencia) / 86400000);
}

function marcoAutomatico(diasRestantes: number) {
  if ([7, 3, 1].includes(diasRestantes)) return `d-${diasRestantes}`;
  if (diasRestantes === 0) return 'ultimo-dia';
  const atraso = Math.abs(diasRestantes);
  if (diasRestantes < 0 && (atraso === 1 || atraso % 3 === 0)) return `atrasado-${atraso}`;
  return null;
}

function resumoFases(p: Pendencias) {
  const itens = [
    [p.rascunho, 'em preparação pelo gestor'],
    [p.aguardando_autoavaliacao, 'aguardando autoavaliação'],
    [p.aguardando_alinhamento, 'aguardando alinhamento'],
    [p.aguardando_ciencia, 'aguardando aceite/ciência'],
  ].filter(([quantidade]) => Number(quantidade) > 0);
  return itens.map(([quantidade, rotulo]) => `${quantidade} ${rotulo}`).join(', ');
}

function textos(ciclo: { nome: string; data_fim: string }, p: Pendencias, diasRestantes: number) {
  const prazo = ciclo.data_fim.split('-').reverse().join('/');
  const fases = resumoFases(p);
  if (diasRestantes < 0) {
    const atraso = Math.abs(diasRestantes);
    return {
      titulo: `Avaliações pendentes — ciclo encerrado`,
      mensagem: `O ciclo ${ciclo.nome} encerrou em ${prazo} e você ainda possui ${p.total} ${p.total === 1 ? 'avaliação pendente' : 'avaliações pendentes'} (${fases}). Acesse o Sincerão para regularizar.`,
      prioridade: 'urgente',
    };
  }
  const quando = diasRestantes === 0
    ? 'termina hoje'
    : `termina em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`;
  return {
    titulo: `Lembrete: ${p.total} ${p.total === 1 ? 'avaliação pendente' : 'avaliações pendentes'}`,
    mensagem: `O ciclo ${ciclo.nome} ${quando}, em ${prazo}. Você possui ${p.total} ${p.total === 1 ? 'avaliação pendente' : 'avaliações pendentes'} (${fases}). Acesse o Sincerão para continuar.`,
    prioridade: diasRestantes <= 1 ? 'urgente' : 'atencao',
  };
}

function emailHtml(nome: string, titulo: string, mensagem: string) {
  return `<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#1e1e1e"><img src="https://sincerao.marcher.com.br/assets/logo.png" alt="Sincerão" width="176"><p>Olá, <strong>${esc(nome)}</strong>!</p><h1 style="font-size:24px;color:#5a0048">${esc(titulo)}</h1><p style="line-height:1.6">${esc(mensagem)}</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0"><tr><td bgcolor="#5a0048" style="border-radius:100px"><a href="https://sincerao.marcher.com.br" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;text-decoration:none;color:#fff">Abrir o Sincerão</a></td></tr></table><p style="font-size:12px;color:#666070">Este aviso não contém notas nem informações confidenciais da avaliação.</p></main>`;
}

async function enviarEmail(apiKey: string | undefined, destinatario: string | null, nome: string, titulo: string, mensagem: string) {
  if (!apiKey) return { enviado: false, erro: 'Envio de e-mail não configurado.' };
  if (!destinatario) return { enviado: false, erro: 'Gestor sem e-mail cadastrado.' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') || 'Sincerão Marcher <no-reply@marcher.com.br>',
      to: [destinatario],
      subject: titulo,
      html: emailHtml(nome, titulo, mensagem),
    }),
  });
  if (response.ok) return { enviado: true, erro: null };
  console.error('Resend rejeitou lembrete:', response.status, await response.text().catch(() => ''));
  return { enviado: false, erro: 'O e-mail não pôde ser enviado.' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, service);
    const payload = await req.json().catch(() => ({}));
    const modo = payload.modo === 'automatico' ? 'automatico' : 'manual';
    let solicitanteId: string | null = null;

    if (modo === 'automatico') {
      const segredo = Deno.env.get('CRON_SECRET');
      if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
        return json({ error: 'Execução automática não autorizada.' }, 401);
      }
    } else {
      const userClient = createClient(url, anon, {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: perfil } = await admin.from('perfis').select('papel').eq('id', user.id).single();
      if (!['rh', 'admin', 'diretoria'].includes(perfil?.papel)) {
        return json({ error: 'Disparo não autorizado.' }, 403);
      }
      solicitanteId = user.id;
      if (!payload.ciclo_id) return json({ error: 'Selecione um ciclo.' }, 400);
      if (!Array.isArray(payload.gestor_ids) || !payload.gestor_ids.length) {
        return json({ error: 'Selecione ao menos um gestor.' }, 400);
      }
    }

    let ciclosQuery = admin.from('ciclos_avaliacao').select('id,nome,data_inicio,data_fim');
    if (modo === 'manual') ciclosQuery = ciclosQuery.eq('id', payload.ciclo_id);
    const { data: ciclos, error: ciclosError } = await ciclosQuery;
    if (ciclosError) throw ciclosError;

    const hoje = hojeSaoPaulo();
    const resultados: unknown[] = [];
    const gestoresSelecionados = new Set<string>(Array.isArray(payload.gestor_ids) ? payload.gestor_ids : []);

    for (const ciclo of ciclos || []) {
      if (modo === 'automatico' && ciclo.data_inicio > hoje) continue;
      const diasRestantes = diferencaDias(ciclo.data_fim, hoje);
      if (modo === 'automatico' && diasRestantes < -30) continue;
      const marco = modo === 'automatico' ? marcoAutomatico(diasRestantes) : null;
      if (modo === 'automatico' && !marco) continue;

      if (modo === 'automatico') {
        const { data: existente } = await admin.from('notificacao_disparos')
          .select('id').eq('ciclo_id', ciclo.id).eq('modo', 'automatico').eq('marco', marco).maybeSingle();
        if (existente) continue;
      }

      const { data: avaliacoes, error: avaliacoesError } = await admin.from('avaliacoes')
        .select('gestor_id,status').eq('ciclo_id', ciclo.id).neq('status', 'concluida');
      if (avaliacoesError) throw avaliacoesError;

      const porGestor = new Map<string, Pendencias>();
      for (const avaliacao of avaliacoes || []) {
        if (modo === 'manual' && gestoresSelecionados.size && !gestoresSelecionados.has(avaliacao.gestor_id)) continue;
        const atual = porGestor.get(avaliacao.gestor_id) || {
          gestor_id: avaliacao.gestor_id, total: 0, rascunho: 0,
          aguardando_autoavaliacao: 0, aguardando_alinhamento: 0, aguardando_ciencia: 0,
        };
        atual.total += 1;
        if (avaliacao.status in atual) (atual as unknown as Record<string, number>)[avaliacao.status] += 1;
        porGestor.set(avaliacao.gestor_id, atual);
      }
      if (!porGestor.size) continue;

      const ids = [...porGestor.keys()];
      const { data: pessoas, error: pessoasError } = await admin.from('perfis')
        .select('id,nome,email').in('id', ids);
      if (pessoasError) throw pessoasError;
      const pessoaPorId = new Map((pessoas || []).map((pessoa) => [pessoa.id, pessoa]));

      const { data: disparo, error: disparoError } = await admin.from('notificacao_disparos').insert({
        ciclo_id: ciclo.id, modo, marco, solicitado_por: solicitanteId, total_destinatarios: ids.length,
      }).select('id').single();
      if (disparoError) throw disparoError;

      let sucessos = 0;
      let falhas = 0;
      let ignorados = 0;
      const detalhes = [];
      for (const p of porGestor.values()) {
        const pessoa = pessoaPorId.get(p.gestor_id);
        if (!pessoa) {
          falhas += 1;
          detalhes.push({ disparo_id: disparo.id, gestor_id: p.gestor_id, pendencias: p.total, erro: 'Gestor não encontrado.' });
          continue;
        }

        if (modo === 'manual') {
          const limite = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
          const { data: recente } = await admin.from('notificacoes').select('id').eq('destinatario_id', p.gestor_id)
            .eq('ciclo_id', ciclo.id).eq('tipo', 'lembrete_gestor').gte('created_at', limite).limit(1);
          if (recente?.length) {
            ignorados += 1;
            detalhes.push({ disparo_id: disparo.id, gestor_id: p.gestor_id, pendencias: p.total, ignorado: true, erro: 'Já notificado nas últimas 4 horas.' });
            continue;
          }
        }

        const conteudo = textos(ciclo, p, diasRestantes);
        const { error: notificacaoError } = await admin.from('notificacoes').insert({
          destinatario_id: p.gestor_id,
          ciclo_id: ciclo.id,
          tipo: 'lembrete_gestor',
          categoria: 'prazo',
          prioridade: conteudo.prioridade,
          titulo: conteudo.titulo,
          mensagem: conteudo.mensagem,
          criada_por: solicitanteId,
          dados: { destino: 'dashboard', ciclo_id: ciclo.id, pendencias: p.total, marco },
        });
        if (notificacaoError) {
          falhas += 1;
          detalhes.push({ disparo_id: disparo.id, gestor_id: p.gestor_id, pendencias: p.total, erro: notificacaoError.message });
          continue;
        }

        sucessos += 1;
        const email = await enviarEmail(Deno.env.get('RESEND_API_KEY'), pessoa.email, pessoa.nome, conteudo.titulo, conteudo.mensagem);
        detalhes.push({
          disparo_id: disparo.id, gestor_id: p.gestor_id, pendencias: p.total,
          email_enviado: email.enviado, erro: email.erro,
        });
      }

      if (detalhes.length) {
        const { error: detalhesError } = await admin.from('notificacao_disparo_destinatarios').insert(detalhes);
        if (detalhesError) console.error('Falha ao registrar detalhes do disparo:', detalhesError);
      }
      await admin.from('notificacao_disparos').update({
        total_sucessos: sucessos, total_falhas: falhas, total_ignorados: ignorados,
      }).eq('id', disparo.id);
      resultados.push({ ciclo_id: ciclo.id, ciclo: ciclo.nome, disparo_id: disparo.id, sucessos, falhas, ignorados });
    }

    const totais = resultados.reduce((acc: Record<string, number>, item: any) => {
      acc.sucessos += item.sucessos; acc.falhas += item.falhas; acc.ignorados += item.ignorados; return acc;
    }, { sucessos: 0, falhas: 0, ignorados: 0 });
    return json({ ok: true, ...totais, resultados });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
