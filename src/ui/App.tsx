import { useNavStore } from './store/navStore';
import { FreePlayScreen } from './screens/FreePlayScreen';
import { LearningPathHome } from './screens/LearningPathHome';
import { LessonScreen } from './screens/LessonScreen';
import { QuizScreen } from './screens/QuizScreen';
import { PracticeHandScreen } from './screens/PracticeHandScreen';
import './components/table/table.css';
import './screens/screens.css';

export function App() {
  const view = useNavStore((s) => s.view);
  const go = useNavStore((s) => s.go);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Poker Tutor</h1>
        <span className="subtitle">Learn Texas Hold'em</span>
        <nav className="app-nav">
          <button className={view.name === 'home' ? 'nav-active' : ''} onClick={() => go({ name: 'home' })}>
            Learn
          </button>
          <button className={view.name === 'free' ? 'nav-active' : ''} onClick={() => go({ name: 'free' })}>
            Free Play
          </button>
        </nav>
      </header>

      {view.name === 'home' && <LearningPathHome />}
      {view.name === 'free' && <FreePlayScreen />}
      {view.name === 'lesson' && <LessonScreen lessonId={view.id} />}
      {view.name === 'quiz' && <QuizScreen quizId={view.id} />}
      {view.name === 'practice' && <PracticeHandScreen handId={view.id} />}
    </div>
  );
}
