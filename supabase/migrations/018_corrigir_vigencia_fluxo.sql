-- A migration 016 substituiu as policies de leitura e precisa manter a janela
-- do ciclo também para gestor e colaborador.

drop policy avaliacoes_select on avaliacoes;
create policy avaliacoes_select on avaliacoes for select using (
  (gestor_id = auth.uid() and ciclo_vigente(ciclo_id))
  or (colaborador_id = auth.uid() and status <> 'aguardando_autoavaliacao' and ciclo_vigente(ciclo_id))
  or sou_rh_ou_admin()
);

drop policy avaliacao_notas_select on avaliacao_notas;
create policy avaliacao_notas_select on avaliacao_notas for select using (
  exists (
    select 1 from avaliacoes a
    where a.id = avaliacao_notas.avaliacao_id
      and (
        (a.gestor_id = auth.uid() and ciclo_vigente(a.ciclo_id))
        or (a.colaborador_id = auth.uid() and a.status <> 'aguardando_autoavaliacao' and ciclo_vigente(a.ciclo_id))
        or sou_rh_ou_admin()
      )
  )
);

create or replace view avaliacoes_resumo as
select a.id, a.ciclo_id, a.colaborador_id, a.gestor_id, a.status, a.etapa_atual,
  a.pontuacao_geral, a.percentual, a.classificacao, a.liberado_autoavaliacao_em,
  a.alinhamento_em, a.ciencia_colaborador_em, a.ciencia_gestor_em, a.ciencia_rh_em,
  a.concluida_em, a.created_at, a.updated_at, a.versao,
  jsonb_build_object('nome', pc.nome) as colaborador,
  jsonb_build_object('nome', pg.nome) as gestor,
  jsonb_build_object('nome', c.nome) as ciclo
from avaliacoes a
join perfis pc on pc.id = a.colaborador_id
join perfis pg on pg.id = a.gestor_id
join ciclos_avaliacao c on c.id = a.ciclo_id
where sou_rh_ou_admin()
   or ((a.colaborador_id = auth.uid() or a.gestor_id = auth.uid()) and current_date between c.data_inicio and c.data_fim);

create or replace function obter_avaliacao_para_fluxo(p_avaliacao_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a avaliacoes%rowtype;
begin
  select * into a from avaliacoes where id = p_avaliacao_id;
  if not found then return null; end if;
  if sou_rh_ou_admin() then return to_jsonb(a); end if;
  if not ciclo_vigente(a.ciclo_id) then return null; end if;
  if a.gestor_id = auth.uid() or (a.colaborador_id = auth.uid() and a.status <> 'aguardando_autoavaliacao') then return to_jsonb(a); end if;
  if a.colaborador_id = auth.uid() and a.status = 'aguardando_autoavaliacao' then
    return jsonb_build_object('id',a.id,'ciclo_id',a.ciclo_id,'colaborador_id',a.colaborador_id,
      'gestor_id',a.gestor_id,'status',a.status,'etapa_atual',a.etapa_atual,'versao',a.versao,
      'dados',jsonb_build_object('autoavaliacao',coalesce(a.dados->'autoavaliacao','{}'::jsonb),
                                  'feedback_colaborador',coalesce(a.dados->'feedback_colaborador','{}'::jsonb)));
  end if;
  return null;
end $$;
