import { useState } from 'react';
import type { Card } from '../../../engine/types';
import { PlayingCard } from '../table/Card';

interface TapQuizProps {
  prompt: string;
  options: { cards: Card[]; label: string }[];
  correctIndex: number;
  explanation: string;
}

/** Inline knowledge check: tap one of the card groups; instant feedback. */
export function TapQuiz({ prompt, options, correctIndex, explanation }: TapQuizProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === correctIndex;

  return (
    <div className="tapquiz">
      <p className="tapquiz-prompt">{prompt}</p>
      <div className="tapquiz-options">
        {options.map((opt, i) => {
          let cls = 'tapquiz-option';
          if (answered) {
            if (i === correctIndex) cls += ' tapquiz-option-correct';
            else if (i === picked) cls += ' tapquiz-option-wrong';
            else cls += ' tapquiz-option-dim';
          }
          return (
            <button key={i} className={cls} disabled={answered} onClick={() => setPicked(i)}>
              <span className="tapquiz-cards">
                {opt.cards.map((card, j) => (
                  <PlayingCard key={j} card={card} size="sm" />
                ))}
              </span>
              <span className="tapquiz-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`tapquiz-result ${correct ? 'tapquiz-result-right' : 'tapquiz-result-wrong'}`}>
          <span className="tapquiz-result-head">{correct ? '✓ Correct' : '✗ Not quite'}</span>
          <span>{explanation}</span>
          {!correct && (
            <button className="tapquiz-retry" onClick={() => setPicked(null)}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
