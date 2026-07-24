-- Restringe o acesso de gestor/colaborador a uma avaliação à janela de vigência
-- do ciclo (data_inicio..data_fim). RH/admin continua acessando sempre, mesmo
-- fora da janela — é quem estrutura o ciclo antes dele abrir pros demais.
-- ciclos_avaliacao já é legível por qualquer autenticado (ciclos_select), então
-- a função não precisa ser security definer.

create function ciclo_vigente(p_ciclo_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from ciclos_avaliacao
    where id = p_ciclo_id
      and current_date between data_inicio and data_fim
  );
$$;

drop policy avaliacoes_select on avaliacoes;
create policy avaliacoes_select on avaliacoes for select using (
  (colaborador_id = auth.uid() and ciclo_vigente(ciclo_id))
  or (gestor_id = auth.uid() and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
);

drop policy avaliacoes_update on avaliacoes;
create policy avaliacoes_update on avaliacoes for update using (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_alinhamento') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status = 'aguardando_autoavaliacao' and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
) with check (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_alinhamento') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
);
