-- Corrige "infinite recursion detected in policy for relation perfis" causada pela
-- migration 002: o subquery direto em perfis reavalia a própria política (RLS) em loop.
-- Solução: mover a consulta para uma função security definer (bypassa RLS internamente),
-- mesmo padrão já usado em meu_papel()/sou_rh_ou_admin().

create function meu_gestor_id()
returns uuid
language sql
security definer
stable
as $$
  select gestor_id from perfis where id = auth.uid();
$$;

drop policy perfis_select on perfis;

create policy perfis_select on perfis for select using (
  id = auth.uid()
  or gestor_id = auth.uid()
  or id = meu_gestor_id()
  or sou_rh_ou_admin()
);
