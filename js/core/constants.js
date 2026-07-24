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
  { n: 5, id: 'feedback_colaborador', label: 'Feedback do Colaborador ao Gestor' },
  { n: 6, id: 'plano_desenvolvimento', label: 'Plano de Desenvolvimento' },
  { n: 7, id: 'resumo', label: 'Resumo da Avaliação' },
  { n: 8, id: 'parecer_final', label: 'Parecer Final' },
];

const CAMPOS_ETAPA = {
  resultados: [
    ['entregas', 'Quais foram as principais entregas realizadas pelo colaborador?'],
    ['impacto', 'Quais resultados geraram impacto para a equipe ou empresa?'],
    ['metas_atingidas', 'Quais metas foram alcançadas?'],
    ['metas_nao_atingidas', 'Houve alguma meta que não foi atingida? Se sim, por quê?'],
    ['desafios', 'Quais desafios foram enfrentados?'],
    ['melhorias', 'Quais melhorias ou iniciativas partiram deste colaborador?'],
  ],
  feedback_gestor: [
    ['reconhecer', 'Quais comportamentos devem ser reconhecidos? Cite exemplos.'],
    ['desenvolver', 'Quais comportamentos precisam ser desenvolvidos? Cite exemplos.'],
    ['evoluiu', 'O colaborador evoluiu em relação ao último ciclo?'],
    ['expectativas', 'Quais expectativas existem para o próximo período?'],
  ],
  autoavaliacao: [
    ['como_avalia', 'Como você avalia seu desempenho?'],
    ['orgulho', 'Do que você mais se orgulha?'],
    ['dificuldades', 'Quais dificuldades enfrentou?'],
    ['faria_diferente', 'O que faria diferente?'],
    ['competencias_desenvolver', 'Quais competências gostaria de desenvolver?'],
    ['apoio_empresa', 'Que apoio espera da empresa?'],
    ['apoio_gestor', 'Que apoio espera do gestor?'],
  ],
  feedback_colaborador: [
    ['suporte_gestor', 'O gestor forneceu o suporte necessário durante o período?'],
    ['gestor_faria_diferente', 'O que poderia fazer de forma diferente para apoiar seu desenvolvimento?'],
    ['sobre_lideranca', 'Há algo que gostaria de compartilhar sobre a liderança?'],
  ],
  resumo: [
    ['fortalezas', 'Principais fortalezas'],
    ['oportunidades', 'Principais oportunidades'],
    ['prioridade_desenvolvimento', 'Prioridade de desenvolvimento'],
    ['treinamentos_recomendados', 'Treinamentos recomendados'],
  ],
};
