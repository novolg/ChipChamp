import { useState } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';

export function QuizScreen({ quizId }: { quizId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const quiz = QUIZZES_BY_ID[quizId];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!quiz) return <div className="screen">Quiz not found.</div>;

  const correctCount = quiz.questions.filter((q) => answers[q.id] === q.correctOptionId).length;
  const score = correctCount / quiz.questions.length;
  const passed = score >= quiz.passThreshold;
  const allAnswered = quiz.questions.every((q) => answers[q.id]);

  const submit = () => {
    record({ type: 'quizAttempted', quizId, score });
    setSubmitted(true);
  };

  return (
    <div className="screen quiz">
      <button className="link-back" onClick={() => go({ name: 'home' })}>← Path</button>
      <h2>{quiz.title}</h2>

      {quiz.questions.map((q, qi) => {
        const chosen = answers[q.id];
        return (
          <div key={q.id} className="quiz-q">
            <p className="quiz-prompt">{qi + 1}. {q.prompt}</p>
            <div className="quiz-options">
              {q.options.map((opt) => {
                const isChosen = chosen === opt.id;
                const isCorrect = opt.id === q.correctOptionId;
                let cls = 'quiz-option';
                if (submitted) {
                  if (isCorrect) cls += ' quiz-option-correct';
                  else if (isChosen) cls += ' quiz-option-wrong';
                } else if (isChosen) cls += ' quiz-option-chosen';
                return (
                  <button
                    key={opt.id}
                    className={cls}
                    disabled={submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {submitted && <p className="quiz-explain">{q.explanation}</p>}
          </div>
        );
      })}

      {!submitted ? (
        <button className="btn btn-primary" disabled={!allAnswered} onClick={submit}>
          Submit answers
        </button>
      ) : (
        <div className={`quiz-result ${passed ? 'quiz-pass' : 'quiz-fail'}`}>
          <p>
            You scored {correctCount}/{quiz.questions.length} ({Math.round(score * 100)}%).{' '}
            {passed ? 'Passed! 🎉' : `You need ${Math.round(quiz.passThreshold * 100)}% to pass.`}
          </p>
          <div className="quiz-actions">
            {passed ? (
              <button className="btn btn-primary" onClick={() => go({ name: 'home' })}>Continue</button>
            ) : (
              <button className="btn" onClick={() => { setSubmitted(false); setAnswers({}); }}>Try again</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
