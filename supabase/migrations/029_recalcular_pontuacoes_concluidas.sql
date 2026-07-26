-- Corrige avaliações já concluídas sem a média das competências gravada.
-- A regra de fluxo protege registros concluídos; ela é desativada somente
-- durante esta correção histórica e reativada na mesma transação.
alter table avaliacoes disable trigger avaliacoes_validar_fluxo;

with medias as (
  select avaliacao_id, round(avg(nota)::numeric, 2) as pontuacao
  from avaliacao_notas
  where nota is not null
  group by avaliacao_id
)
update avaliacoes a
set
  pontuacao_geral = m.pontuacao,
  percentual = round((m.pontuacao / 5) * 100, 1),
  classificacao = case
    when m.pontuacao >= 4.5 then 'Excelente'
    when m.pontuacao >= 3.5 then 'Acima das expectativas'
    when m.pontuacao >= 2.5 then 'Atende às expectativas'
    when m.pontuacao >= 1.5 then 'Em desenvolvimento'
    else 'Necessita desenvolvimento imediato'
  end
from medias m
where a.id = m.avaliacao_id
  and a.status = 'concluida'
  and a.pontuacao_geral is null;

alter table avaliacoes enable trigger avaliacoes_validar_fluxo;
