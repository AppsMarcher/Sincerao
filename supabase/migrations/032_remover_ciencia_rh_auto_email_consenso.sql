-- Remove a ciência do RH (deixa de ser exigida no processo) e automatiza o
-- envio da avaliação por e-mail: assim que colaborador e gestor tiverem
-- registrado ciência do consenso (em qualquer ordem), o app dispara o envio
-- automático (ver enviar-avaliacao/index.ts e registrarCiencia() em
-- etapa-parecer.js). Este trigger só cuida da parte confiável de registrar a
-- notificação no painel de ambos -- o disparo do e-mail em si é feito pelo
-- client logo após a gravação bem-sucedida da 2ª ciência, mesmo padrão de
-- "melhor esforço" já usado em dispararEmailFluxo().

-- A view depende das colunas que serão removidas -- precisa cair antes do
-- alter table e ser recriada depois (create or replace view não permite
-- remover coluna da lista de saída).
drop view avaliacoes_resumo;

alter table avaliacoes
  drop column ciencia_rh_em,
  drop column ciencia_rh_nome,
  drop column ciencia_rh_email;

-- Idêntica à versão da migration 021, só sem ciencia_rh_em na lista de saída.
create view avaliacoes_resumo as
select a.id, a.ciclo_id, a.colaborador_id, a.gestor_id, a.status, a.etapa_atual,
  a.pontuacao_geral, a.percentual, a.classificacao, a.liberado_autoavaliacao_em,
  a.alinhamento_em, a.ciencia_colaborador_em, a.ciencia_gestor_em,
  a.concluida_em, a.created_at, a.updated_at, a.versao,
  jsonb_build_object('nome', pc.nome) as colaborador,
  jsonb_build_object('nome', pg.nome) as gestor,
  jsonb_build_object('nome', c.nome) as ciclo
from avaliacoes a
join perfis pc on pc.id = a.colaborador_id
join perfis pg on pg.id = a.gestor_id
join ciclos_avaliacao c on c.id = a.ciclo_id
where sou_rh_ou_admin()
   or (a.gestor_id = auth.uid() and data_atual_ciclo() between c.data_inicio and c.data_fim)
   or (a.colaborador_id = auth.uid() and a.status <> 'rascunho' and data_atual_ciclo() between c.data_inicio and c.data_fim);

-- Idêntica à versão da migration 026, só sem a checagem de ciencia_rh_em (a
-- coluna não existe mais). O restante da lógica de fluxo é inalterado.
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
       or new.ciencia_gestor_em is distinct from old.ciencia_gestor_em) then
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

alter table notificacoes drop constraint notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('fase_1_enviada', 'fase_2_devolvida', 'avaliacao_concluida', 'consenso_ciencia_completa'));

-- Dispara quando a 2ª das duas ciências (colaborador/gestor, em qualquer
-- ordem) é registrada -- a condição "old tinha alguma nula, new tem as duas"
-- só é verdadeira exatamente uma vez na vida da linha, então não duplica
-- notificação mesmo se as duas ciências forem gravadas quase ao mesmo tempo
-- (a fila de concorrência otimista de atualizarAvaliacaoComConcorrencia no
-- client já serializa as duas gravações).
create or replace function notificar_consenso_completo()
returns trigger language plpgsql security definer set search_path = public as $$
declare nome_colaborador text; nome_gestor text;
begin
  if new.ciencia_colaborador_em is not null and new.ciencia_gestor_em is not null
     and (old.ciencia_colaborador_em is null or old.ciencia_gestor_em is null) then
    select nome into nome_colaborador from perfis where id = new.colaborador_id;
    select nome into nome_gestor from perfis where id = new.gestor_id;
    insert into notificacoes (destinatario_id, avaliacao_id, tipo, titulo, mensagem) values
      (new.colaborador_id, new.id, 'consenso_ciencia_completa', 'Consenso confirmado',
       'Você e ' || coalesce(nome_gestor, 'seu gestor') || ' deram ciência do consenso. A avaliação está sendo enviada por e-mail aos envolvidos.'),
      (new.gestor_id, new.id, 'consenso_ciencia_completa', 'Consenso confirmado',
       'Você e ' || coalesce(nome_colaborador, 'o colaborador') || ' deram ciência do consenso. A avaliação está sendo enviada por e-mail aos envolvidos.');
  end if;
  return new;
end;
$$;

create trigger avaliacoes_notificar_consenso_completo after update on avaliacoes
for each row execute function notificar_consenso_completo();
