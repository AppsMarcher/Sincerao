import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Código de 6 dígitos com Web Crypto (não Math.random) -- é o próprio
// controle de acesso da pesquisa, então a aleatoriedade tem que ser de
// verdade, não só "parece aleatório".
function gerarCodigo(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

function gerarLoteDeCodigos(quantidade: number): string[] {
  const codigos = new Set<string>();
  while (codigos.size < quantidade) codigos.add(gerarCodigo());
  return [...codigos];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Não autenticado.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: solicitante } = await adminClient
      .from('perfis')
      .select('papel')
      .eq('id', userData.user.id)
      .single();

    if (!solicitante || !['rh', 'admin'].includes(solicitante.papel)) {
      return json({ error: 'Acesso restrito ao RH.' }, 403);
    }

    const { nome, quantidade, ciclo_id } = await req.json();
    const adicionando = Boolean(ciclo_id);
    if ((!adicionando && !nome) || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 2000) {
      return json({ error: 'Informe um nome de ciclo e uma quantidade entre 1 e 2000.' }, 400);
    }

    // Com ciclo_id: acrescenta códigos a um ciclo aberto já existente.
    let ciclo: { id: string; total_codigos?: number } | null = null;
    if (adicionando) {
      const { data: existente } = await adminClient
        .from('clima_ciclos')
        .select('id, status, total_codigos')
        .eq('id', ciclo_id)
        .single();
      if (!existente) return json({ error: 'Ciclo não encontrado.' }, 404);
      if (existente.status !== 'aberto') return json({ error: 'Ciclo encerrado não aceita novos códigos.' }, 400);
      ciclo = existente;
    } else {
      const { data: novo, error: cicloError } = await adminClient
        .from('clima_ciclos')
        .insert({ nome, criado_por: userData.user.id })
        .select('id')
        .single();
      if (cicloError || !novo) return json({ error: cicloError?.message || 'Falha ao criar o ciclo.' }, 400);
      ciclo = novo;
    }

    // Tenta algumas vezes: colisão de código com o que já existe no banco é
    // rara (espaço de 1 milhão de códigos), mas não impossível.
    let codigos: string[] = [];
    let ultimoErro: string | null = null;
    for (let tentativa = 0; tentativa < 3 && codigos.length === 0; tentativa++) {
      const candidatos = gerarLoteDeCodigos(quantidade);
      const { error: tokensError } = await adminClient
        .from('clima_tokens')
        .insert(candidatos.map((codigo) => ({ ciclo_id: ciclo!.id, codigo })));
      if (!tokensError) {
        codigos = candidatos;
      } else {
        ultimoErro = tokensError.message;
      }
    }

    if (codigos.length === 0) {
      if (!adicionando) await adminClient.from('clima_ciclos').delete().eq('id', ciclo!.id);
      return json({ error: `Falha ao gerar os códigos: ${ultimoErro}` }, 500);
    }

    await adminClient
      .from('clima_ciclos')
      .update({ total_codigos: (ciclo!.total_codigos ?? 0) + codigos.length })
      .eq('id', ciclo!.id);

    return json({ ok: true, ciclo_id: ciclo!.id, codigos });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
