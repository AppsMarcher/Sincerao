-- Preserva a identificação do responsável de RH que confirmou ciência,
-- para que ela possa constar no relatório da avaliação.
alter table avaliacoes
  add column if not exists ciencia_rh_nome text,
  add column if not exists ciencia_rh_email text;
