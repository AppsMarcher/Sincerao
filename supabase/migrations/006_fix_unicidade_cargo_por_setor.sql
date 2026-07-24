-- Correção: cargos com o mesmo nome em setores diferentes são registros legítimos
-- e distintos (ex: "Analista" em RH e "Analista" em Financeiro). A migration 005
-- errou ao travar unicidade só por nome — troca para nome + setor.

drop index if exists cargos_nome_unico_idx;

create unique index cargos_nome_setor_unico_idx on cargos (lower(trim(nome)), lower(trim(coalesce(setor, ''))));
