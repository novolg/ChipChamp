import { useEffect, useRef, useState } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { LESSONS_BY_ID } from '../../tutorial/content/lessons';
import { Markdown } from '../components/Markdown';
import { HandRankTable } from '../components/HandRankTable';
import { PlayingCard } from '../components/table/Card';
import { StreetTimeline } from '../components/lesson/StreetTimeline';
import { PositionDiagram } from '../components/lesson/PositionDiagram';
import { PotOddsWidget } from '../components/lesson/PotOddsWidget';
import { TapQuiz } from '../components/lesson/TapQuiz';
import { Confetti } from '../components/Confetti';
import type { Lesson } from '../../tutorial/types';

/** Category → hero banner theming (suit glyph + accent). */
const CATEGORY_THEME: Record<Lesson['category'], { glyph: string; cls: string; label: string }> = {
  rules: { glyph: '♠', cls: 'lesson-hero-blue', label: 'THE BASICS' },
  rankings: { glyph: '♥', cls: 'lesson-hero-red', label: 'HAND STRENGTH' },
  betting: { glyph: '♣', cls: 'lesson-hero-green', label: 'BETTING' },
  positions: { glyph: '♦', cls: 'lesson-hero-orange', label: 'TABLE POSITION' },
  odds: { glyph: '♣', cls: 'lesson-hero-green', label: 'THE MATH' },
};

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const lesson = LESSONS_BY_ID[lessonId];

  const [celebrating, setCelebrating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!lesson) {
    return (
      <AppFrame variant="learn" active="learn">
        <div className="screen">Lesson not found.</div>
      </AppFrame>
    );
  }

  const theme = CATEGORY_THEME[lesson.category];

  const complete = () => {
    if (celebrating) return;
    record({ type: 'lessonCompleted', lessonId });
    setCelebrating(true);
    timerRef.current = setTimeout(() => go({ name: 'home' }), 1500);
  };

  return (
    <AppFrame variant="learn" active="learn">
    <div className="screen lesson">
      <button className="link-back" onClick={() => go({ name: 'home' })}>← Path</button>

      <header className={`lesson-hero ${theme.cls}`}>
        <span className="lesson-hero-glyph" aria-hidden="true">{theme.glyph}</span>
        <span className="lesson-hero-kicker">{theme.label}</span>
        <h2 className="lesson-hero-title">{lesson.title}</h2>
        <span className="lesson-hero-meta">{lesson.estMinutes} MIN READ · INTERACTIVE</span>
      </header>

      <div className="lesson-content">
        {lesson.blocks.map((block, i) => {
          switch (block.kind) {
            case 'text':
              return <Markdown key={i} source={block.markdown} />;
            case 'handRankTable':
              return <HandRankTable key={i} />;
            case 'cardExample':
              return (
                <figure key={i} className="card-example">
                  <div className="card-example-cards">
                    {block.cards.map((c, j) => <PlayingCard key={j} card={c} size="sm" />)}
                  </div>
                  <figcaption>{block.caption}</figcaption>
                </figure>
              );
            case 'callout':
              return (
                <div key={i} className={`callout callout-${block.tone}`}>
                  <span className="callout-badge" aria-hidden="true">
                    {block.tone === 'tip' ? 'i' : '!'}
                  </span>
                  <span>{block.text}</span>
                </div>
              );
            case 'streetTimeline':
              return <StreetTimeline key={i} />;
            case 'positionDiagram':
              return <PositionDiagram key={i} />;
            case 'potOddsWidget':
              return <PotOddsWidget key={i} />;
            case 'tapQuiz':
              return (
                <TapQuiz
                  key={i}
                  prompt={block.prompt}
                  options={block.options}
                  correctIndex={block.correctIndex}
                  explanation={block.explanation}
                />
              );
            default:
              return null;
          }
        })}
      </div>

      <button className="btn btn-blue" onClick={complete} disabled={celebrating}>
        Mark complete &amp; continue
      </button>

      {celebrating && (
        <div className="celebrate-overlay">
          <Confetti />
          <div className="celebrate-card">
            <img src="/assets/chip-orange.png" alt="" className="celebrate-chip" />
            <span className="celebrate-title">CHIP EARNED</span>
            <span className="celebrate-sub">{lesson.title} complete</span>
          </div>
        </div>
      )}
    </div>
    </AppFrame>
  );
}
