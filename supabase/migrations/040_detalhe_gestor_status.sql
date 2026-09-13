-- Popover "quem está incluído neste número" na tela de Indicadores de
-- Gestão (Resultados por gestor). RPC dedicada em vez de reaproveitar a
-- view avaliacoes_resumo (migration 021) porque essa view usa
-- sou_rh_ou_admin() -- só 'rh'/'admin' -- e quem acessa essa tela também
-- inclui o papel 'diretoria' (mesma checagem de indicadores_gestao,
-- migration 035). Sem essa função dedicada, um usuário 'diretoria' veria a
-- tela normalmente mas o popover sempre voltaria vazio pra ele.
create or replace function detalhe_gestor_status(p_gestor_id uuid default null, p_status text default null, p_ciclo_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare resultado jsonb;
begin
  if not coalesce((select papel in ('rh','admin','diretoria') from perfis where id = auth.uid()), false) then
    raise exception 'Acesso restrito a gestao.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'colaborador', p.nome,
    'cargo', c.nome
  ) order by p.nome), '[]'::jsonb)
  into resultado
  from avaliacoes a
  join perfis p on p.id = a.colaborador_id
  left join cargos c on c.id = p.cargo_id
  where ((p_gestor_id is null and a.gestor_id is null) or a.gestor_id = p_gestor_id)
    and (p_status is null or a.status = p_status)
    and (p_ciclo_id is null or a.ciclo_id = p_ciclo_id);

  return resultado;
end $$;

grant execute on function detalhe_gestor_status(uuid, text, uuid) to authenticated;
