import type { AlgorithmPreset } from "../../db/types";

export const ALGORITHM_LABEL: Record<AlgorithmPreset, string> = {
  general: "Repetição espaçada geral",
  fsrs: "Repetição espaçada inteligente (FSRS)",
  speed: "Aprendizado rápido",
  language: "Aprendizado de idiomas",
  medical: "Estudos de medicina",
  custom: "Personalizado",
};

export const ALGORITHM_DESC: Record<AlgorithmPreset, string> = {
  general: "Agenda cada revisão de acordo com o quanto você lembrou do cartão. Bom para quase tudo.",
  fsrs: "O algoritmo mais moderno: aprende como a sua memória funciona e agenda as revisões para manter a retenção que você escolher.",
  speed: "Sem agenda: os cartões estão sempre disponíveis e você repete até aprender todos. Ideal para revisar às vésperas de uma prova.",
  language: "Variação da repetição espaçada para vocabulário, com mais passos no primeiro dia e intervalos mais curtos.",
  medical: "Pensado para grandes volumes de conteúdo (como em medicina): passos de aprendizagem de mais de um dia e intervalo máximo de 6 meses.",
  custom: "Você define os passos de aprendizagem, os multiplicadores e os limites.",
};
