-- Cargos e competências duplicados (mesmo nome cadastrado mais de uma vez pela tela).
-- Funde cada grupo de duplicados no registro mais antigo, reatribuindo tudo que
-- referenciava os duplicados, depois trava unicidade por nome pra nunca mais acontecer.

-- =========================================================
-- CARGOS
-- =========================================================

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from cargos
)
update perfis p
set cargo_id = d.sobrevivente
from duplicados d
where p.cargo_id = d.id and d.id <> d.sobrevivente;

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from cargos
)
delete from cargo_competencias cc
using duplicados d
where cc.cargo_id = d.id
  and d.id <> d.sobrevivente
  and exists (
    select 1 from cargo_competencias cc2
    where cc2.cargo_id = d.sobrevivente and cc2.competencia_id = cc.competencia_id
  );

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from cargos
)
update cargo_competencias cc
set cargo_id = d.sobrevivente
from duplicados d
where cc.cargo_id = d.id and d.id <> d.sobrevivente;

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from cargos
)
delete from cargos c
using duplicados d
where c.id = d.id and d.id <> d.sobrevivente;

create unique index cargos_nome_unico_idx on cargos (lower(trim(nome)));

-- =========================================================
-- COMPETÊNCIAS
-- =========================================================

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from competencias
)
delete from avaliacao_notas an
using duplicados d
where an.competencia_id = d.id
  and d.id <> d.sobrevivente
  and exists (
    select 1 from avaliacao_notas an2
    where an2.avaliacao_id = an.avaliacao_id and an2.competencia_id = d.sobrevivente
  );

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from competencias
)
update avaliacao_notas an
set competencia_id = d.sobrevivente
from duplicados d
where an.competencia_id = d.id and d.id <> d.sobrevivente;

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from competencias
)
delete from cargo_competencias cc
using duplicados d
where cc.competencia_id = d.id
  and d.id <> d.sobrevivente
  and exists (
    select 1 from cargo_competencias cc2
    where cc2.cargo_id = cc.cargo_id and cc2.competencia_id = d.sobrevivente
  );

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from competencias
)
update cargo_competencias cc
set competencia_id = d.sobrevivente
from duplicados d
where cc.competencia_id = d.id and d.id <> d.sobrevivente;

with duplicados as (
  select id, first_value(id) over (partition by lower(trim(nome)) order by created_at, id) as sobrevivente
  from competencias
)
delete from competencias c
using duplicados d
where c.id = d.id and d.id <> d.sobrevivente;

create unique index competencias_nome_unico_idx on competencias (lower(trim(nome)));
