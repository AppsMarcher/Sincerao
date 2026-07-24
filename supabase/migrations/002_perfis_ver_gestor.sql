-- Permite que um colaborador veja o nome do próprio gestor (tela de Perfil).
-- A política anterior só permitia ver o próprio registro, o de quem lidera, ou RH/admin.

drop policy perfis_select on perfis;

create policy perfis_select on perfis for select using (
  id = auth.uid()
  or gestor_id = auth.uid()
  or id = (select gestor_id from perfis where id = auth.uid())
  or sou_rh_ou_admin()
);
