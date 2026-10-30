import { useEffect, useState } from 'react';
import { localDay } from '../../tutorial/dailyChallenge';

export function useLocalDay() {
  const [day, setDay] = useState(localDay);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setDay(localDay());
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return day;
}
