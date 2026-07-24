-- AvaliacaoDesempenho — schema inicial
-- Ciclo de avaliação de desempenho gestor <-> colaborador (modelo 180°)

create extension if not exists "pgcrypto";

-- =========================================================
-- CADASTROS
-- =========================================================

create table cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  setor text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table competencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('comportamental', 'tecnica')),
  definicao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table cargo_competencias (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid not null references cargos(id) on delete cascade,
  competencia_id uuid not null references competencias(id) on delete cascade,
  unique (cargo_id, competencia_id)
);

-- perfis estende auth.users com dados organizacionais
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  cargo_id uuid references cargos(id),
  gestor_id uuid references perfis(id),
  papel text not null default 'colaborador' check (papel in ('colaborador', 'gestor', 'rh', 'admin')),
  ativo boolean not null default true,
  data_admissao date,
  created_at timestamptz not null default now()
);

create table ciclos_avaliacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data_inicio date not null,
  data_fim date not null,
  status text not null default 'planejado' check (status in ('planejado', 'em_andamento', 'encerrado')),
  created_at timestamptz not null default now()
);

-- =========================================================
-- AVALIAÇÕES
-- =========================================================

create table avaliacoes (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references ciclos_avaliacao(id),
  colaborador_id uuid not null references perfis(id),
  gestor_id uuid not null references perfis(id),
  status text not null default 'rascunho' check (status in (
    'rascunho',
    'aguardando_autoavaliacao',
    'aguardando_alinhamento',
    'concluida'
  )),
  etapa_atual int not null default 1,
  dados jsonb not null default '{}'::jsonb,
  pontuacao_geral numeric,
  percentual numeric,
  classificacao text,
  liberado_autoavaliacao_em timestamptz,
  alinhamento_em timestamptz,
  ciencia_colaborador_em timestamptz,
  ciencia_gestor_em timestamptz,
  ciencia_rh_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ciclo_id, colaborador_id)
);

create table avaliacao_notas (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references avaliacoes(id) on delete cascade,
  competencia_id uuid not null references competencias(id),
  nota int check (nota between 1 and 5),
  comentario text,
  unique (avaliacao_id, competencia_id)
);

create table avaliacao_plano_desenvolvimento (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references avaliacoes(id) on delete cascade,
  competencia text not null,
  acao text not null,
  prazo date,
  responsavel text,
  indicador_sucesso text,
  acompanhamento text,
  ordem int not null default 0
);

-- Ao convidar um usuário pelo painel do Supabase (Authentication > Invite user),
-- este trigger cria automaticamente a linha em perfis. RH depois completa
-- cargo/gestor/papel pela tela de cadastro. O primeiro usuário RH precisa ter
-- o papel promovido manualmente para 'rh' (bootstrap único).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create index on avaliacoes (colaborador_id);
create index on avaliacoes (gestor_id);
create index on avaliacoes (ciclo_id);
create index on avaliacao_notas (avaliacao_id);
create index on avaliacao_plano_desenvolvimento (avaliacao_id);

-- =========================================================
-- RBAC helpers (fail-closed)
-- =========================================================

create function meu_papel()
returns text
language sql
security definer
stable
as $$
  select papel from perfis where id = auth.uid();
$$;

create function sou_rh_ou_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select papel in ('rh', 'admin') from perfis where id = auth.uid()), false);
$$;

-- =========================================================
-- RLS
-- =========================================================

alter table cargos enable row level security;
alter table competencias enable row level security;
alter table cargo_competencias enable row level security;
alter table perfis enable row level security;
alter table ciclos_avaliacao enable row level security;
alter table avaliacoes enable row level security;
alter table avaliacao_notas enable row level security;
alter table avaliacao_plano_desenvolvimento enable row level security;

-- Cadastros: leitura para qualquer usuário autenticado; escrita só RH/admin
create policy cargos_select on cargos for select using (auth.uid() is not null);
create policy cargos_write on cargos for all using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

create policy competencias_select on competencias for select using (auth.uid() is not null);
create policy competencias_write on competencias for all using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

create policy cargo_competencias_select on cargo_competencias for select using (auth.uid() is not null);
create policy cargo_competencias_write on cargo_competencias for all using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

create policy ciclos_select on ciclos_avaliacao for select using (auth.uid() is not null);
create policy ciclos_write on ciclos_avaliacao for all using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

-- Perfis: cada um vê o próprio, gestor vê seus liderados, RH/admin vê todos
create policy perfis_select on perfis for select using (
  id = auth.uid()
  or gestor_id = auth.uid()
  or sou_rh_ou_admin()
);
create policy perfis_write on perfis for all using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

-- Avaliações: colaborador vê a própria, gestor vê as que ele avalia, RH/admin vê todas
create policy avaliacoes_select on avaliacoes for select using (
  colaborador_id = auth.uid()
  or gestor_id = auth.uid()
  or sou_rh_ou_admin()
);

create policy avaliacoes_insert on avaliacoes for insert with check (
  gestor_id = auth.uid() or sou_rh_ou_admin()
);

-- Update: gestor só em rascunho/alinhamento; colaborador só em aguardando_autoavaliacao; RH sempre
create policy avaliacoes_update on avaliacoes for update using (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_alinhamento'))
  or (colaborador_id = auth.uid() and status = 'aguardando_autoavaliacao')
  or sou_rh_ou_admin()
) with check (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida'))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_alinhamento'))
  or sou_rh_ou_admin()
);

-- Notas: mesma visibilidade da avaliação; escrita restrita ao gestor (quem avalia competências)
create policy avaliacao_notas_select on avaliacao_notas for select using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_notas.avaliacao_id
      and (a.colaborador_id = auth.uid() or a.gestor_id = auth.uid() or sou_rh_ou_admin())
  )
);
create policy avaliacao_notas_write on avaliacao_notas for all using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_notas.avaliacao_id
      and (a.gestor_id = auth.uid() or sou_rh_ou_admin())
  )
) with check (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_notas.avaliacao_id
      and (a.gestor_id = auth.uid() or sou_rh_ou_admin())
  )
);

-- Plano de desenvolvimento: visível pros dois lados, editável pelos dois (etapa 6 é conjunta)
create policy plano_select on avaliacao_plano_desenvolvimento for select using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and (a.colaborador_id = auth.uid() or a.gestor_id = auth.uid() or sou_rh_ou_admin())
  )
);
create policy plano_write on avaliacao_plano_desenvolvimento for all using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and (a.colaborador_id = auth.uid() or a.gestor_id = auth.uid() or sou_rh_ou_admin())
  )
) with check (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and (a.colaborador_id = auth.uid() or a.gestor_id = auth.uid() or sou_rh_ou_admin())
  )
);
