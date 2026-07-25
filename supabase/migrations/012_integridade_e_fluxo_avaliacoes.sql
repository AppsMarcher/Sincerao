-- Integridade do fluxo de avaliações.
-- A interface é apenas uma conveniência: estas regras impedem alterações fora
-- da etapa correta mesmo que alguém chame o PostgREST diretamente.

alter table ciclos_avaliacao
  add constraint ciclos_avaliacao_periodo_valido
  check (data_fim >= data_inicio);

create or replace function atualizar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger avaliacoes_atualizar_updated_at
before update on avaliacoes
for each row execute function atualizar_updated_at();

-- A criação de avaliações pertence ao RH/admin. Gestores recebem avaliações
-- já atribuídas e não conseguem criar uma para qualquer pessoa por REST.
drop policy avaliacoes_insert on avaliacoes;
create policy avaliacoes_insert on avaliacoes for insert
with check (sou_rh_ou_admin());

-- A policy abre apenas os estados em que cada parte pode agir. O trigger logo
-- abaixo restringe quais colunas podem mudar em cada um desses estados.
drop policy avaliacoes_update on avaliacoes;
create policy avaliacoes_update on avaliacoes for update using (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
) with check (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
);

-- Notas só existem enquanto o gestor preenche o rascunho; plano só durante o
-- alinhamento. RH/admin continua podendo corrigir registros quando necessário.
drop policy avaliacao_notas_write on avaliacao_notas;
create policy avaliacao_notas_write on avaliacao_notas for all using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_notas.avaliacao_id
      and ((a.gestor_id = auth.uid() and a.status = 'rascunho' and ciclo_vigente(a.ciclo_id)) or sou_rh_ou_admin())
  )
) with check (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_notas.avaliacao_id
      and ((a.gestor_id = auth.uid() and a.status = 'rascunho' and ciclo_vigente(a.ciclo_id)) or sou_rh_ou_admin())
  )
);

drop policy plano_write on avaliacao_plano_desenvolvimento;
create policy plano_write on avaliacao_plano_desenvolvimento for all using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and (((a.gestor_id = auth.uid() or a.colaborador_id = auth.uid()) and a.status = 'aguardando_alinhamento' and ciclo_vigente(a.ciclo_id)) or sou_rh_ou_admin())
  )
) with check (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and (((a.gestor_id = auth.uid() or a.colaborador_id = auth.uid()) and a.status = 'aguardando_alinhamento' and ciclo_vigente(a.ciclo_id)) or sou_rh_ou_admin())
  )
);

create or replace function validar_fluxo_avaliacao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  media numeric;
begin
  -- RH/admin tem permissão explícita para corrigir exceções operacionais.
  if sou_rh_ou_admin() then
    return new;
  end if;

  if new.ciclo_id is distinct from old.ciclo_id
     or new.colaborador_id is distinct from old.colaborador_id
     or new.gestor_id is distinct from old.gestor_id then
    raise exception 'Os participantes e o ciclo da avaliação não podem ser alterados.';
  end if;

  if old.status <> 'concluida'
     and (new.ciencia_colaborador_em is distinct from old.ciencia_colaborador_em
       or new.ciencia_gestor_em is distinct from old.ciencia_gestor_em
       or new.ciencia_rh_em is distinct from old.ciencia_rh_em) then
    raise exception 'A ciência só pode ser registrada após a conclusão.';
  end if;

  -- Depois de concluída, cada pessoa só registra sua própria ciência.
  if old.status = 'concluida' then
    if old.gestor_id = auth.uid()
       and new.ciencia_gestor_em is distinct from old.ciencia_gestor_em
       and (to_jsonb(new) - array['ciencia_gestor_em', 'updated_at']) is not distinct from (to_jsonb(old) - array['ciencia_gestor_em', 'updated_at']) then
      return new;
    end if;
    if old.colaborador_id = auth.uid()
       and new.ciencia_colaborador_em is distinct from old.ciencia_colaborador_em
       and (to_jsonb(new) - array['ciencia_colaborador_em', 'updated_at']) is not distinct from (to_jsonb(old) - array['ciencia_colaborador_em', 'updated_at']) then
      return new;
    end if;
    raise exception 'Avaliação concluída: somente sua ciência pode ser registrada.';
  end if;

  if old.status = 'rascunho' and old.gestor_id = auth.uid() then
    if new.status not in ('rascunho', 'aguardando_autoavaliacao')
       or (new.dados - array['resultados', 'feedback_gestor']) is distinct from (old.dados - array['resultados', 'feedback_gestor'])
       or new.pontuacao_geral is distinct from old.pontuacao_geral
       or new.percentual is distinct from old.percentual
       or new.classificacao is distinct from old.classificacao
       or new.concluida_em is distinct from old.concluida_em then
      raise exception 'O gestor só pode preencher as etapas de rascunho e liberar a autoavaliação.';
    end if;
    return new;
  end if;

  if old.status = 'aguardando_autoavaliacao' and old.colaborador_id = auth.uid() then
    if new.status not in ('aguardando_autoavaliacao', 'aguardando_alinhamento')
       or (new.dados - array['autoavaliacao', 'feedback_colaborador']) is distinct from (old.dados - array['autoavaliacao', 'feedback_colaborador'])
       or new.pontuacao_geral is distinct from old.pontuacao_geral
       or new.percentual is distinct from old.percentual
       or new.classificacao is distinct from old.classificacao
       or new.concluida_em is distinct from old.concluida_em then
      raise exception 'O colaborador só pode preencher sua autoavaliação e enviar para alinhamento.';
    end if;
    return new;
  end if;

  if old.status = 'aguardando_alinhamento' then
    if old.gestor_id = auth.uid() then
      if new.status not in ('aguardando_alinhamento', 'concluida')
         or (new.dados - array['resumo', 'parecer']) is distinct from (old.dados - array['resumo', 'parecer'])
         or ((new.dados->'parecer') - 'parecer_colaborador') is distinct from ((old.dados->'parecer') - 'parecer_colaborador')
         or (new.status = 'aguardando_alinhamento' and (
           new.pontuacao_geral is distinct from old.pontuacao_geral
           or new.percentual is distinct from old.percentual
           or new.classificacao is distinct from old.classificacao
           or new.concluida_em is distinct from old.concluida_em
         )) then
        raise exception 'O gestor só pode concluir ou preencher o resumo e parecer durante o alinhamento.';
      end if;

      if new.status = 'concluida' and old.status <> 'concluida' then
        select avg(nota)::numeric into media
        from avaliacao_notas
        where avaliacao_id = old.id and nota between 1 and 5;
        if media is null then
          raise exception 'Preencha ao menos uma nota antes de concluir a avaliação.';
        end if;
        new.pontuacao_geral := round(media, 2);
        new.percentual := round((media / 5) * 100, 1);
        new.classificacao := case
          when media >= 4.5 then 'Excelente'
          when media >= 3.5 then 'Acima das expectativas'
          when media >= 2.5 then 'Atende às expectativas'
          when media >= 1.5 then 'Em desenvolvimento'
          else 'Necessita desenvolvimento imediato'
        end;
        new.concluida_em := coalesce(new.concluida_em, now());
      end if;
      return new;
    end if;

    if old.colaborador_id = auth.uid()
       and new.status = 'aguardando_alinhamento'
       and (new.dados - array['resumo', 'parecer']) is not distinct from (old.dados - array['resumo', 'parecer'])
       and ((new.dados->'parecer') - 'parecer_gestor') is not distinct from ((old.dados->'parecer') - 'parecer_gestor')
       and new.pontuacao_geral is not distinct from old.pontuacao_geral
       and new.percentual is not distinct from old.percentual
       and new.classificacao is not distinct from old.classificacao
       and new.concluida_em is not distinct from old.concluida_em then
      return new;
    end if;
  end if;

  raise exception 'Transição ou alteração de avaliação não permitida.';
end;
$$;

create trigger avaliacoes_validar_fluxo
before update on avaliacoes
for each row execute function validar_fluxo_avaliacao();
