import { useState } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { LESSONS_BY_ID } from '../../tutorial/content/lessons';
import { Markdown } from '../components/Markdown';
import { HandRankTable } from '../components/HandRankTable';
import { PlayingCard } from '../components/table/Card';
import { StreetTimeline } from '../components/lesson/StreetTimeline';
import { PositionDiagram } from '../components/lesson/PositionDiagram';
import { PositionChallenge } from '../components/lesson/PositionChallenge';
import { PotOddsLesson } from './PotOddsLesson';
import { PotOddsWidget } from '../components/lesson/PotOddsWidget';
import { TapQuiz } from '../components/lesson/TapQuiz';
import { BestFiveChallenge } from '../components/lesson/BestFiveChallenge';
import { LessonCompletion } from '../components/lesson/LessonCompletion';
import { playSfx } from '../lib/sound';
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
  return lessonId === 'pot-odds' ? <PotOddsLesson /> : <ReadingLesson lessonId={lessonId} />;
}

function ReadingLesson({ lessonId }: { lessonId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const lesson = LESSONS_BY_ID[lessonId];

  const [celebrating, setCelebrating] = useState(false);
  const previouslyCompleted = useProgressStore((s) => s.progress.completedLessonIds.includes(lessonId));
  const [exerciseComplete, setExerciseComplete] = useState(false);

  if (!lesson) {
    return (
      <AppFrame variant="learn" active="learn">
        <div className="screen">Lesson not found.</div>
      </AppFrame>
    );
  }

  const theme = CATEGORY_THEME[lesson.category];

  const canComplete = previouslyCompleted || !lesson.blocks.some((b) => b.kind === 'bestFiveChallenge' || b.kind === 'positionChallenge') || exerciseComplete;
  const complete = () => {
    if (celebrating || !canComplete) return;
    record({ type: 'lessonCompleted', lessonId });
    setCelebrating(true);
    playSfx('levelUp');
  };

  if (celebrating) return <AppFrame variant="learn" active="learn">
    <LessonCompletion lessonId={lessonId} title={lesson.title}
      takeaway={lessonId === 'hand-rankings' ? 'Choose the best five, compare kickers, and remember: sometimes the board does all the work.' : lessonId === 'positions' ? 'Find the button, skip folded seats and notice who acts after you. Acting later gives you more information.' : 'One more skill to bring to your next hand. Keep building your instincts with the next step.'}
      onReplay={() => setCelebrating(false)} />
  </AppFrame>;

  return (
    <AppFrame variant="learn" active="learn">
    <div className="screen lesson">
      <button className="link-back" onClick={() => go({ name: 'home' })}>← Path</button>

      <header className={`lesson-hero ${theme.cls}`}>
        <span className="lesson-hero-glyph" aria-hidden="true">{theme.glyph}</span>
        <span className="lesson-hero-kicker">{theme.label}</span>
        <h2 className="lesson-hero-title">{lesson.title}</h2>
        <span className="lesson-hero-meta">{lesson.estMinutes} MIN · INTERACTIVE</span>
      </header>

      <div className="lesson-content">
        {lesson.blocks.map((block, i) => {
          switch (block.kind) {
            case 'text':
              return <Markdown key={i} source={block.markdown} />;
            case 'bestFiveChallenge':
              return <BestFiveChallenge key={i} onComplete={() => setExerciseComplete(true)} />;
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
            case 'positionChallenge':
              return <PositionChallenge key={i} onComplete={() => setExerciseComplete(true)} />;
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

      <button className="btn btn-orange" onClick={complete} disabled={!canComplete}>
        Mark complete &amp; continue
      </button>

      {!canComplete && <p className="lesson-completion-note">Complete the interactive exercise above to finish this lesson.</p>}
    </div>
    </AppFrame>
  );
}
