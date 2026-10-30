import { useEffect, useRef, useState } from 'react';
import { AppFrame } from '../components/AppFrame';
import { BestFiveChallenge } from '../components/lesson/BestFiveChallenge';
import { useNavStore } from '../store/navStore';
import { useDailyStore } from '../store/dailyStore';
import { useLocalDay } from '../hooks/useLocalDay';
import { dailyExercise, dailyStats } from '../../tutorial/dailyChallenge';
import './daily.css';

export function DailyChallengeScreen() {
  const day = useLocalDay();
  return <AppFrame variant="learn" active="learn"><DailyPuzzle key={day} day={day} /></AppFrame>;
}

function DailyPuzzle({ day }: { day: string }) {
  const go = useNavStore((s) => s.go);
  const { days, saved, complete } = useDailyStore();
  const stats = dailyStats(days, day);
  const [playing, setPlaying] = useState(!stats.completed);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [playing]);
  return <div className="daily-page">
    <button className="link-back" onClick={() => go({ name: 'home' })}>← Back to the club</button>
    <header><span className="lobby-eyebrow">DAILY TABLE · {day}</span><h1 ref={heading} tabIndex={-1}>{playing ? 'Seven cards. Your best five.' : 'Today’s hand, mastered.'}</h1><p>One short puzzle. Take your time, use a hint, and try again.</p></header>
    <div className="daily-stats" aria-label="Daily challenge progress"><span><strong>{stats.streak}</strong> day streak</span><span><strong>{stats.best}</strong> personal best</span><span><strong>{stats.total}</strong> days solved</span></div>
    {playing ? <BestFiveChallenge exercises={[dailyExercise(day)]} onComplete={() => { complete(day); setPlaying(false); }} /> : <section className="daily-finish" aria-label="Daily challenge complete"><span aria-hidden="true">✓</span><h2>A little practice adds up.</h2><p>Come back tomorrow for the next hand. Today’s result counts once, however many times you practise.</p><div><button className="btn btn-orange" onClick={() => go({ name: 'home' })}>BACK TO THE CLUB →</button><button className="btn btn-dark" onClick={() => setPlaying(true)}>PRACTISE AGAIN</button></div></section>}
    <p className="daily-note">{saved ? 'Results are saved in this browser. The puzzle changes at local midnight; the small puzzle collection rotates.' : 'Your result is kept for this session. Browser storage is unavailable, so it may be lost when you close this page.'}</p>
  </div>;
}
