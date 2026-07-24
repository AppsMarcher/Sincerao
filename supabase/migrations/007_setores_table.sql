-- Normaliza "setor" (antes texto livre em cargos.setor) numa tabela própria,
-- mesmo padrão de cargos/competências: cadastro dedicado, RLS de RH/admin.

create table setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index setores_nome_unico_idx on setores (lower(trim(nome)));

alter table setores enable row level security;

create policy setores_select on setores for select using (auth.uid() is not null);
create policy setores_write on setores for all using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());
