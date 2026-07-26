-- A Fase 3 é conduzida no login do gestor. O colaborador volta a visualizar
-- plano, resumo e parecer somente depois da conclusão da avaliação.

drop policy avaliacoes_update on avaliacoes;
create policy avaliacoes_update on avaliacoes for update using (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'concluida') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
) with check (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_alinhamento', 'concluida') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
);

drop policy plano_write on avaliacao_plano_desenvolvimento;
create policy plano_write on avaliacao_plano_desenvolvimento for all using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and ((a.gestor_id = auth.uid() and a.status = 'aguardando_alinhamento' and ciclo_vigente(a.ciclo_id)) or sou_rh_ou_admin())
  )
) with check (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_plano_desenvolvimento.avaliacao_id
      and ((a.gestor_id = auth.uid() and a.status = 'aguardando_alinhamento' and ciclo_vigente(a.ciclo_id)) or sou_rh_ou_admin())
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
  if sou_rh_ou_admin() then return new; end if;

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

  if old.status = 'concluida' then
    if old.gestor_id = auth.uid()
       and new.ciencia_gestor_em is distinct from old.ciencia_gestor_em
       and (to_jsonb(new) - array['ciencia_gestor_em', 'updated_at']) is not distinct from (to_jsonb(old) - array['ciencia_gestor_em', 'updated_at']) then return new; end if;
    if old.colaborador_id = auth.uid()
       and new.ciencia_colaborador_em is distinct from old.ciencia_colaborador_em
       and (to_jsonb(new) - array['ciencia_colaborador_em', 'updated_at']) is not distinct from (to_jsonb(old) - array['ciencia_colaborador_em', 'updated_at']) then return new; end if;
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
      raise exception 'O colaborador só pode preencher sua autoavaliação e enviar ao gestor para consenso.';
    end if;
    return new;
  end if;

  if old.status = 'aguardando_alinhamento' and old.gestor_id = auth.uid() then
    if new.status not in ('aguardando_alinhamento', 'concluida')
       or (new.dados - array['resumo', 'parecer']) is distinct from (old.dados - array['resumo', 'parecer'])
       or (new.status = 'aguardando_alinhamento' and (
         new.pontuacao_geral is distinct from old.pontuacao_geral
         or new.percentual is distinct from old.percentual
         or new.classificacao is distinct from old.classificacao
         or new.concluida_em is distinct from old.concluida_em
       )) then
      raise exception 'Durante o consenso, somente o gestor pode preencher plano, resumo e parecer final.';
    end if;

    if new.status = 'concluida' then
      select avg(nota)::numeric into media from avaliacao_notas where avaliacao_id = old.id and nota between 1 and 5;
      if media is null then raise exception 'Preencha ao menos uma nota antes de concluir a avaliação.'; end if;
      new.pontuacao_geral := round(media, 2);
      new.percentual := round((media / 5) * 100, 1);
      new.classificacao := case when media >= 4.5 then 'Excelente' when media >= 3.5 then 'Acima das expectativas' when media >= 2.5 then 'Atende às expectativas' when media >= 1.5 then 'Em desenvolvimento' else 'Necessita desenvolvimento imediato' end;
      new.concluida_em := coalesce(new.concluida_em, now());
    end if;
    return new;
  end if;

  raise exception 'Transição ou alteração de avaliação não permitida.';
end;
$$;

create or replace function registrar_notificacao_fluxo()
returns trigger language plpgsql security definer set search_path = public as $$
declare nome_colaborador text; nome_gestor text;
begin
  if new.status = old.status then return new; end if;
  select nome into nome_colaborador from perfis where id = new.colaborador_id;
  select nome into nome_gestor from perfis where id = new.gestor_id;
  if old.status = 'rascunho' and new.status = 'aguardando_autoavaliacao' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.colaborador_id,new.id,'fase_1_enviada','Sua autoavaliação está disponível','O gestor concluiu a primeira fase. Enviada em ' || to_char(now(),'DD/MM/YYYY HH24:MI') || '.'),
      (new.gestor_id,new.id,'fase_1_enviada','Avaliação enviada ao colaborador','A Fase 1 de ' || coalesce(nome_colaborador,'colaborador') || ' foi enviada.');
  elsif old.status = 'aguardando_autoavaliacao' and new.status = 'aguardando_alinhamento' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'fase_2_devolvida','Autoavaliação devolvida',coalesce(nome_colaborador,'O colaborador') || ' concluiu a Fase 2. Registre o consenso, plano e parecer final.'),
      (new.colaborador_id,new.id,'fase_2_devolvida','Autoavaliação enviada','Sua autoavaliação foi enviada ao gestor. O resultado final ficará disponível após o consenso.');
  elsif new.status = 'concluida' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'avaliacao_concluida','Avaliação concluída','A avaliação de ' || coalesce(nome_colaborador,'colaborador') || ' foi concluída.'),
      (new.colaborador_id,new.id,'avaliacao_concluida','Avaliação concluída','Sua avaliação foi concluída por ' || coalesce(nome_gestor,'seu gestor') || '. Consulte o plano, resumo e parecer final.');
  end if;
  return new;
end;
$$;
