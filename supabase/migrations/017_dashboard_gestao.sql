alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('colaborador', 'gestor', 'rh', 'admin', 'diretoria'));

create or replace function indicadores_gestao(p_ciclo_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare resultado jsonb;
begin
  if not coalesce((select papel in ('rh','admin','diretoria') from perfis where id = auth.uid()), false) then raise exception 'Acesso restrito à gestão.'; end if;
  with base as (
    select a.*, s.nome as setor_nome from avaliacoes a left join perfis p on p.id=a.colaborador_id left join cargos c on c.id=p.cargo_id left join setores s on s.id=c.setor_id where p_ciclo_id is null or a.ciclo_id=p_ciclo_id
  ), totais as (
    select count(*)::int total, count(*) filter(where status='rascunho')::int fase_1, count(*) filter(where status='aguardando_autoavaliacao')::int fase_2, count(*) filter(where status='aguardando_alinhamento')::int fase_3, count(*) filter(where status='concluida')::int concluidas, round(avg(pontuacao_geral) filter(where status='concluida'),2) nota_media from base
  ), por_status as (select status,count(*)::int quantidade from base group by status order by status),
  por_classificacao as (select coalesce(classificacao,'Sem classificação') classificacao,count(*)::int quantidade from base where status='concluida' group by classificacao order by quantidade desc),
  por_setor as (select coalesce(setor_nome,'Sem setor') setor,count(*)::int total,count(*) filter(where status='concluida')::int concluidas,round(avg(pontuacao_geral) filter(where status='concluida'),2) nota_media from base group by setor_nome order by setor),
  competencias as (select co.nome competencia,round(avg(n.nota),2) nota_media,count(*)::int avaliacoes from avaliacao_notas n join base b on b.id=n.avaliacao_id join competencias co on co.id=n.competencia_id where b.status='concluida' and n.nota is not null group by co.nome order by nota_media asc,avaliacoes desc limit 10)
  select jsonb_build_object('totais',(select to_jsonb(totais) from totais),'por_status',coalesce((select jsonb_agg(to_jsonb(por_status)) from por_status),'[]'::jsonb),'por_classificacao',coalesce((select jsonb_agg(to_jsonb(por_classificacao)) from por_classificacao),'[]'::jsonb),'por_setor',coalesce((select jsonb_agg(to_jsonb(por_setor)) from por_setor),'[]'::jsonb),'competencias',coalesce((select jsonb_agg(to_jsonb(competencias)) from competencias),'[]'::jsonb)) into resultado;
  return resultado;
end $$;
grant execute on function indicadores_gestao(uuid) to authenticated;
