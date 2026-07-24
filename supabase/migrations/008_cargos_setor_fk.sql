-- Troca cargos.setor (texto livre) por cargos.setor_id (FK pra tabela setores,
-- criada na migration 007). Rodar depois do seed 004_setores_padrao.

-- Garante que nenhum setor já digitado em cargos.setor (ainda que fora dos
-- 26 nomes padrão do seed) fique órfão: cria na tabela setores o que faltar.
insert into setores (nome)
select distinct trim(c.setor)
from cargos c
where c.setor is not null and trim(c.setor) <> ''
on conflict (lower(trim(nome))) do nothing;

alter table cargos add column setor_id uuid references setores(id);

update cargos c
set setor_id = s.id
from setores s
where c.setor is not null
  and lower(trim(c.setor)) = lower(trim(s.nome));

drop index if exists cargos_nome_setor_unico_idx;

alter table cargos drop column setor;

create unique index cargos_nome_setor_id_unico_idx on cargos (lower(trim(nome)), coalesce(setor_id::text, ''));
