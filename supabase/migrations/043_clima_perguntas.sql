-- Perguntas da Pesquisa de Clima editáveis pelo RH/Admin (tela Administração).
--
-- O id da pergunta é a chave estável usada em clima_respostas.respostas
-- ('q' || id). Editar texto/ordem/bloco não mexe nas respostas já dadas;
-- desativar tira a pergunta do questionário sem perder o histórico.
-- Leitura pública (a página /clima roda sem login); escrita só rh/admin.

create table clima_perguntas (
  id int generated always as identity primary key,
  ordem int not null,
  secao text not null,
  texto text not null,
  tipo text not null default 'likert' check (tipo in ('likert', 'nps')),
  rotulo_esq text,
  rotulo_dir text,
  enps boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
-- Só uma pergunta pode ser a base do eNPS.
create unique index clima_perguntas_enps_uq on clima_perguntas ((true)) where enps;

alter table clima_perguntas enable row level security;

create policy clima_perguntas_select on clima_perguntas for select
  to anon, authenticated using (true);
create policy clima_perguntas_rh_admin on clima_perguntas for all
  to authenticated using (sou_rh_ou_admin()) with check (sou_rh_ou_admin());

insert into clima_perguntas (id, ordem, secao, texto, tipo, rotulo_esq, rotulo_dir, enps) overriding system value values
  (1, 1, 'Cultura e relacionamento', 'Seus valores estão alinhados a cultura da empresa?', 'likert', null, null, false),
  (2, 2, 'Cultura e relacionamento', 'Você se sente confortável com a sua equipe / colegas de trabalho?', 'likert', null, null, false),
  (3, 3, 'Cultura e relacionamento', 'O dia a dia de trabalho é agradável para você?', 'likert', null, null, false),
  (4, 4, 'Cultura e relacionamento', 'Você se sente pertencente à empresa?', 'likert', null, null, false),
  (5, 5, 'Cultura e relacionamento', 'Os seus colegas de trabalho te ajudam quando há necessidade?', 'likert', null, null, false),
  (6, 6, 'Liderança', 'O seu gestor é claro nas tarefas que delega?', 'likert', null, null, false),
  (7, 7, 'Liderança', 'Na sua opinião, as suas entregas são valorizadas?', 'likert', null, null, false),
  (8, 8, 'Liderança', 'Você se sente confortável para pedir feedbacks para o seu gestor?', 'likert', null, null, false),
  (9, 9, 'Liderança', 'O seu gestor oferece o suporte necessário para a realização do trabalho?', 'likert', null, null, false),
  (10, 10, 'Liderança', 'Seu gestor te incentiva a aprender e impulsionar sua carreira?', 'likert', null, null, false),
  (11, 11, 'Função e desafio', 'Você se sente satisfeito com as funções que desempenha no seu dia a dia?', 'likert', null, null, false),
  (12, 12, 'Função e desafio', 'Você se sente desafiado positivamente no trabalho?', 'likert', null, null, false),
  (13, 13, 'Ambiente e ferramentas', 'O ambiente de trabalho é adequado para realizar as suas atividades?', 'likert', null, null, false),
  (14, 14, 'Ambiente e ferramentas', 'Seu ambiente de trabalho fornece o conforto e segurança necessários?', 'likert', null, null, false),
  (15, 15, 'Ambiente e ferramentas', 'Você possui acesso a todas as ferramentas, sejam físicas ou digitais, para desempenhar as suas funções?', 'likert', null, null, false),
  (16, 16, 'Ambiente e ferramentas', 'O ambiente de trabalho possibilita a concentração necessária para desempenhar as suas funções?', 'likert', null, null, false),
  (17, 17, 'Remuneração', 'Você considera que o seu salário é adequado ao praticado no mercado?', 'likert', null, null, false),
  (18, 18, 'Orgulho e realização', 'Você sente orgulho de trabalhar na empresa?', 'likert', null, null, false),
  (19, 19, 'Orgulho e realização', 'Você se sente realizado profissionalmente?', 'likert', null, null, false),
  (20, 20, 'Para fechar', 'Qual a probabilidade de você indicar a empresa para um amigo?', 'nps', 'Nada provável', 'Extremamente provável', true),
  (21, 21, 'Para fechar', 'O quanto você se dedica para ter um bom ambiente de trabalho?', 'nps', 'Pouco dedicado(a)', 'Totalmente dedicado(a)', false);

select setval(pg_get_serial_sequence('clima_perguntas', 'id'), 21);

-- Agregação: o eNPS passa a usar a pergunta marcada com enps = true (antes
-- era q20 fixo). Só perguntas ainda existentes entram nas médias.
create or replace function clima_resultados_agregados(p_ciclo_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_ciclo clima_ciclos%rowtype;
  v_medias jsonb;
  v_nps jsonb;
  v_chave_enps text;
begin
  if not sou_rh_ou_admin() then
    raise exception 'Acesso restrito a RH/Admin.';
  end if;

  select * into v_ciclo from clima_ciclos where id = p_ciclo_id;
  select count(*) into v_total from clima_respostas where ciclo_id = p_ciclo_id;

  if v_total < 5 then
    return jsonb_build_object(
      'insuficiente', true,
      'total_respondidos', v_total,
      'total_codigos', coalesce(v_ciclo.total_codigos, 0)
    );
  end if;

  select jsonb_object_agg(chave, media) into v_medias
  from (
    select kv.key as chave, avg((kv.value)::numeric) as media
    from clima_respostas r, jsonb_each_text(r.respostas) kv
    where r.ciclo_id = p_ciclo_id and kv.key like 'q%'
    group by kv.key
  ) t;

  select 'q' || id into v_chave_enps from clima_perguntas where enps limit 1;

  if v_chave_enps is not null then
    select jsonb_build_object(
      'promotores', count(*) filter (where (respostas ->> v_chave_enps)::numeric >= 9),
      'neutros', count(*) filter (where (respostas ->> v_chave_enps)::numeric between 7 and 8),
      'detratores', count(*) filter (where (respostas ->> v_chave_enps)::numeric <= 6)
    ) into v_nps
    from clima_respostas
    where ciclo_id = p_ciclo_id and respostas ? v_chave_enps;
  end if;

  return jsonb_build_object(
    'insuficiente', false,
    'total_respondidos', v_total,
    'total_codigos', coalesce(v_ciclo.total_codigos, 0),
    'medias_por_pergunta', coalesce(v_medias, '{}'::jsonb),
    'nps', coalesce(v_nps, '{"promotores":0,"neutros":0,"detratores":0}'::jsonb)
  );
end $$;
