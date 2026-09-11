-- Tabela de apoio pra Edge Function forgot-password (fix do bug de loop na
-- recuperação de senha -- link chegava invalidado pelo Microsoft Defender
-- Safe Links, que varre e consome o link de uso único antes do usuário
-- clicar; mesmo bug e mesmo fix já aplicados no VectonPlan em 2026-08-27,
-- mesmo tenant @marcher.com.br). Guarda o horário da última solicitação por
-- e-mail pra aplicar um cooldown simples e não virar oráculo de enumeração
-- de e-mail. RLS habilitada sem nenhuma policy: só a service_role (usada
-- pela Edge Function) enxerga a tabela -- anon/authenticated não têm acesso
-- via PostgREST.

create table if not exists public.password_reset_requests (
  email text primary key,
  requested_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;
