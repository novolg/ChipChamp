import { useRef, useState } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { Confetti } from '../components/Confetti';
import { useCountUp } from '../hooks/useCountUp';

/** One-question-at-a-time quiz with instant feedback, progress dots and a
 *  star-rated result. Score is recorded once, when the last question is done. */
export function QuizScreen({ quizId }: { quizId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const quiz = QUIZZES_BY_ID[quizId];

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);
  const recorded = useRef(false);

  if (!quiz) {
    return (
      <AppFrame variant="learn" active="learn">
        <div className="screen">Quiz not found.</div>
      </AppFrame>
    );
  }

  const total = quiz.questions.length;
  const q = quiz.questions[index];
  const correctCount = results.filter(Boolean).length;
  const score = correctCount / total;
  const passed = score >= quiz.passThreshold;
  const isLast = index === total - 1;

  const pick = (optId: string) => {
    if (picked) return;
    setPicked(optId);
    setResults((r) => [...r, optId === q.correctOptionId]);
  };

  const next = () => {
    if (!isLast) {
      setIndex((i) => i + 1);
      setPicked(null);
      return;
    }
    if (!recorded.current) {
      recorded.current = true;
      record({ type: 'quizAttempted', quizId, score });
    }
    setFinished(true);
  };

  const retry = () => {
    setIndex(0);
    setPicked(null);
    setResults([]);
    setFinished(false);
    recorded.current = false;
  };

  const stars = score === 1 ? 3 : passed ? 2 : 1;

  return (
    <AppFrame variant="learn" active="learn">
    <div className="screen quiz">
      <button className="link-back" onClick={() => go({ name: 'home' })}>← Path</button>
      <h2>{quiz.title}</h2>

      {!finished ? (
        <>
          <div className="quiz-progress">
            <span className="quiz-progress-count">QUESTION {index + 1} / {total}</span>
            <div className="quiz-dots" aria-hidden="true">
              {quiz.questions.map((_, i) => {
                let cls = 'quiz-dot';
                if (i < results.length) cls += results[i] ? ' quiz-dot-right' : ' quiz-dot-wrong';
                else if (i === index) cls += ' quiz-dot-current';
                return <span key={i} className={cls} />;
              })}
            </div>
            <div className="quiz-track">
              <span className="quiz-track-fill" style={{ width: `${(results.length / total) * 100}%` }} />
            </div>
          </div>

          <div className="quiz-q quiz-q-card" key={q.id}>
            <p className="quiz-prompt">{q.prompt}</p>
            <div className="quiz-options">
              {q.options.map((opt, oi) => {
                const isChosen = picked === opt.id;
                const isCorrect = opt.id === q.correctOptionId;
                let cls = 'quiz-option';
                if (picked) {
                  if (isCorrect) cls += ' quiz-option-correct';
                  else if (isChosen) cls += ' quiz-option-wrong';
                }
                return (
                  <button key={opt.id} className={cls} disabled={!!picked} onClick={() => pick(opt.id)}>
                    <span className="quiz-option-key" aria-hidden="true">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {picked && (
              <div className={`quiz-feedback ${picked === q.correctOptionId ? 'quiz-feedback-right' : 'quiz-feedback-wrong'}`}>
                <span className="quiz-feedback-head">
                  {picked === q.correctOptionId ? '✓ Correct' : '✗ Not quite'}
                </span>
                <p className="quiz-explain">{q.explanation}</p>
                <button className="btn btn-blue quiz-next" onClick={next}>
                  {isLast ? 'SEE RESULT' : 'NEXT QUESTION'}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <QuizResult
          passed={passed}
          stars={stars}
          score={score}
          correctCount={correctCount}
          total={total}
          passThreshold={quiz.passThreshold}
          onContinue={() => go({ name: 'home' })}
          onRetry={retry}
        />
      )}
    </div>
    </AppFrame>
  );
}

interface QuizResultProps {
  passed: boolean;
  stars: number;
  score: number;
  correctCount: number;
  total: number;
  passThreshold: number;
  onContinue: () => void;
  onRetry: () => void;
}

function QuizResult({ passed, stars, score, correctCount, total, passThreshold, onContinue, onRetry }: QuizResultProps) {
  const shownPct = useCountUp(Math.round(score * 100), 700);
  return (
    <div className={`quiz-result quiz-result-big ${passed ? 'quiz-pass' : 'quiz-fail'}`}>
      {passed && <Confetti />}
      <div className="quiz-stars" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`quiz-star${i < stars ? ' quiz-star-lit' : ''}`} style={{ animationDelay: `${0.15 + i * 0.18}s` }}>
            ★
          </span>
        ))}
      </div>
      <p className="quiz-result-head">{passed ? 'Passed' : 'Not yet'}</p>
      <p className="quiz-result-pct">{shownPct}%</p>
      <p className="quiz-result-detail">
        {correctCount} of {total} correct.{' '}
        {passed ? 'Nice work.' : `You need ${Math.round(passThreshold * 100)}% to pass.`}
      </p>
      <div className="quiz-actions">
        {passed ? (
          <button className="btn btn-blue" onClick={onContinue}>CONTINUE</button>
        ) : (
          <button className="btn btn-orange" onClick={onRetry}>TRY AGAIN</button>
        )}
      </div>
    </div>
  );
}
