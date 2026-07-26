-- Reaplica a RPC da Fase 2 em bancos que já receberam a migração 024.
-- A gravação deve alterar somente os dois grupos que pertencem ao colaborador.

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
    'id', salvo.id, 'ciclo_id', salvo.ciclo_id, 'colaborador_id', salvo.colaborador_id,
    'gestor_id', salvo.gestor_id, 'status', salvo.status, 'etapa_atual', salvo.etapa_atual,
    'versao', salvo.versao,
    'dados', jsonb_build_object(
      'autoavaliacao', coalesce(salvo.dados->'autoavaliacao', '{}'::jsonb),
      'feedback_colaborador', coalesce(salvo.dados->'feedback_colaborador', '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function salvar_autoavaliacao_para_fluxo(uuid, bigint, jsonb, integer, boolean, timestamptz) from public;
grant execute on function salvar_autoavaliacao_para_fluxo(uuid, bigint, jsonb, integer, boolean, timestamptz) to authenticated;
