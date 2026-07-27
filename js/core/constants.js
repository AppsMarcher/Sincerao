// core/constants.js — valores fixos do domínio (escala, faixas, etapas, campos por etapa)

const ESCALA_NOTAS = [
  { nota: 1, descricao: 'Necessita desenvolver significativamente esta competência.' },
  { nota: 2, descricao: 'Apresenta a competência abaixo do esperado.' },
  { nota: 3, descricao: 'Atende às expectativas da função.' },
  { nota: 4, descricao: 'Supera frequentemente as expectativas.' },
  { nota: 5, descricao: 'É referência para a equipe nesta competência.' },
];

const FAIXAS_CLASSIFICACAO = [
  { min: 4.5, label: 'Excelente' },
  { min: 3.5, label: 'Acima das expectativas' },
  { min: 2.5, label: 'Atende às expectativas' },
  { min: 1.5, label: 'Em desenvolvimento' },
  { min: 0, label: 'Necessita desenvolvimento imediato' },
];

const ETAPAS = [
  { n: 1, id: 'resultados', label: 'Resultados do Período' },
  { n: 2, id: 'competencias', label: 'Avaliação das Competências' },
  { n: 3, id: 'feedback_gestor', label: 'Feedback do Gestor' },
  { n: 4, id: 'autoavaliacao', label: 'Autoavaliação' },
  { n: 5, id: 'resumo', label: 'Plano de Desenvolvimento' },
  { n: 6, id: 'parecer_final', label: 'Parecer Final' },
];

// id 'resumo' mantido de propósito (era a etapa "Resumo da Avaliação") -- só
// o label mudou pra "Plano de Desenvolvimento" acima. Manter a chave evita
// tocar em qualquer lugar que lê/grava av.dados.resumo, RLS ou trigger.
const CAMPOS_ETAPA = {
  resultados: [
    ['entregas', 'Quais foram as principais entregas realizadas pelo colaborador?'],
    ['desafios', 'Quais desafios foram enfrentados?'],
    ['melhorias', 'Quais melhorias ou iniciativas partiram deste colaborador?'],
  ],
  feedback_gestor: [
    ['reconhecer', 'Quais comportamentos devem ser reconhecidos? Cite exemplos.'],
    ['desenvolver', 'Quais comportamentos precisam ser desenvolvidos? Cite exemplos.'],
  ],
  autoavaliacao: [
    ['orgulho', 'Do que você mais se orgulha?'],
    ['dificuldades', 'Quais dificuldades enfrentou?'],
    ['competencias_desenvolver', 'Quais competências gostaria de desenvolver?'],
  ],
  resumo: [
    ['fortalezas', 'Principais fortalezas'],
    ['oportunidades', 'Principais oportunidades'],
    ['prioridade_desenvolvimento', 'Prioridade de desenvolvimento'],
    ['treinamentos_recomendados', 'Treinamentos recomendados'],
  ],
};
