-- Fluxo em três fases, notificações internas e proteção da avaliação do gestor.

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references perfis(id) on delete cascade,
  avaliacao_id uuid references avaliacoes(id) on delete cascade,
  tipo text not null check (tipo in ('fase_1_enviada', 'fase_2_devolvida', 'avaliacao_concluida')),
  titulo text not null,
  mensagem text not null,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index notificacoes_destinatario_created_idx on notificacoes (destinatario_id, created_at desc);
alter table notificacoes enable row level security;
create policy notificacoes_select on notificacoes for select using (destinatario_id = auth.uid() or sou_rh_ou_admin());
create policy notificacoes_update on notificacoes for update using (destinatario_id = auth.uid()) with check (destinatario_id = auth.uid());

-- O colaborador não lê a linha original enquanto responde a Fase 2: ela contém
-- o JSON e as notas do gestor. O app usa a RPC abaixo, que devolve somente seus campos.
drop policy avaliacoes_select on avaliacoes;
create policy avaliacoes_select on avaliacoes for select using (
  gestor_id = auth.uid()
  or (colaborador_id = auth.uid() and status <> 'aguardando_autoavaliacao')
  or sou_rh_ou_admin()
);
drop policy avaliacao_notas_select on avaliacao_notas;
create policy avaliacao_notas_select on avaliacao_notas for select using (
  exists (select 1 from avaliacoes a where a.id = avaliacao_notas.avaliacao_id
    and (a.gestor_id = auth.uid() or sou_rh_ou_admin()
      or (a.colaborador_id = auth.uid() and a.status <> 'aguardando_autoavaliacao')))
);

-- Lista segura para a tela principal. Não expõe o JSON de respostas.
create view avaliacoes_resumo as
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
where a.colaborador_id = auth.uid() or a.gestor_id = auth.uid() or sou_rh_ou_admin();
grant select on avaliacoes_resumo to authenticated;

create or replace function obter_avaliacao_para_fluxo(p_avaliacao_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a avaliacoes%rowtype;
begin
  select * into a from avaliacoes where id = p_avaliacao_id;
  if not found then return null; end if;
  if sou_rh_ou_admin() or a.gestor_id = auth.uid() or
     (a.colaborador_id = auth.uid() and a.status <> 'aguardando_autoavaliacao') then
    return to_jsonb(a);
  end if;
  if a.colaborador_id = auth.uid() and a.status = 'aguardando_autoavaliacao' then
    return jsonb_build_object('id',a.id,'ciclo_id',a.ciclo_id,'colaborador_id',a.colaborador_id,
      'gestor_id',a.gestor_id,'status',a.status,'etapa_atual',a.etapa_atual,'versao',a.versao,
      'dados',jsonb_build_object('autoavaliacao',coalesce(a.dados->'autoavaliacao','{}'::jsonb),
                                  'feedback_colaborador',coalesce(a.dados->'feedback_colaborador','{}'::jsonb)));
  end if;
  return null;
end $$;
grant execute on function obter_avaliacao_para_fluxo(uuid) to authenticated;

create or replace function registrar_notificacao_fluxo()
returns trigger language plpgsql security definer set search_path = public as $$
declare nome_colaborador text; nome_gestor text;
begin
  if new.status = old.status then return new; end if;
  select nome into nome_colaborador from perfis where id = new.colaborador_id;
  select nome into nome_gestor from perfis where id = new.gestor_id;
  if old.status = 'rascunho' and new.status = 'aguardando_autoavaliacao' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.colaborador_id,new.id,'fase_1_enviada','Sua autoavaliação está disponível','O gestor concluiu a primeira fase. Enviada em ' || to_char(now(),'DD/MM/YYYY HH24:MI') || '.'),
      (new.gestor_id,new.id,'fase_1_enviada','Avaliação enviada ao colaborador','A Fase 1 de ' || coalesce(nome_colaborador,'colaborador') || ' foi enviada.');
  elsif old.status = 'aguardando_autoavaliacao' and new.status = 'aguardando_alinhamento' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'fase_2_devolvida','Autoavaliação devolvida','' || coalesce(nome_colaborador,'O colaborador') || ' concluiu a Fase 2. Alinhem o plano de desenvolvimento.'),
      (new.colaborador_id,new.id,'fase_2_devolvida','Avaliação encaminhada ao alinhamento','Sua avaliação foi devolvida ao gestor. A Fase 3 está disponível.');
  elsif new.status = 'concluida' then
    insert into notificacoes (destinatario_id,avaliacao_id,tipo,titulo,mensagem) values
      (new.gestor_id,new.id,'avaliacao_concluida','Avaliação concluída','A avaliação de ' || coalesce(nome_colaborador,'colaborador') || ' foi concluída.'),
      (new.colaborador_id,new.id,'avaliacao_concluida','Avaliação concluída','Sua avaliação foi concluída por ' || coalesce(nome_gestor,'seu gestor') || '.');
  end if;
  return new;
end $$;
create trigger avaliacoes_registrar_notificacao_fluxo after update on avaliacoes
for each row execute function registrar_notificacao_fluxo();
