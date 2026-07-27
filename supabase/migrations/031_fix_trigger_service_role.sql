-- Bug: perfis_proteger_campos_sensiveis (migration 004) reverte cargo_id/gestor_id/
-- papel/ativo/email pro valor antigo sempre que sou_rh_ou_admin() dá falso -- e essa
-- função depende de auth.uid(), que é NULL quando o UPDATE vem do service_role key
-- (JWT de service_role não carrega claim "sub"). Resultado: todo UPDATE feito pelas
-- Edge Functions via adminClient (invite-colaborador setando gestor_id/papel no convite,
-- admin-colaborador setando email em atualizar_email) era silenciosamente desfeito --
-- só "pegava" depois que o RH corrigia de novo pela tela, autenticado com o próprio JWT.
-- Fix: tratar conexões service_role como já confiáveis, sem checar sou_rh_ou_admin().
create or replace function perfis_proteger_campos_sensiveis()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' and not sou_rh_ou_admin() then
    new.cargo_id := old.cargo_id;
    new.gestor_id := old.gestor_id;
    new.papel := old.papel;
    new.ativo := old.ativo;
    new.email := old.email;
  end if;
  return new;
end;
$$;
