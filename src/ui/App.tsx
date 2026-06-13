import { useEffect, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useNavStore } from './store/navStore';
import { useFitScale } from './hooks/useFitScale';
import { SuitField } from './components/SuitField';
import { FreePlayScreen } from './screens/FreePlayScreen';
import { LearningPathHome } from './screens/LearningPathHome';
import { LessonScreen } from './screens/LessonScreen';
import { QuizScreen } from './screens/QuizScreen';
import { PracticeHandScreen } from './screens/PracticeHandScreen';
import { screenVariants } from './lib/motion';
import { playSfx } from './lib/sound';
import './components/table/table.css';
import './components/lesson/lesson.css';
import './screens/screens.css';

/* Chrome controls with no contextual sound of their own get a soft click,
 * wired once via event delegation. Action buttons, tiles, lesson-complete,
 * quiz answers etc. produce their own richer cues and are deliberately absent. */
const CLICK_SELECTOR = '.nav-seg, .link-back, .bet-preset, .bet-step, .quiz-next';

export function App() {
  const view = useNavStore((s) => s.view);
  const scale = useFitScale();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(CLICK_SELECTOR);
      if (el && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true') {
        playSfx('click');
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Identity of the current screen — drives the AnimatePresence transition.
  const viewKey = 'id' in view ? `${view.name}:${view.id}` : view.name;

  return (
    <MotionConfig reducedMotion="user">
      <SuitField />
      <main className="app-stage" style={{ '--fit-scale': scale } as CSSProperties}>
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            className="screen-motion"
            variants={screenVariants}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            {view.name === 'home' && <LearningPathHome />}
            {view.name === 'free' && <FreePlayScreen />}
            {view.name === 'lesson' && <LessonScreen lessonId={view.id} />}
            {view.name === 'quiz' && <QuizScreen quizId={view.id} />}
            {view.name === 'practice' && <PracticeHandScreen handId={view.id} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
