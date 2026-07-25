-- Expõe se cada colaborador já confirmou o cadastro (login ativado) ou ainda
-- está com convite pendente. auth.users não é exposto via PostgREST por
-- padrão, então isso precisa passar por uma function security definer
-- (mesmo padrão de sou_rh_ou_admin/meu_gestor_id já usado no projeto) --
-- RH-only, fail-closed: quem não for RH/admin recebe erro, não lista vazia.

create or replace function colaboradores_confirmados()
returns table (id uuid, ativo boolean)
language plpgsql
security definer
stable
as $$
begin
  if not sou_rh_ou_admin() then
    raise exception 'Acesso restrito ao RH.';
  end if;
  return query select u.id, (u.email_confirmed_at is not null) as ativo from auth.users u;
end;
$$;
