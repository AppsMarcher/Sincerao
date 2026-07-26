-- Exibe o horário informado na notificação no fuso de São Paulo, e não em UTC.
create or replace function registrar_notificacao_fluxo()
returns trigger language plpgsql security definer set search_path = public as $$
declare nome_colaborador text; nome_gestor text;
begin
  if new.status = old.status then return new; end if;
  select nome into nome_colaborador from perfis where id = new.colaborador_id;
  select nome into nome_gestor from perfis where id = new.gestor_id;
  if old.status = 'rascunho' and new.status = 'aguardando_autoavaliacao' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.colaborador_id,new.id,'fase_1_enviada','Sua autoavaliação está disponível','O gestor concluiu a primeira fase. Enviada em ' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') || '.'),
      (new.gestor_id,new.id,'fase_1_enviada','Avaliação enviada ao colaborador','A Fase 1 de ' || coalesce(nome_colaborador,'colaborador') || ' foi enviada.');
  elsif old.status = 'aguardando_autoavaliacao' and new.status = 'aguardando_alinhamento' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'fase_2_devolvida','Autoavaliação devolvida',coalesce(nome_colaborador,'O colaborador') || ' concluiu a Fase 2. Registre o consenso, plano e parecer final.'),
      (new.colaborador_id,new.id,'fase_2_devolvida','Autoavaliação enviada','Sua autoavaliação foi enviada ao gestor. O resultado final ficará disponível após o consenso.');
  elsif new.status = 'concluida' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'avaliacao_concluida','Avaliação concluída','A avaliação de ' || coalesce(nome_colaborador,'colaborador') || ' foi concluída.'),
      (new.colaborador_id,new.id,'avaliacao_concluida','Avaliação concluída','Sua avaliação foi concluída por ' || coalesce(nome_gestor,'seu gestor') || '. Consulte o plano, resumo e parecer final.');
  end if;
  return new;
end;
$$;
