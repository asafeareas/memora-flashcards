export type AlgorithmPreset = "general" | "fsrs" | "speed" | "language" | "medical" | "custom";

export interface AlgorithmParams {
  /** Learning steps in minutes (e.g. [1, 10]). */
  learningSteps: number[];
  /** Relearning steps in minutes after a lapse. */
  relearningSteps: number[];
  /** First interval (days) when a card graduates with Good. */
  graduatingInterval: number;
  /** First interval (days) when a new card is answered Easy. */
  easyInterval: number;
  /** Starting ease factor (2.5 = 250%). */
  startingEase: number;
  /** Extra multiplier applied when answering Easy (1.3 = 130%). */
  easyBonus: number;
  /** Multiplier applied to every review interval (1 = 100%). */
  intervalModifier: number;
  /** Interval multiplier for Hard (1.2 = 120%). */
  hardMultiplier: number;
  /** Maximum interval in days. */
  maxInterval: number;
  /** FSRS desired retention (0.7 – 0.99). */
  desiredRetention: number;
}

export interface TtsSettings {
  frontLang: string;
  backLang: string;
  autoplay: boolean;
  readWholeCard: boolean;
}

export interface CardStyle {
  font: string;
  textSize: number; // px
  align: "left" | "center" | "right";
}

export interface DeckSettings {
  algorithm: AlgorithmPreset;
  params: AlgorithmParams;
  newPerDay: number;
  maxReviewsPerDay: number;
  shuffle: boolean;
  reverse: boolean;
  tts: TtsSettings;
  style: CardStyle;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  createdAt: number;
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  parentId: string | null;
  folderId: string | null;
  color: string;
  emoji: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  /** Last time a card of this deck was studied. */
  studiedAt?: number;
  archivedAt: number | null;
  deletedAt: number | null;
  settings: DeckSettings;
}

export type NoteType = "basic" | "cloze" | "occlusion";

export interface OcclusionMask {
  id: string;
  /** Coordinates relative to the image, 0..1 */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcclusionData {
  /** Image as a (resized) data URL */
  image: string;
  width: number;
  height: number;
  mode: "hideAll" | "hideOne";
  masks: OcclusionMask[];
}

export interface Note {
  id: string;
  deckId: string;
  type: NoteType;
  /** HTML */
  front: string;
  /** HTML */
  back: string;
  occlusion?: OcclusionData;
  /** Per-note reverse card (bulk "Reverse" action) */
  reversed?: boolean;
  /** Ask the answer by typing it */
  typeIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CardState = "new" | "learning" | "review" | "relearning";

export interface Card {
  id: string;
  noteId: string;
  deckId: string;
  /** forward | reverse | c1..cn (cloze) | m:<maskId> (occlusion) */
  variant: string;
  state: CardState;
  /** Epoch ms */
  due: number;
  /** Days */
  interval: number;
  ease: number;
  /** Index into learning/relearning steps */
  step: number;
  reps: number;
  lapses: number;
  stability?: number;
  difficulty?: number;
  lastReview?: number;
  /** Answered "Again"/"Not quite" last time */
  struggling?: boolean;
  frozen: boolean;
  createdAt: number;
}

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface Review {
  id: string;
  cardId: string;
  noteId: string;
  deckId: string;
  rating: Rating;
  at: number;
  durationMs: number;
  prevInterval: number;
  interval: number;
  prevState: CardState;
  state: CardState;
  /** Day key YYYY-MM-DD in local time */
  day: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export type DisplayStatus = "notStudied" | "notQuite" | "learning" | "gotIt" | "mastered" | "frozen";
