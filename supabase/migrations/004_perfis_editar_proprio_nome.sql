-- Permite que qualquer usuário atualize o próprio registro em perfis (self-service),
-- mas protege campos sensíveis (cargo, gestor, papel, ativo, email) via trigger:
-- só RH/admin pode alterá-los. Colaborador comum só consegue mudar o próprio nome.

create policy perfis_update_proprio on perfis for update using (id = auth.uid()) with check (id = auth.uid());

create function perfis_proteger_campos_sensiveis()
returns trigger
language plpgsql
security definer
as $$
begin
  if not sou_rh_ou_admin() then
    new.cargo_id := old.cargo_id;
    new.gestor_id := old.gestor_id;
    new.papel := old.papel;
    new.ativo := old.ativo;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger perfis_before_update
  before update on perfis
  for each row execute function perfis_proteger_campos_sensiveis();
