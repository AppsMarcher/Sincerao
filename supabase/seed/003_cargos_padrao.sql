-- Cadastro dos cargos padrão (sem setor definido)
-- Ignora silenciosamente cargos que já existirem (mesmo nome + mesmo setor,
-- respeitando o índice único cargos_nome_setor_id_unico_idx da migration 008)
-- Rodar depois da migration 008 (setor virou setor_id).

insert into cargos (nome, setor_id) values
('ALMOXARIFE', null),
('ANALISTA', null),
('ANALISTA ADMINISTRATIVO', null),
('ASSISTENTE', null),
('AUXILIAR', null),
('COORDENADOR(A)', null),
('DIRETOR', null),
('ELETRICISTA', null),
('ENGENHEIRO', null),
('GERENTE', null),
('INSPETOR(A)', null),
('LÍDER', null),
('MECÂNICO', null),
('MONTADOR', null),
('OPERADOR', null),
('PINTOR', null),
('PROGRAMADOR(A)', null),
('PROJETISTA', null),
('SOLDADOR', null),
('VENDEDOR', null)
on conflict (lower(trim(nome)), coalesce(setor_id::text, ''))
do nothing;
