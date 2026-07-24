-- Cadastro dos setores padrão. Ignora silenciosamente os que já existirem
-- (índice único setores_nome_unico_idx da migration 007).
-- Rodar depois da migration 007 e antes da 008 (que usa esses nomes pra
-- preencher cargos.setor_id a partir do texto livre antigo).

insert into setores (nome) values
('COMERCIAL'),
('COMPRAS'),
('CONTÁBIL'),
('CONTROLADORIA'),
('ELÉTRICO'),
('ENGENHARIA'),
('ESTOQUES'),
('EXPEDIÇÃO'),
('EXPORTAÇÃO'),
('FINANCEIRO'),
('FISCAL'),
('INDICADORES'),
('LOGÍSTICA'),
('MANUTENÇÃO'),
('MARKETING'),
('PCP'),
('PINTURA'),
('PÓS-VENDAS'),
('PROCESSOS'),
('PRODUÇÃO'),
('PRODUTO'),
('QUALIDADE'),
('RECURSOS HUMANOS'),
('SUPORTE TÉCNICO'),
('SUPPLY CHAIN'),
('VENDAS')
on conflict (lower(trim(nome)))
do nothing;
