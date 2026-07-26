-- O status do ciclo é consequência do período, nunca uma escolha manual.
create or replace function status_ciclo_por_periodo(p_inicio date, p_fim date, p_referencia date default current_date)
returns text language sql immutable as $$
  select case
    when p_referencia < p_inicio then 'planejado'
    when p_referencia > p_fim then 'encerrado'
    else 'em_andamento'
  end;
$$;

create or replace function sincronizar_status_ciclo()
returns trigger language plpgsql set search_path = public as $$
begin
  new.status := status_ciclo_por_periodo(new.data_inicio, new.data_fim);
  return new;
end;
$$;

create trigger ciclos_avaliacao_sincronizar_status
before insert or update of data_inicio, data_fim on ciclos_avaliacao
for each row execute function sincronizar_status_ciclo();

update ciclos_avaliacao
set status = status_ciclo_por_periodo(data_inicio, data_fim);
