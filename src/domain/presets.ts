import type { AlgorithmParams, AlgorithmPreset, DeckSettings } from "../db/types";

/**
 * Algorithm presets. The numeric values are our own choices.
 */
export const PRESET_PARAMS: Record<Exclude<AlgorithmPreset, "custom">, AlgorithmParams> = {
  general: {
    learningSteps: [1, 10],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    easyBonus: 1.3,
    intervalModifier: 1,
    hardMultiplier: 1.2,
    maxInterval: 36500,
    desiredRetention: 0.9,
  },
  language: {
    learningSteps: [1, 10, 60],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 3,
    startingEase: 2.3,
    easyBonus: 1.25,
    intervalModifier: 0.9,
    hardMultiplier: 1.2,
    maxInterval: 365,
    desiredRetention: 0.9,
  },
  medical: {
    learningSteps: [10, 60, 1440],
    relearningSteps: [10, 1440],
    graduatingInterval: 3,
    easyInterval: 5,
    startingEase: 2.5,
    easyBonus: 1.3,
    intervalModifier: 1,
    hardMultiplier: 1.2,
    maxInterval: 180,
    desiredRetention: 0.92,
  },
  fsrs: {
    learningSteps: [1, 10],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    easyBonus: 1.3,
    intervalModifier: 1,
    hardMultiplier: 1.2,
    maxInterval: 36500,
    desiredRetention: 0.9,
  },
  speed: {
    learningSteps: [],
    relearningSteps: [],
    graduatingInterval: 0,
    easyInterval: 0,
    startingEase: 2.5,
    easyBonus: 1,
    intervalModifier: 1,
    hardMultiplier: 1,
    maxInterval: 0,
    desiredRetention: 0.9,
  },
};

export const paramsFor = (preset: AlgorithmPreset, current?: AlgorithmParams): AlgorithmParams =>
  preset === "custom" ? { ...(current ?? PRESET_PARAMS.general) } : { ...PRESET_PARAMS[preset] };

export const defaultDeckSettings = (): DeckSettings => ({
  algorithm: "general",
  params: paramsFor("general"),
  newPerDay: 20,
  maxReviewsPerDay: 9999,
  shuffle: false,
  reverse: false,
  tts: { frontLang: "pt-BR", backLang: "pt-BR", autoplay: false, readWholeCard: true },
  style: { font: "default", textSize: 22, align: "center" },
});

export const isScheduled = (preset: AlgorithmPreset) => preset !== "speed";
