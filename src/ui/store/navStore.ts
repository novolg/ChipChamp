import { create } from 'zustand';

export type View =
  | { name: 'home' }
  | { name: 'free' }
  | { name: 'lesson'; id: string }
  | { name: 'quiz'; id: string }
  | { name: 'practice'; id: string };

interface NavStore {
  view: View;
  go: (view: View) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  view: { name: 'home' },
  go: (view) => set({ view }),
}));
