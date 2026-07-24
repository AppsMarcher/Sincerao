-- avaliacoes só tinha policies de select/insert/update — RLS fail-closed bloqueava
-- qualquer DELETE, mesmo pra RH. RH precisa poder excluir uma avaliação (ex: criada
-- por engano). notas e plano de desenvolvimento já cascateiam (FK on delete cascade).

create policy avaliacoes_delete on avaliacoes for delete using (sou_rh_ou_admin());
