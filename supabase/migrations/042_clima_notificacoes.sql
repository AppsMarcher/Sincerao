-- Notificações do módulo Clima.
--
-- Diferente de `notificacoes` (caixa de entrada por pessoa, usada só pelo
-- módulo Avaliação -- avaliacao_id/ciclo_id apontam pras tabelas dela): aqui
-- não existe destinatário. Gerir a pesquisa de clima é responsabilidade
-- coletiva de quem é RH/Admin, então o feed e o estado "lida" são
-- compartilhados entre todos que têm acesso ao módulo, não por pessoa.

create table clima_notificacoes (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid references clima_ciclos(id) on delete cascade,
  tipo text not null check (tipo in ('ciclo_encerrado')),
  titulo text not null,
  mensagem text not null,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index clima_notificacoes_created_idx on clima_notificacoes (created_at desc);

alter table clima_notificacoes enable row level security;
create policy clima_notificacoes_rh_admin on clima_notificacoes for all
  using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

-- Dispara ao encerrar um ciclo (clima_encerrar_ciclo faz um update comum em
-- clima_ciclos -- o trigger pega essa transição não importa de onde veio).
create or replace function clima_registrar_notificacao_encerramento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pct int;
begin
  if new.status = 'encerrado' and old.status is distinct from 'encerrado' then
    v_pct := case when new.total_codigos > 0 then round(new.total_respondidos * 100.0 / new.total_codigos) else 0 end;
    insert into clima_notificacoes (ciclo_id, tipo, titulo, mensagem) values (
      new.id,
      'ciclo_encerrado',
      'Ciclo de clima encerrado',
      'O ciclo "' || new.nome || '" foi encerrado com ' || new.total_respondidos || ' de ' || new.total_codigos || ' respostas (' || v_pct || '% de adesão).'
    );
  end if;
  return new;
end $$;

create trigger clima_ciclos_notificar_encerramento
after update on clima_ciclos
for each row execute function clima_registrar_notificacao_encerramento();
