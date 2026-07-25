-- Auditoria operacional imutável.
-- Registra automaticamente inclusões, alterações e exclusões nas tabelas
-- críticas, incluindo o estado anterior e posterior para investigação.

create table auditoria_logs (
  id bigint generated always as identity primary key,
  ocorrido_em timestamptz not null default now(),
  ator_id uuid,
  ator_nome text,
  ator_email text,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  tabela text not null,
  registro_id text,
  avaliacao_id uuid,
  campos_alterados text[] not null default '{}',
  dados_anteriores jsonb,
  dados_novos jsonb,
  transacao_id bigint not null
);

create index auditoria_logs_ocorrido_em_idx on auditoria_logs (ocorrido_em desc);
create index auditoria_logs_tabela_ocorrido_idx on auditoria_logs (tabela, ocorrido_em desc);
create index auditoria_logs_ator_ocorrido_idx on auditoria_logs (ator_id, ocorrido_em desc);
create index auditoria_logs_avaliacao_ocorrido_idx on auditoria_logs (avaliacao_id, ocorrido_em desc);

alter table auditoria_logs enable row level security;

create policy auditoria_logs_select on auditoria_logs
for select using (sou_rh_ou_admin());

-- Nem RH/admin altera o histórico pelo cliente. As inserções são feitas
-- exclusivamente pela função de trigger, executada como owner.
revoke insert, update, delete on auditoria_logs from anon, authenticated;
grant select on auditoria_logs to authenticated;

create or replace function registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anterior jsonb;
  novo jsonb;
  id_registro text;
  id_avaliacao uuid;
  nome_ator text;
  email_ator text;
  alterados text[];
begin
  if tg_op = 'INSERT' then
    novo := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    anterior := to_jsonb(old);
    novo := to_jsonb(new);
  else
    anterior := to_jsonb(old);
  end if;

  id_registro := coalesce(novo->>'id', anterior->>'id');

  if tg_table_name = 'avaliacoes' then
    id_avaliacao := id_registro::uuid;
  elsif tg_table_name in ('avaliacao_notas', 'avaliacao_plano_desenvolvimento') then
    id_avaliacao := coalesce(novo->>'avaliacao_id', anterior->>'avaliacao_id')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(chave order by chave), '{}')
      into alterados
    from (
      select chave
      from jsonb_object_keys(anterior || novo) as chaves(chave)
      where anterior->chave is distinct from novo->chave
    ) diferencas;
  elsif tg_op = 'INSERT' then
    alterados := array(select jsonb_object_keys(novo) order by 1);
  else
    alterados := array(select jsonb_object_keys(anterior) order by 1);
  end if;

  -- Em avaliações, identifica a etapa interna alterada em vez de mostrar
  -- apenas o campo genérico "dados".
  if tg_table_name = 'avaliacoes'
     and tg_op = 'UPDATE'
     and anterior->'dados' is distinct from novo->'dados' then
    alterados := array_remove(alterados, 'dados') || coalesce((
      select array_agg('dados.' || chave order by chave)
      from jsonb_object_keys(coalesce(anterior->'dados', '{}'::jsonb) || coalesce(novo->'dados', '{}'::jsonb)) as chaves(chave)
      where anterior->'dados'->chave is distinct from novo->'dados'->chave
    ), '{}');
  end if;

  select p.nome, p.email
    into nome_ator, email_ator
  from perfis p
  where p.id = auth.uid();

  email_ator := coalesce(email_ator, auth.jwt()->>'email');
  nome_ator := coalesce(nome_ator, auth.jwt()->'user_metadata'->>'nome', email_ator, 'Sistema');

  insert into auditoria_logs (
    ator_id,
    ator_nome,
    ator_email,
    acao,
    tabela,
    registro_id,
    avaliacao_id,
    campos_alterados,
    dados_anteriores,
    dados_novos,
    transacao_id
  ) values (
    auth.uid(),
    nome_ator,
    email_ator,
    tg_op,
    tg_table_name,
    id_registro,
    id_avaliacao,
    alterados,
    anterior,
    novo,
    txid_current()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function registrar_auditoria() from public;

create trigger auditoria_avaliacoes
after insert or update or delete on avaliacoes
for each row execute function registrar_auditoria();

create trigger auditoria_avaliacao_notas
after insert or update or delete on avaliacao_notas
for each row execute function registrar_auditoria();

create trigger auditoria_avaliacao_plano
after insert or update or delete on avaliacao_plano_desenvolvimento
for each row execute function registrar_auditoria();

create trigger auditoria_perfis
after insert or update or delete on perfis
for each row execute function registrar_auditoria();

create trigger auditoria_ciclos
after insert or update or delete on ciclos_avaliacao
for each row execute function registrar_auditoria();

create trigger auditoria_cargos
after insert or update or delete on cargos
for each row execute function registrar_auditoria();

create trigger auditoria_setores
after insert or update or delete on setores
for each row execute function registrar_auditoria();

create trigger auditoria_competencias
after insert or update or delete on competencias
for each row execute function registrar_auditoria();

create trigger auditoria_cargo_competencias
after insert or update or delete on cargo_competencias
for each row execute function registrar_auditoria();
