import type { CSSProperties } from 'react';
import { useNavStore } from './store/navStore';
import { useFitScale } from './hooks/useFitScale';
import { SuitField } from './components/SuitField';
import { FreePlayScreen } from './screens/FreePlayScreen';
import { LearningPathHome } from './screens/LearningPathHome';
import { LessonScreen } from './screens/LessonScreen';
import { QuizScreen } from './screens/QuizScreen';
import { PracticeHandScreen } from './screens/PracticeHandScreen';
import './components/table/table.css';
import './components/lesson/lesson.css';
import './screens/screens.css';

export function App() {
  const view = useNavStore((s) => s.view);
  const scale = useFitScale();

  return (
    <>
      <SuitField />
      <main className="app-stage" style={{ '--fit-scale': scale } as CSSProperties}>
        {view.name === 'home' && <LearningPathHome />}
        {view.name === 'free' && <FreePlayScreen />}
        {view.name === 'lesson' && <LessonScreen lessonId={view.id} />}
        {view.name === 'quiz' && <QuizScreen quizId={view.id} />}
        {view.name === 'practice' && <PracticeHandScreen handId={view.id} />}
      </main>
    </>
  );
}
