-- Retrocesso administrativo de avaliações.
-- RH/admin pode devolver uma avaliação para qualquer fase editável anterior,
-- sem apagar respostas. A operação é transacional, exige motivo, respeita a
-- versão otimista e mantém um histórico imutável próprio.

alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'fase_1_enviada',
  'fase_2_devolvida',
  'consenso_aguardando_ciencia',
  'avaliacao_concluida',
  'consenso_ciencia_completa',
  'lembrete_gestor',
  'prazo_ciclo',
  'comunicado',
  'avaliacao_retornada'
));

create table avaliacao_retornos (
  id bigint generated always as identity primary key,
  avaliacao_id uuid not null references avaliacoes(id) on delete cascade,
  status_origem text not null check (status_origem in (
    'rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento',
    'aguardando_ciencia', 'concluida'
  )),
  status_destino text not null check (status_destino in (
    'rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento'
  )),
  etapa_origem integer not null,
  etapa_destino integer not null,
  motivo text not null check (char_length(trim(motivo)) between 10 and 2000),
  ator_id uuid references perfis(id) on delete set null,
  ator_nome text not null,
  ator_email text,
  versao_origem bigint not null,
  versao_destino bigint not null,
  criado_em timestamptz not null default now()
);

create index avaliacao_retornos_avaliacao_criado_idx
  on avaliacao_retornos (avaliacao_id, criado_em desc);

alter table avaliacao_retornos enable row level security;

create policy avaliacao_retornos_select on avaliacao_retornos
for select using (sou_rh_ou_admin());

revoke insert, update, delete on avaliacao_retornos from anon, authenticated;
grant select on avaliacao_retornos to authenticated;

-- Além do histórico próprio, inclui cada retorno na auditoria operacional
-- central. Como a tabela é append-only, somente INSERT precisa ser auditado.
create trigger auditoria_avaliacao_retornos
after insert on avaliacao_retornos
for each row execute function registrar_auditoria();

-- O colaborador recebe uma visão segura durante a autoavaliação. Inclui nela
-- somente a orientação do último retrocesso, sem expor respostas do gestor.
create or replace function obter_avaliacao_para_fluxo(p_avaliacao_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a avaliacoes%rowtype;
begin
  select * into a from avaliacoes where id = p_avaliacao_id;
  if not found then return null; end if;
  if sou_rh_ou_admin() then return to_jsonb(a); end if;
  if not ciclo_vigente(a.ciclo_id) then return null; end if;
  if a.gestor_id = auth.uid() then return to_jsonb(a); end if;
  if a.colaborador_id <> auth.uid() or a.status = 'rascunho' then return null; end if;
  if a.status = 'aguardando_autoavaliacao' then
    return jsonb_build_object(
      'id', a.id,
      'ciclo_id', a.ciclo_id,
      'colaborador_id', a.colaborador_id,
      'gestor_id', a.gestor_id,
      'status', a.status,
      'etapa_atual', a.etapa_atual,
      'versao', a.versao,
      'dados', jsonb_build_object(
        'autoavaliacao', coalesce(a.dados->'autoavaliacao', '{}'::jsonb),
        'feedback_colaborador', coalesce(a.dados->'feedback_colaborador', '{}'::jsonb),
        'retrocesso', coalesce(a.dados->'retrocesso', 'null'::jsonb)
      )
    );
  end if;
  return to_jsonb(a);
end $$;

revoke all on function obter_avaliacao_para_fluxo(uuid) from public;
grant execute on function obter_avaliacao_para_fluxo(uuid) to authenticated;

-- Mantém a orientação do retrocesso na resposta segura devolvida após cada
-- salvamento da autoavaliação.
create or replace function salvar_autoavaliacao_para_fluxo(
  p_avaliacao_id uuid,
  p_versao bigint,
  p_dados jsonb,
  p_etapa_atual integer,
  p_enviar_para_alinhamento boolean default false,
  p_alinhamento_em timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  salvo avaliacoes%rowtype;
begin
  update avaliacoes
  set dados = dados || jsonb_build_object(
        'autoavaliacao', coalesce(p_dados->'autoavaliacao', '{}'::jsonb),
        'feedback_colaborador', coalesce(p_dados->'feedback_colaborador', '{}'::jsonb)
      ),
      etapa_atual = p_etapa_atual,
      status = case when p_enviar_para_alinhamento then 'aguardando_alinhamento' else status end,
      alinhamento_em = case when p_enviar_para_alinhamento then coalesce(p_alinhamento_em, now()) else alinhamento_em end
  where id = p_avaliacao_id
    and versao = p_versao
    and colaborador_id = auth.uid()
    and status = 'aguardando_autoavaliacao'
    and ciclo_vigente(ciclo_id)
  returning * into salvo;

  if not found then
    raise exception 'A avaliação foi alterada, não está disponível ou o ciclo foi encerrado.';
  end if;

  if p_enviar_para_alinhamento then return to_jsonb(salvo); end if;

  return jsonb_build_object(
    'id', salvo.id,
    'ciclo_id', salvo.ciclo_id,
    'colaborador_id', salvo.colaborador_id,
    'gestor_id', salvo.gestor_id,
    'status', salvo.status,
    'etapa_atual', salvo.etapa_atual,
    'versao', salvo.versao,
    'dados', jsonb_build_object(
      'autoavaliacao', coalesce(salvo.dados->'autoavaliacao', '{}'::jsonb),
      'feedback_colaborador', coalesce(salvo.dados->'feedback_colaborador', '{}'::jsonb),
      'retrocesso', coalesce(salvo.dados->'retrocesso', 'null'::jsonb)
    )
  );
end;
$$;

revoke all on function salvar_autoavaliacao_para_fluxo(uuid, bigint, jsonb, integer, boolean, timestamptz) from public;
grant execute on function salvar_autoavaliacao_para_fluxo(uuid, bigint, jsonb, integer, boolean, timestamptz) to authenticated;

-- Autoriza RH/admin a sair de "aguardando ciência" diretamente para
-- qualquer fase editável anterior. As demais proteções do fluxo permanecem.
create or replace function validar_fluxo_avaliacao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  media numeric;
  ordem_origem integer;
  ordem_destino integer;
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

  ordem_origem := case old.status
    when 'rascunho' then 1
    when 'aguardando_autoavaliacao' then 2
    when 'aguardando_alinhamento' then 3
    when 'aguardando_ciencia' then 4
    when 'concluida' then 5
    else 0
  end;
  ordem_destino := case new.status
    when 'rascunho' then 1
    when 'aguardando_autoavaliacao' then 2
    when 'aguardando_alinhamento' then 3
    when 'aguardando_ciencia' then 4
    when 'concluida' then 5
    else 0
  end;

  if sou_rh_ou_admin()
     and new.status in ('rascunho', 'aguardando_autoavaliacao', 'aguardando_alinhamento')
     and ordem_destino < ordem_origem
     and new.ciencia_colaborador_em is null
     and new.ciencia_gestor_em is null
     and new.concluida_em is null then
    return new;
  end if;

  if old.status = 'aguardando_ciencia' then
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

    raise exception 'Aguardando ciência: cada participante só pode registrar o próprio aceite.';
  end if;

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

create or replace function retroceder_avaliacao(
  p_avaliacao_id uuid,
  p_versao bigint,
  p_status_destino text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  avaliacao avaliacoes%rowtype;
  salvo avaliacoes%rowtype;
  motivo_normalizado text;
  ordem_origem integer;
  ordem_destino integer;
  etapa_destino integer;
  nome_destino text;
  responsavel_id uuid;
  nome_colaborador text;
  nome_ator text;
  email_ator text;
  momento timestamptz := now();
  novos_dados jsonb;
begin
  if not sou_rh_ou_admin() then
    raise exception 'Apenas RH ou administrador pode retroceder avaliações.';
  end if;

  motivo_normalizado := trim(coalesce(p_motivo, ''));
  if char_length(motivo_normalizado) < 10 then
    raise exception 'Informe uma orientação para correção com pelo menos 10 caracteres.';
  end if;
  if char_length(motivo_normalizado) > 2000 then
    raise exception 'A orientação para correção deve ter no máximo 2000 caracteres.';
  end if;

  select * into avaliacao
  from avaliacoes
  where id = p_avaliacao_id
  for update;

  if not found then
    raise exception 'Avaliação não encontrada.';
  end if;
  if avaliacao.versao <> p_versao then
    raise exception 'A avaliação foi alterada em outra sessão. Recarregue antes de retroceder.';
  end if;
  if not ciclo_vigente(avaliacao.ciclo_id) then
    raise exception 'Não é possível retroceder uma avaliação fora da vigência do ciclo.';
  end if;

  ordem_origem := case avaliacao.status
    when 'rascunho' then 1
    when 'aguardando_autoavaliacao' then 2
    when 'aguardando_alinhamento' then 3
    when 'aguardando_ciencia' then 4
    when 'concluida' then 5
    else 0
  end;
  ordem_destino := case p_status_destino
    when 'rascunho' then 1
    when 'aguardando_autoavaliacao' then 2
    when 'aguardando_alinhamento' then 3
    else 0
  end;

  if ordem_destino = 0 or ordem_destino >= ordem_origem then
    raise exception 'A fase escolhida não é anterior à situação atual da avaliação.';
  end if;

  etapa_destino := case p_status_destino
    when 'rascunho' then 1
    when 'aguardando_autoavaliacao' then 4
    when 'aguardando_alinhamento' then 5
  end;
  nome_destino := case p_status_destino
    when 'rascunho' then 'Avaliação do gestor'
    when 'aguardando_autoavaliacao' then 'Autoavaliação'
    when 'aguardando_alinhamento' then 'Alinhamento e consenso'
  end;
  responsavel_id := case
    when p_status_destino = 'aguardando_autoavaliacao' then avaliacao.colaborador_id
    else avaliacao.gestor_id
  end;

  select nome into nome_colaborador from perfis where id = avaliacao.colaborador_id;
  select nome, email into nome_ator, email_ator from perfis where id = auth.uid();
  nome_ator := coalesce(nome_ator, email_ator, 'Usuário administrativo');

  novos_dados := jsonb_set(
    coalesce(avaliacao.dados, '{}'::jsonb),
    '{retrocesso}',
    jsonb_build_object(
      'motivo', motivo_normalizado,
      'status_origem', avaliacao.status,
      'status_destino', p_status_destino,
      'etapa_destino', etapa_destino,
      'retrocedido_por_nome', nome_ator,
      'retrocedido_em', momento
    ),
    true
  );

  update avaliacoes
  set status = p_status_destino,
      etapa_atual = etapa_destino,
      dados = novos_dados,
      liberado_autoavaliacao_em = case
        when p_status_destino = 'rascunho' then null
        when p_status_destino = 'aguardando_autoavaliacao' then momento
        else liberado_autoavaliacao_em
      end,
      alinhamento_em = case
        when p_status_destino in ('rascunho', 'aguardando_autoavaliacao') then null
        when p_status_destino = 'aguardando_alinhamento' then momento
        else alinhamento_em
      end,
      ciencia_colaborador_em = null,
      ciencia_gestor_em = null,
      concluida_em = null,
      pontuacao_geral = case when p_status_destino = 'rascunho' then null else pontuacao_geral end,
      percentual = case when p_status_destino = 'rascunho' then null else percentual end,
      classificacao = case when p_status_destino = 'rascunho' then null else classificacao end
  where id = p_avaliacao_id and versao = p_versao
  returning * into salvo;

  if not found then
    raise exception 'A avaliação foi alterada em outra sessão. Recarregue antes de retroceder.';
  end if;

  insert into avaliacao_retornos (
    avaliacao_id,
    status_origem,
    status_destino,
    etapa_origem,
    etapa_destino,
    motivo,
    ator_id,
    ator_nome,
    ator_email,
    versao_origem,
    versao_destino,
    criado_em
  ) values (
    avaliacao.id,
    avaliacao.status,
    salvo.status,
    avaliacao.etapa_atual,
    salvo.etapa_atual,
    motivo_normalizado,
    auth.uid(),
    nome_ator,
    email_ator,
    avaliacao.versao,
    salvo.versao,
    momento
  );

  insert into notificacoes (
    destinatario_id,
    avaliacao_id,
    ciclo_id,
    tipo,
    titulo,
    mensagem,
    categoria,
    prioridade,
    criada_por,
    dados
  ) values (
    responsavel_id,
    avaliacao.id,
    avaliacao.ciclo_id,
    'avaliacao_retornada',
    'Avaliação retornada para ' || nome_destino,
    case
      when p_status_destino = 'aguardando_autoavaliacao' then
        'Sua avaliação foi retornada por ' || nome_ator || '. Orientação: ' || motivo_normalizado
      else
        'A avaliação de ' || coalesce(nome_colaborador, 'colaborador') || ' foi retornada por ' || nome_ator || '. Orientação: ' || motivo_normalizado
    end,
    'avaliacao',
    'atencao',
    auth.uid(),
    jsonb_build_object(
      'status_origem', avaliacao.status,
      'status_destino', salvo.status,
      'motivo', motivo_normalizado
    )
  );

  return to_jsonb(salvo);
end;
$$;

revoke all on function retroceder_avaliacao(uuid, bigint, text, text) from public;
grant execute on function retroceder_avaliacao(uuid, bigint, text, text) to authenticated;
