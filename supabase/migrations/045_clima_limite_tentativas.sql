-- Sobe o limite de tentativas por IP na validação de código do clima de 8 para
-- 50 a cada 5 minutos. Com 8, ~20 pessoas atrás do mesmo IP de saída da empresa
-- (NAT) estouravam o limite juntas, mesmo digitando o código certo.

create or replace function clima_validar_e_consumir_codigo(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ip text;
  v_tentativas int;
  v_token clima_tokens%rowtype;
  v_ciclo_status text;
begin
  v_ip := coalesce(
    split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
    'desconhecido'
  );

  delete from clima_tentativas_codigo where tentado_em < now() - interval '1 day';

  select count(*) into v_tentativas
  from clima_tentativas_codigo
  where ip = v_ip and tentado_em > now() - interval '5 minutes';

  if v_tentativas >= 50 then
    raise exception 'muitas_tentativas';
  end if;

  insert into clima_tentativas_codigo (ip) values (v_ip);

  select * into v_token from clima_tokens where codigo = p_codigo for update;

  if not found then
    raise exception 'codigo_invalido';
  end if;

  if v_token.status = 'usado' then
    raise exception 'codigo_usado';
  end if;

  if v_token.status = 'invalidado' then
    raise exception 'codigo_invalido';
  end if;

  select status into v_ciclo_status from clima_ciclos where id = v_token.ciclo_id;
  if v_ciclo_status is distinct from 'aberto' then
    raise exception 'ciclo_encerrado';
  end if;

  update clima_tokens set status = 'usado', usado_em = now() where id = v_token.id;
  update clima_ciclos set total_respondidos = total_respondidos + 1 where id = v_token.ciclo_id;

  return v_token.ciclo_id;
end $$;

revoke all on function clima_validar_e_consumir_codigo(text) from public;
grant execute on function clima_validar_e_consumir_codigo(text) to anon;
