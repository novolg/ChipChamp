import { lazy, Suspense, useEffect, useLayoutEffect, type CSSProperties } from 'react';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useTableOwnership } from './hooks/useTableOwnership';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useNavStore } from './store/navStore';
import { useFitScale } from './hooks/useFitScale';
import { SuitField } from './components/SuitField';
import { ScreenBoundary } from './components/ScreenBoundary';
const FreePlayScreen = lazy(() => import('./screens/FreePlayScreen').then((m) => ({ default: m.FreePlayScreen })));
import { LearningPathHome } from './screens/LearningPathHome';
const LessonScreen = lazy(() => import('./screens/LessonScreen').then((m) => ({ default: m.LessonScreen })));
const DailyChallengeScreen = lazy(() => import('./screens/DailyChallengeScreen').then((m) => ({ default: m.DailyChallengeScreen })));
const QuizScreen = lazy(() => import('./screens/QuizScreen').then((m) => ({ default: m.QuizScreen })));
const PracticeHandScreen = lazy(() => import('./screens/PracticeHandScreen').then((m) => ({ default: m.PracticeHandScreen })));
import { screenVariants } from './lib/motion';
import { playSfx } from './lib/sound';
import './components/table/table.css';
import './components/lesson/lesson.css';
import './screens/screens.css';
import './theme/indigo.css';

/* Chrome controls with no contextual sound of their own get a soft click,
 * wired once via event delegation. Action buttons, tiles, lesson-complete,
 * quiz answers etc. produce their own richer cues and are deliberately absent. */
const CLICK_SELECTOR = '.nav-seg, .link-back, .bet-preset, .bet-step, .quiz-next, .btn-pulse';

export function App() {
  useTableOwnership();
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reduced);
    return () => { delete document.documentElement.dataset.reducedMotion; };
  }, [reduced]);
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
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
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
            <ScreenBoundary>
            <Suspense fallback={<div className="play-loading" role="status">Opening…</div>}>
            {view.name === 'home' && <LearningPathHome />}
            {view.name === 'daily' && <DailyChallengeScreen />}
            {view.name === 'free' && <FreePlayScreen />}
            {view.name === 'lesson' && <LessonScreen lessonId={view.id} />}
            {view.name === 'quiz' && <QuizScreen quizId={view.id} />}
            {view.name === 'practice' && <PracticeHandScreen handId={view.id} />}
            </Suspense>
            </ScreenBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
