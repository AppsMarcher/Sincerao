-- Central de notificacoes, contador de nao lidas e lembretes consolidados.

alter table notificacoes add column if not exists ciclo_id uuid references ciclos_avaliacao(id) on delete cascade;
alter table notificacoes add column if not exists categoria text not null default 'avaliacao';
alter table notificacoes add column if not exists prioridade text not null default 'normal';
alter table notificacoes add column if not exists criada_por uuid references perfis(id) on delete set null;
alter table notificacoes add column if not exists dados jsonb not null default '{}'::jsonb;

alter table notificacoes drop constraint if exists notificacoes_categoria_check;
alter table notificacoes add constraint notificacoes_categoria_check
  check (categoria in ('avaliacao', 'prazo', 'comunicado', 'sistema'));

alter table notificacoes drop constraint if exists notificacoes_prioridade_check;
alter table notificacoes add constraint notificacoes_prioridade_check
  check (prioridade in ('normal', 'atencao', 'urgente', 'sucesso'));

alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'fase_1_enviada',
  'fase_2_devolvida',
  'consenso_aguardando_ciencia',
  'avaliacao_concluida',
  'consenso_ciencia_completa',
  'lembrete_gestor',
  'prazo_ciclo',
  'comunicado'
));

create index if not exists notificacoes_destinatario_nao_lida_idx
  on notificacoes (destinatario_id, created_at desc) where lida_em is null;
create index if not exists notificacoes_ciclo_idx
  on notificacoes (ciclo_id, created_at desc);

update notificacoes n
set ciclo_id = a.ciclo_id
from avaliacoes a
where n.avaliacao_id = a.id and n.ciclo_id is null;

update notificacoes
set prioridade = 'sucesso'
where tipo in ('avaliacao_concluida', 'consenso_ciencia_completa');

create or replace function preencher_contexto_notificacao()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.ciclo_id is null and new.avaliacao_id is not null then
    select ciclo_id into new.ciclo_id from avaliacoes where id = new.avaliacao_id;
  end if;
  if new.tipo in ('avaliacao_concluida', 'consenso_ciencia_completa') then
    new.prioridade := 'sucesso';
  end if;
  return new;
end;
$$;

drop trigger if exists notificacoes_preencher_contexto on notificacoes;
create trigger notificacoes_preencher_contexto
before insert or update of avaliacao_id, ciclo_id, tipo on notificacoes
for each row execute function preencher_contexto_notificacao();

create or replace function contar_notificacoes_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from notificacoes
  where destinatario_id = auth.uid() and lida_em is null;
$$;

create or replace function marcar_todas_notificacoes_lidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare quantidade integer;
begin
  update notificacoes
  set lida_em = now()
  where destinatario_id = auth.uid() and lida_em is null;
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;

grant execute on function contar_notificacoes_nao_lidas() to authenticated;
grant execute on function marcar_todas_notificacoes_lidas() to authenticated;

-- Historico de cada envio, separado das notificacoes que o destinatario pode excluir.
create table notificacao_disparos (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references ciclos_avaliacao(id) on delete cascade,
  modo text not null check (modo in ('manual', 'automatico')),
  marco text,
  solicitado_por uuid references perfis(id) on delete set null,
  total_destinatarios integer not null default 0,
  total_sucessos integer not null default 0,
  total_falhas integer not null default 0,
  total_ignorados integer not null default 0,
  created_at timestamptz not null default now(),
  unique (ciclo_id, modo, marco)
);

create table notificacao_disparo_destinatarios (
  id bigint generated always as identity primary key,
  disparo_id uuid not null references notificacao_disparos(id) on delete cascade,
  gestor_id uuid not null references perfis(id) on delete cascade,
  pendencias integer not null,
  email_enviado boolean not null default false,
  ignorado boolean not null default false,
  erro text,
  created_at timestamptz not null default now(),
  unique (disparo_id, gestor_id)
);

create index notificacao_disparos_ciclo_created_idx
  on notificacao_disparos (ciclo_id, created_at desc);
create index notificacao_disparo_destinatarios_gestor_idx
  on notificacao_disparo_destinatarios (gestor_id, created_at desc);

alter table notificacao_disparos enable row level security;
alter table notificacao_disparo_destinatarios enable row level security;

create policy notificacao_disparos_select on notificacao_disparos
for select using (
  coalesce((select papel in ('rh', 'admin', 'diretoria') from perfis where id = auth.uid()), false)
);
create policy notificacao_disparo_destinatarios_select on notificacao_disparo_destinatarios
for select using (
  coalesce((select papel in ('rh', 'admin', 'diretoria') from perfis where id = auth.uid()), false)
);

revoke insert, update, delete on notificacao_disparos from anon, authenticated;
revoke insert, update, delete on notificacao_disparo_destinatarios from anon, authenticated;
grant select on notificacao_disparos to authenticated;
grant select on notificacao_disparo_destinatarios to authenticated;

-- Inclui identificador, pendencias por fase e ultimo aviso no painel por gestor.
create or replace function indicadores_gestao(p_ciclo_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare resultado jsonb;
begin
  if not coalesce((select papel in ('rh','admin','diretoria') from perfis where id = auth.uid()), false) then
    raise exception 'Acesso restrito a gestao.';
  end if;

  with base as (
    select a.*, s.nome as setor_nome, pg.nome as gestor_nome
    from avaliacoes a
    left join perfis p on p.id = a.colaborador_id
    left join cargos c on c.id = p.cargo_id
    left join setores s on s.id = c.setor_id
    left join perfis pg on pg.id = a.gestor_id
    where p_ciclo_id is null or a.ciclo_id = p_ciclo_id
  ), totais as (
    select count(*)::int total,
      count(*) filter(where status='rascunho')::int fase_1,
      count(*) filter(where status='aguardando_autoavaliacao')::int fase_2,
      count(*) filter(where status='aguardando_alinhamento')::int fase_3,
      count(*) filter(where status='aguardando_ciencia')::int aguardando_ciencia,
      count(*) filter(where status='concluida')::int concluidas,
      round(avg(pontuacao_geral) filter(where status='concluida'),2) nota_media
    from base
  ), por_status as (
    select status,count(*)::int quantidade from base group by status order by status
  ), por_classificacao as (
    select coalesce(classificacao,'Sem classificacao') classificacao,count(*)::int quantidade
    from base where status='concluida' group by classificacao order by quantidade desc
  ), por_setor as (
    select coalesce(setor_nome,'Sem setor') setor,count(*)::int total,
      count(*) filter(where status='concluida')::int concluidas,
      round(avg(pontuacao_geral) filter(where status='concluida'),2) nota_media
    from base group by setor_nome order by setor
  ), por_gestor as (
    select b.gestor_id,
      coalesce(max(b.gestor_nome),'Sem gestor') gestor,
      count(*)::int total,
      count(*) filter(where b.status='concluida')::int concluidas,
      count(*) filter(where b.status<>'concluida')::int pendentes,
      count(*) filter(where b.status='rascunho')::int rascunho,
      count(*) filter(where b.status='aguardando_autoavaliacao')::int aguardando_autoavaliacao,
      count(*) filter(where b.status='aguardando_alinhamento')::int aguardando_alinhamento,
      count(*) filter(where b.status='aguardando_ciencia')::int aguardando_ciencia,
      round(avg(b.pontuacao_geral) filter(where b.status='concluida'),2) nota_media,
      (select max(n.created_at) from notificacoes n
       where n.destinatario_id = b.gestor_id
         and n.tipo = 'lembrete_gestor'
         and (p_ciclo_id is null or n.ciclo_id = p_ciclo_id)) ultimo_aviso
    from base b group by b.gestor_id order by gestor
  ), competencias as (
    select co.nome competencia,round(avg(n.nota),2) nota_media,count(*)::int avaliacoes
    from avaliacao_notas n join base b on b.id=n.avaliacao_id
    join competencias co on co.id=n.competencia_id
    where b.status='concluida' and n.nota is not null
    group by co.nome order by nota_media asc,avaliacoes desc limit 10
  )
  select jsonb_build_object(
    'totais',(select to_jsonb(totais) from totais),
    'por_status',coalesce((select jsonb_agg(to_jsonb(por_status)) from por_status),'[]'::jsonb),
    'por_classificacao',coalesce((select jsonb_agg(to_jsonb(por_classificacao)) from por_classificacao),'[]'::jsonb),
    'por_setor',coalesce((select jsonb_agg(to_jsonb(por_setor)) from por_setor),'[]'::jsonb),
    'por_gestor',coalesce((select jsonb_agg(to_jsonb(por_gestor)) from por_gestor),'[]'::jsonb),
    'competencias',coalesce((select jsonb_agg(to_jsonb(competencias)) from competencias),'[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

grant execute on function indicadores_gestao(uuid) to authenticated;

-- Atualizacao imediata do sininho quando Realtime estiver habilitado no projeto.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
     ) then
    alter publication supabase_realtime add table notificacoes;
  end if;
end;
$$;
