import { useEffect, useRef } from 'react';
import { nextStepAfterLesson } from '../../../tutorial/progress/nextStep';
import { useProgressStore } from '../../store/progressStore';
import { useNavStore } from '../../store/navStore';
import { playSfx } from '../../lib/sound';
import './bestFive.css';

export function LessonCompletion({ lessonId, title, takeaway, onReplay }: {
  lessonId: string; title: string; takeaway: string; onReplay: () => void;
}) {
  const progress = useProgressStore((s) => s.progress);
  const go = useNavStore((s) => s.go);
  const next = nextStepAfterLesson(lessonId, progress);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const continueLearning = () => {
    playSfx('click');
    if (!next || next.type === 'freePlay') go({ name: 'free' });
    else go({ name: next.type, id: next.refId });
  };
  return <section className="lesson-finish" aria-labelledby="lesson-finish-title">
    <img src="/assets/chip-orange.png" alt="" />
    <span className="lesson-finish-kicker">LESSON COMPLETE</span>
    <h2 id="lesson-finish-title" ref={heading} tabIndex={-1}>{title}</h2>
    <p>{takeaway}</p>
    <div className="lesson-finish-next"><span>{next ? `${next.type === 'freePlay' ? 'TABLE PRACTICE' : next.type.toUpperCase()} UP NEXT` : 'READY TO PLAY'}</span><strong>{next ? next.title.replace(/^(Learn|Quiz|Practice|Play): /, '') : 'Put your skills to work at the table'}</strong></div>
    <div className="lesson-finish-actions"><button className="btn btn-orange" onClick={continueLearning}>{next ? 'CONTINUE LEARNING' : 'PLAY A HAND'} →</button><button className="btn btn-dark" onClick={() => go({ name: 'home' })}>BACK TO THE CLUB</button></div>
    <button className="best-five-hint-button" onClick={onReplay}>Review this lesson</button>
  </section>;
}
