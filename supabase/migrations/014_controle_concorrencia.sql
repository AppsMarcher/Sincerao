-- Controle de concorrência otimista (CAS).
-- Cada registro editável recebe uma versão monotônica. O frontend grava usando
-- id + versão esperada; zero linhas atualizadas significa que outra sessão
-- salvou primeiro, impedindo sobrescrita silenciosa.

alter table avaliacoes
  add column versao bigint not null default 1 check (versao > 0);

alter table avaliacao_notas
  add column versao bigint not null default 1 check (versao > 0),
  add column updated_at timestamptz not null default now();

alter table avaliacao_plano_desenvolvimento
  add column versao bigint not null default 1 check (versao > 0),
  add column updated_at timestamptz not null default now();

create or replace function incrementar_versao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.versao := old.versao + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- O prefixo zz faz este trigger rodar depois de avaliacoes_validar_fluxo.
-- Assim, a versão técnica não interfere nas comparações de integridade da 013.
create trigger zz_avaliacoes_incrementar_versao
before update on avaliacoes
for each row execute function incrementar_versao();

create trigger zz_avaliacao_notas_incrementar_versao
before update on avaliacao_notas
for each row execute function incrementar_versao();

create trigger zz_avaliacao_plano_incrementar_versao
before update on avaliacao_plano_desenvolvimento
for each row execute function incrementar_versao();

create index avaliacoes_id_versao_idx
  on avaliacoes (id, versao);

create index avaliacao_notas_id_versao_idx
  on avaliacao_notas (id, versao);

create index avaliacao_plano_id_versao_idx
  on avaliacao_plano_desenvolvimento (id, versao);
