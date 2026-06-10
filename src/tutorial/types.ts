import type { ActionType, Card, Street } from '../engine/types';

// ---- Lessons ----

export type LessonBlock =
  | { kind: 'text'; markdown: string }
  | { kind: 'handRankTable' }
  | { kind: 'cardExample'; cards: Card[]; caption: string }
  | { kind: 'callout'; tone: 'tip' | 'warning'; text: string };

export interface Lesson {
  id: string;
  title: string;
  category: 'rules' | 'rankings' | 'betting' | 'positions' | 'odds';
  estMinutes: number;
  blocks: LessonBlock[];
}

// ---- Quizzes ----

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface Quiz {
  id: string;
  title: string;
  passThreshold: number; // 0..1
  questions: QuizQuestion[];
}

// ---- Scripted practice hands ----

export interface ScriptedSeat {
  id: number;
  name: string;
  isHuman: boolean;
  stack: number;
}

export interface Checkpoint {
  /** Coaching shown before the hero's action on this street. */
  atStreet: Street;
  coachText: string;
  recommended: ActionType;
  acceptable?: ActionType[];
  explainRight: string;
  explainWrong: string;
}

export interface ScriptedHand {
  id: string;
  title: string;
  description: string;
  setup: {
    seats: ScriptedSeat[];
    buttonSeatId: number;
    smallBlind: number;
    bigBlind: number;
    holeCards: Record<number, Card[]>;
    board: Card[];
    /** Optional FIFO queue of bot actions, replayed for bot turns before the
     *  hero's checkpoint (falls back to the live bot policy when exhausted). */
    scriptedBotActions?: { type: ActionType; amount?: number }[];
  };
  checkpoints: Checkpoint[];
}

// ---- Learning path ----

export type StepType = 'lesson' | 'quiz' | 'practice' | 'freePlay';

export interface LearningStep {
  id: string;
  type: StepType;
  refId: string; // lesson/quiz/scriptedHand id; '' for freePlay
  title: string;
  prereqIds: string[];
  /** freePlay only: hands to play before the step counts as complete. */
  requiredHands?: number;
}

// ---- Progress ----

export interface Progress {
  version: 1;
  completedLessonIds: string[];
  quizScores: Record<string, { best: number; attempts: number }>;
  completedScriptedHandIds: string[];
  freePlayStats: { handsPlayed: number; netChips: number };
  lastUpdated: string;
}

export type ProgressEvent =
  | { type: 'lessonCompleted'; lessonId: string }
  | { type: 'quizAttempted'; quizId: string; score: number }
  | { type: 'scriptedHandCompleted'; handId: string }
  | { type: 'freePlayHand'; netChips: number };
