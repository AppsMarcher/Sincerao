-- Edição de ciclo da Pesquisa de Clima: reduzir a quantidade de códigos.
--
-- clima_tokens não tem policy de escrita (o cliente nunca escreve direto),
-- então a remoção passa por esta função. Só remove códigos ainda
-- 'disponivel' -- nunca um já usado -- e escolhe quais por sorteio, pra
-- não existir critério que ligue um cartão a alguém.

create or replace function clima_reduzir_codigos(p_ciclo_id uuid, p_quantidade int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_removidos int;
begin
  if not sou_rh_ou_admin() then
    raise exception 'Acesso restrito a RH/Admin.';
  end if;

  if p_quantidade is null or p_quantidade < 1 then
    raise exception 'quantidade_invalida';
  end if;

  select status into v_status from clima_ciclos where id = p_ciclo_id for update;
  if v_status is null then
    raise exception 'ciclo_inexistente';
  end if;
  if v_status <> 'aberto' then
    raise exception 'ciclo_encerrado';
  end if;

  with sorteados as (
    select id from clima_tokens
    where ciclo_id = p_ciclo_id and status = 'disponivel'
    order by random()
    limit p_quantidade
    for update
  )
  delete from clima_tokens t using sorteados s where t.id = s.id;
  get diagnostics v_removidos = row_count;

  update clima_ciclos set total_codigos = total_codigos - v_removidos where id = p_ciclo_id;

  return v_removidos;
end $$;

revoke all on function clima_reduzir_codigos(uuid, int) from public;
grant execute on function clima_reduzir_codigos(uuid, int) to authenticated;
