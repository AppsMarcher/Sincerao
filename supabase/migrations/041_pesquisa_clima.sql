-- Pesquisa de Clima Organizacional -- anônima por desenho.
--
-- Estas tabelas NUNCA têm foreign key para perfis/auth.users. Isso é
-- proposital: o objetivo não é só "RLS impede o select", é que a resposta em
-- si é estruturalmente impossível de ligar a uma pessoa, mesmo com acesso de
-- superusuário ao banco. O único vínculo que existe é resposta -> ciclo.
--
-- Fluxo: RH gera um lote de códigos de 6 dígitos por ciclo (edge function
-- gerar-tokens-clima). Os códigos são impressos em cartões avulsos e
-- distribuídos fisicamente, embaralhados, sem registro de quem pegou qual.
-- O colaborador digita o código em /clima (sem login); o código é validado e
-- marcado como usado ANTES de liberar o questionário (clima_tokens nunca é
-- gravável direto pelo cliente -- só via função abaixo). O envio da resposta
-- carrega só o ciclo_id, nunca o código nem qualquer identificador.
--
-- Resultados só saem agregados (clima_resultados_agregados), sempre da
-- empresa inteira -- a função não tem capacidade de recortar por área/turno/
-- cargo, e clima_respostas não tem NENHUMA policy de select, nem para
-- rh/admin: a única porta de leitura é essa função.

create table clima_ciclos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  status text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  total_codigos int not null default 0,
  total_respondidos int not null default 0,
  criado_por uuid,
  created_at timestamptz not null default now(),
  encerrado_em timestamptz
);

create table clima_tokens (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references clima_ciclos(id) on delete cascade,
  codigo text not null unique,
  status text not null default 'disponivel' check (status in ('disponivel', 'usado', 'invalidado')),
  usado_em timestamptz,
  created_at timestamptz not null default now()
);
create index clima_tokens_ciclo_id_idx on clima_tokens(ciclo_id);

-- Sem token_id, sem qualquer coluna de identidade -- de propósito.
create table clima_respostas (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references clima_ciclos(id) on delete cascade,
  respostas jsonb not null check (jsonb_typeof(respostas) = 'object'),
  created_at timestamptz not null default now()
);
create index clima_respostas_ciclo_id_idx on clima_respostas(ciclo_id);

-- Limite de tentativas por IP na validação de código (função abaixo).
create table clima_tentativas_codigo (
  id bigint generated always as identity primary key,
  ip text not null,
  tentado_em timestamptz not null default now()
);
create index clima_tentativas_codigo_ip_idx on clima_tentativas_codigo(ip, tentado_em);

-- =========================================================
-- RLS
-- =========================================================

alter table clima_ciclos enable row level security;
alter table clima_tokens enable row level security;
alter table clima_respostas enable row level security;
alter table clima_tentativas_codigo enable row level security;

-- Ciclos e tokens não são dado anônimo (são metadado de gestão) -- ok
-- reaproveitar sou_rh_ou_admin() aqui, igual o resto do app.
create policy clima_ciclos_rh_admin on clima_ciclos for all
  using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

-- Só leitura para rh/admin (ex: "ver cartões"). Nenhuma policy de
-- insert/update/delete: isso só acontece dentro das funções abaixo, que
-- rodam como dono da tabela (security definer) e por isso não passam pelo
-- RLS -- o cliente nunca escreve direto em clima_tokens.
create policy clima_tokens_select_rh_admin on clima_tokens for select
  using (sou_rh_ou_admin());

-- Nenhuma policy de select aqui -- nem para rh/admin. A única leitura
-- possível é agregada, via clima_resultados_agregados().
create policy clima_respostas_insert_anon on clima_respostas for insert
  to anon with check (true);

-- clima_tentativas_codigo não tem nenhuma policy: só a função abaixo
-- (security definer) toca essa tabela.

-- =========================================================
-- Funções
-- =========================================================

-- Valida um código de acesso e o consome atomicamente, antes de liberar o
-- questionário. Chamada sem login (role anon), da página pública /clima.
create or replace function clima_validar_e_consumir_codigo(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ip text;
  v_tentativas int;
  v_token clima_tokens%rowtype;
  v_ciclo_status text;
begin
  v_ip := coalesce(
    split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
    'desconhecido'
  );

  delete from clima_tentativas_codigo where tentado_em < now() - interval '1 day';

  select count(*) into v_tentativas
  from clima_tentativas_codigo
  where ip = v_ip and tentado_em > now() - interval '5 minutes';

  if v_tentativas >= 8 then
    raise exception 'muitas_tentativas';
  end if;

  insert into clima_tentativas_codigo (ip) values (v_ip);

  select * into v_token from clima_tokens where codigo = p_codigo for update;

  if not found then
    raise exception 'codigo_invalido';
  end if;

  if v_token.status = 'usado' then
    raise exception 'codigo_usado';
  end if;

  if v_token.status = 'invalidado' then
    raise exception 'codigo_invalido';
  end if;

  select status into v_ciclo_status from clima_ciclos where id = v_token.ciclo_id;
  if v_ciclo_status is distinct from 'aberto' then
    raise exception 'ciclo_encerrado';
  end if;

  update clima_tokens set status = 'usado', usado_em = now() where id = v_token.id;
  update clima_ciclos set total_respondidos = total_respondidos + 1 where id = v_token.ciclo_id;

  return v_token.ciclo_id;
end $$;

revoke all on function clima_validar_e_consumir_codigo(text) from public;
grant execute on function clima_validar_e_consumir_codigo(text) to anon;

-- Encerra um ciclo: invalida todo código ainda não usado (pra não continuar
-- valendo nem contando na adesão depois que o resultado já foi fechado) e
-- trava o status. Chamada de dentro do app autenticado, só rh/admin.
create or replace function clima_encerrar_ciclo(p_ciclo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not sou_rh_ou_admin() then
    raise exception 'Acesso restrito a RH/Admin.';
  end if;

  update clima_tokens set status = 'invalidado'
  where ciclo_id = p_ciclo_id and status = 'disponivel';

  update clima_ciclos set status = 'encerrado', encerrado_em = now()
  where id = p_ciclo_id;
end $$;

revoke all on function clima_encerrar_ciclo(uuid) from public;
grant execute on function clima_encerrar_ciclo(uuid) to authenticated;

-- Resultado agregado de um ciclo -- sempre da empresa inteira, nunca por
-- área/turno/cargo (a função não recebe nem tem como aplicar esse recorte).
-- Some entirely se o ciclo tiver menos de 5 respostas, pra nunca expor um
-- grupo pequeno o bastante pra ser identificável.
create or replace function clima_resultados_agregados(p_ciclo_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_ciclo clima_ciclos%rowtype;
  v_medias jsonb;
  v_nps jsonb;
begin
  if not sou_rh_ou_admin() then
    raise exception 'Acesso restrito a RH/Admin.';
  end if;

  select * into v_ciclo from clima_ciclos where id = p_ciclo_id;
  select count(*) into v_total from clima_respostas where ciclo_id = p_ciclo_id;

  if v_total < 5 then
    return jsonb_build_object(
      'insuficiente', true,
      'total_respondidos', v_total,
      'total_codigos', coalesce(v_ciclo.total_codigos, 0)
    );
  end if;

  select jsonb_object_agg(chave, media) into v_medias
  from (
    select kv.key as chave, avg((kv.value)::numeric) as media
    from clima_respostas r, jsonb_each_text(r.respostas) kv
    where r.ciclo_id = p_ciclo_id and kv.key like 'q%'
    group by kv.key
  ) t;

  -- q20 = "qual a probabilidade de indicar a empresa pra um amigo?" (0-10) --
  -- a pergunta clássica de eNPS entre as 21.
  select jsonb_build_object(
    'promotores', count(*) filter (where (respostas ->> 'q20')::numeric >= 9),
    'neutros', count(*) filter (where (respostas ->> 'q20')::numeric between 7 and 8),
    'detratores', count(*) filter (where (respostas ->> 'q20')::numeric <= 6)
  ) into v_nps
  from clima_respostas
  where ciclo_id = p_ciclo_id and respostas ? 'q20';

  return jsonb_build_object(
    'insuficiente', false,
    'total_respondidos', v_total,
    'total_codigos', coalesce(v_ciclo.total_codigos, 0),
    'medias_por_pergunta', coalesce(v_medias, '{}'::jsonb),
    'nps', v_nps
  );
end $$;

revoke all on function clima_resultados_agregados(uuid) from public;
grant execute on function clima_resultados_agregados(uuid) to authenticated;
