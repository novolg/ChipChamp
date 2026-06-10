import type { LearningStep } from '../types';

/** The ordered beginner curriculum. Each step unlocks when its prereqs are done. */
export const LEARNING_PATH: LearningStep[] = [
  { id: 'step-rules', type: 'lesson', refId: 'rules-basics', title: 'Learn: How a Hand Works', prereqIds: [] },
  { id: 'step-rankings', type: 'lesson', refId: 'hand-rankings', title: 'Learn: Hand Rankings', prereqIds: ['step-rules'] },
  { id: 'step-quiz-rankings', type: 'quiz', refId: 'quiz-rankings', title: 'Quiz: Hand Rankings', prereqIds: ['step-rankings'] },
  { id: 'step-fold', type: 'practice', refId: 'practice-fold-trash', title: 'Practice: Fold a Weak Hand', prereqIds: ['step-quiz-rankings'] },
  { id: 'step-positions', type: 'lesson', refId: 'positions', title: 'Learn: Position & Blinds', prereqIds: ['step-fold'] },
  { id: 'step-raise', type: 'practice', refId: 'practice-raise-premium', title: 'Practice: Raise a Premium Hand', prereqIds: ['step-positions'] },
  { id: 'step-odds', type: 'lesson', refId: 'pot-odds', title: 'Learn: Pot Odds', prereqIds: ['step-raise'] },
  { id: 'step-quiz-odds', type: 'quiz', refId: 'quiz-odds', title: 'Quiz: Pot Odds', prereqIds: ['step-odds'] },
  { id: 'step-freeplay', type: 'freePlay', refId: '', title: 'Play: 5 Hands vs Bots', prereqIds: ['step-quiz-odds'], requiredHands: 5 },
];
