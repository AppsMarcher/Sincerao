-- O consenso salvo ainda não é uma avaliação concluída. A conclusão só ocorre
-- quando colaborador e gestor registrarem ciência, em qualquer ordem.

alter table avaliacoes drop constraint if exists avaliacoes_status_check;
alter table avaliacoes add constraint avaliacoes_status_check check (status in (
  'rascunho',
  'aguardando_autoavaliacao',
  'aguardando_alinhamento',
  'aguardando_ciencia',
  'concluida'
));

drop policy if exists avaliacoes_update on avaliacoes;
create policy avaliacoes_update on avaliacoes for update using (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_alinhamento', 'aguardando_ciencia', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_ciencia', 'concluida') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
) with check (
  (gestor_id = auth.uid() and status in ('rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento', 'aguardando_ciencia', 'concluida') and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status in ('aguardando_autoavaliacao', 'aguardando_alinhamento', 'aguardando_ciencia', 'concluida') and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
);

create or replace function validar_fluxo_avaliacao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  media numeric;
begin
  if new.ciclo_id is distinct from old.ciclo_id
     or new.colaborador_id is distinct from old.colaborador_id
     or new.gestor_id is distinct from old.gestor_id then
    raise exception 'Os participantes e o ciclo da avaliação não podem ser alterados.';
  end if;

  -- Mesmo RH/admin não pode marcar a avaliação como concluída diretamente.
  if new.status = 'concluida' and old.status not in ('aguardando_ciencia', 'concluida') then
    raise exception 'A avaliação só pode ser concluída após a ciência do gestor e do colaborador.';
  end if;

  if old.status = 'aguardando_ciencia' then
    -- Cada participante registra somente a própria ciência. Quando chega a
    -- segunda, este mesmo UPDATE conclui a avaliação de forma atômica.
    if old.gestor_id = auth.uid()
       and old.ciencia_gestor_em is null
       and new.ciencia_gestor_em is not null
       and new.status = old.status
       and (to_jsonb(new) - array['ciencia_gestor_em', 'updated_at'])
           is not distinct from
           (to_jsonb(old) - array['ciencia_gestor_em', 'updated_at']) then
      if new.ciencia_colaborador_em is not null then
        new.status := 'concluida';
        new.concluida_em := now();
      end if;
      return new;
    end if;

    if old.colaborador_id = auth.uid()
       and old.ciencia_colaborador_em is null
       and new.ciencia_colaborador_em is not null
       and new.status = old.status
       and (to_jsonb(new) - array['ciencia_colaborador_em', 'updated_at'])
           is not distinct from
           (to_jsonb(old) - array['ciencia_colaborador_em', 'updated_at']) then
      if new.ciencia_gestor_em is not null then
        new.status := 'concluida';
        new.concluida_em := now();
      end if;
      return new;
    end if;

    -- RH/admin pode reabrir um consenso que precise de correção.
    if sou_rh_ou_admin()
       and new.status = 'aguardando_alinhamento'
       and new.ciencia_colaborador_em is null
       and new.ciencia_gestor_em is null
       and new.concluida_em is null then
      return new;
    end if;

    raise exception 'Aguardando ciência: cada participante só pode registrar o próprio aceite.';
  end if;

  -- Mantém a capacidade administrativa de corrigir/reabrir avaliações, sem
  -- permitir o atalho direto para concluída bloqueado acima.
  if sou_rh_ou_admin() then return new; end if;

  if old.status <> 'aguardando_ciencia'
     and (new.ciencia_colaborador_em is distinct from old.ciencia_colaborador_em
       or new.ciencia_gestor_em is distinct from old.ciencia_gestor_em) then
    raise exception 'A ciência só pode ser registrada enquanto a avaliação aguarda aceite.';
  end if;

  if old.status = 'concluida' then
    raise exception 'Avaliação concluída: nenhuma alteração adicional é permitida.';
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
    if new.status not in ('aguardando_alinhamento', 'aguardando_ciencia')
       or (new.dados - array['resumo', 'parecer']) is distinct from (old.dados - array['resumo', 'parecer'])
       or (new.status = 'aguardando_alinhamento' and (
         new.pontuacao_geral is distinct from old.pontuacao_geral
         or new.percentual is distinct from old.percentual
         or new.classificacao is distinct from old.classificacao
         or new.concluida_em is distinct from old.concluida_em
       )) then
      raise exception 'Durante o consenso, somente o gestor pode preencher plano, resumo e parecer final.';
    end if;

    if new.status = 'aguardando_ciencia' then
      select avg(nota)::numeric into media
      from avaliacao_notas
      where avaliacao_id = old.id and nota between 1 and 5;
      if media is null then
        raise exception 'Preencha ao menos uma nota antes de solicitar as ciências.';
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
      new.ciencia_colaborador_em := null;
      new.ciencia_gestor_em := null;
      new.concluida_em := null;
    end if;
    return new;
  end if;

  raise exception 'Transição ou alteração de avaliação não permitida.';
end;
$$;

-- Corrige avaliações antigas que apareciam como concluídas antes das duas
-- ciências. Quem já confirmou mantém sua ciência; falta apenas a outra parte.
alter table avaliacoes disable trigger avaliacoes_validar_fluxo;
update avaliacoes
set status = 'aguardando_ciencia',
    concluida_em = null
where status = 'concluida'
  and (ciencia_colaborador_em is null or ciencia_gestor_em is null);
alter table avaliacoes enable trigger avaliacoes_validar_fluxo;

alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'fase_1_enviada',
  'fase_2_devolvida',
  'consenso_aguardando_ciencia',
  'avaliacao_concluida',
  'consenso_ciencia_completa'
));

-- Remove o aviso incorreto de conclusão das avaliações antigas corrigidas e
-- cria em seu lugar o aviso de ciência pendente.
delete from notificacoes n
using avaliacoes a
where n.avaliacao_id = a.id
  and n.tipo = 'avaliacao_concluida'
  and a.status = 'aguardando_ciencia';

insert into notificacoes (destinatario_id, avaliacao_id, tipo, titulo, mensagem)
select a.colaborador_id, a.id, 'consenso_aguardando_ciencia', 'Consenso aguardando ciência',
       'O consenso da sua avaliação foi salvo. Acesse a avaliação para declarar ciência.'
from avaliacoes a
where a.status = 'aguardando_ciencia'
union all
select a.gestor_id, a.id, 'consenso_aguardando_ciencia', 'Consenso aguardando ciência',
       'O consenso da avaliação foi salvo. Acesse a avaliação para declarar ciência.'
from avaliacoes a
where a.status = 'aguardando_ciencia';

create or replace function registrar_notificacao_fluxo()
returns trigger language plpgsql security definer set search_path = public as $$
declare nome_colaborador text; nome_gestor text;
begin
  if new.status = old.status then return new; end if;
  select nome into nome_colaborador from perfis where id = new.colaborador_id;
  select nome into nome_gestor from perfis where id = new.gestor_id;

  if old.status = 'rascunho' and new.status = 'aguardando_autoavaliacao' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.colaborador_id,new.id,'fase_1_enviada','Sua autoavaliação está disponível','O gestor concluiu a primeira fase. Enviada em ' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') || '.'),
      (new.gestor_id,new.id,'fase_1_enviada','Avaliação enviada ao colaborador','A Fase 1 de ' || coalesce(nome_colaborador,'colaborador') || ' foi enviada.');
  elsif old.status = 'aguardando_autoavaliacao' and new.status = 'aguardando_alinhamento' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'fase_2_devolvida','Autoavaliação devolvida',coalesce(nome_colaborador,'O colaborador') || ' concluiu a Fase 2. Registre o consenso, plano e parecer final.'),
      (new.colaborador_id,new.id,'fase_2_devolvida','Autoavaliação enviada','Sua autoavaliação foi enviada ao gestor. O consenso ficará disponível depois do alinhamento.');
  elsif old.status = 'aguardando_alinhamento' and new.status = 'aguardando_ciencia' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'consenso_aguardando_ciencia','Consenso aguardando ciência','O consenso da avaliação de ' || coalesce(nome_colaborador,'colaborador') || ' foi salvo. Gestor e colaborador devem declarar ciência.'),
      (new.colaborador_id,new.id,'consenso_aguardando_ciencia','Consenso aguardando ciência','O consenso da sua avaliação com ' || coalesce(nome_gestor,'seu gestor') || ' foi salvo. Acesse a avaliação para declarar ciência.');
  elsif old.status = 'aguardando_ciencia' and new.status = 'concluida' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'avaliacao_concluida','Avaliação concluída','Gestor e colaborador deram ciência. A avaliação de ' || coalesce(nome_colaborador,'colaborador') || ' foi concluída.'),
      (new.colaborador_id,new.id,'avaliacao_concluida','Avaliação concluída','Você e ' || coalesce(nome_gestor,'seu gestor') || ' deram ciência. Sua avaliação foi concluída.');
  end if;
  return new;
end;
$$;

-- A notificação de conclusão acima substitui o aviso separado da migration 032
-- e evita duas notificações iguais quando a segunda ciência é registrada.
drop trigger if exists avaliacoes_notificar_consenso_completo on avaliacoes;
drop function if exists notificar_consenso_completo();
