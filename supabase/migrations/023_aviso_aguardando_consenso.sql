-- Aviso seguro ao colaborador após o envio da autoavaliação.
create or replace view minhas_avaliacoes_aguardando_consenso as
select c.nome as ciclo_nome
from avaliacoes a
join ciclos_avaliacao c on c.id = a.ciclo_id
where a.colaborador_id = auth.uid()
  and a.status = 'aguardando_alinhamento'
  and data_atual_ciclo() between c.data_inicio and c.data_fim;
grant select on minhas_avaliacoes_aguardando_consenso to authenticated;
