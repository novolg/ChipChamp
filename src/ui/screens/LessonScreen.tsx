import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { LESSONS_BY_ID } from '../../tutorial/content/lessons';
import { Markdown } from '../components/Markdown';
import { HandRankTable } from '../components/HandRankTable';
import { PlayingCard } from '../components/table/Card';

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const lesson = LESSONS_BY_ID[lessonId];

  if (!lesson) return <div className="screen">Lesson not found.</div>;

  const complete = () => {
    record({ type: 'lessonCompleted', lessonId });
    go({ name: 'home' });
  };

  return (
    <div className="screen lesson">
      <button className="link-back" onClick={() => go({ name: 'home' })}>← Path</button>
      <h2>{lesson.title}</h2>

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
                  <span className="callout-icon">{block.tone === 'tip' ? '💡' : '⚠️'}</span>
                  <span>{block.text}</span>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>

      <button className="btn btn-primary" onClick={complete}>Mark complete & continue</button>
    </div>
  );
}
