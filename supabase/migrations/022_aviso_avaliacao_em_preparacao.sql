-- Aviso seguro para o colaborador: informa que existe um ciclo em preparação
-- sem expor o rascunho, o gestor ou qualquer conteúdo da avaliação.
create or replace view minhas_avaliacoes_em_preparacao as
select c.nome as ciclo_nome, c.data_inicio, c.data_fim
from avaliacoes a
join ciclos_avaliacao c on c.id = a.ciclo_id
where a.colaborador_id = auth.uid()
  and a.status = 'rascunho'
  and data_atual_ciclo() between c.data_inicio and c.data_fim;
grant select on minhas_avaliacoes_em_preparacao to authenticated;
