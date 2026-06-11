import { useNavStore } from './store/navStore';
import { SuitField } from './components/SuitField';
import { FreePlayScreen } from './screens/FreePlayScreen';
import { LearningPathHome } from './screens/LearningPathHome';
import { LessonScreen } from './screens/LessonScreen';
import { QuizScreen } from './screens/QuizScreen';
import { PracticeHandScreen } from './screens/PracticeHandScreen';
import './components/table/table.css';
import './screens/screens.css';

export function App() {
  const view = useNavStore((s) => s.view);

  return (
    <>
      <SuitField />
      <main className="app-stage">
        {view.name === 'home' && <LearningPathHome />}
        {view.name === 'free' && <FreePlayScreen />}
        {view.name === 'lesson' && <LessonScreen lessonId={view.id} />}
        {view.name === 'quiz' && <QuizScreen quizId={view.id} />}
        {view.name === 'practice' && <PracticeHandScreen handId={view.id} />}
      </main>
    </>
  );
}
