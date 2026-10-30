import { create } from 'zustand';

export type View =
  | { name: 'home' }
  | { name: 'daily' }
  | { name: 'free' }
  | { name: 'lesson'; id: string }
  | { name: 'quiz'; id: string }
  | { name: 'practice'; id: string };

interface NavStore {
  view: View;
  hasNavigated: boolean;
  go: (view: View) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  hasNavigated: false,
  // `/#free` deep link opens the table directly (also used by screenshot tooling).
  view: location.hash === '#free' ? { name: 'free' } : { name: 'home' },
  go: (view) => set({ view, hasNavigated: true }),
}));
