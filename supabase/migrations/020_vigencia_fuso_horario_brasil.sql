-- A data do ciclo segue o calendário brasileiro. current_date no Supabase pode
-- estar em UTC e antecipar a abertura para 21h do dia anterior em São Paulo.
create or replace function data_atual_ciclo()
returns date language sql stable as $$
  select timezone('America/Sao_Paulo', now())::date;
$$;

create or replace function ciclo_vigente(p_ciclo_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from ciclos_avaliacao
    where id = p_ciclo_id
      and data_atual_ciclo() between data_inicio and data_fim
  );
$$;

create or replace function status_ciclo_por_periodo(p_inicio date, p_fim date, p_referencia date default null)
returns text language sql stable as $$
  select case
    when coalesce(p_referencia, data_atual_ciclo()) < p_inicio then 'planejado'
    when coalesce(p_referencia, data_atual_ciclo()) > p_fim then 'encerrado'
    else 'em_andamento'
  end;
$$;

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
   or ((a.colaborador_id = auth.uid() or a.gestor_id = auth.uid()) and data_atual_ciclo() between c.data_inicio and c.data_fim);

update ciclos_avaliacao
set status = status_ciclo_por_periodo(data_inicio, data_fim);
