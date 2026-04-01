'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TutorialOverlay } from './tutorial-overlay';
import { TUTORIAL_STEPS } from './tutorial-steps';

const STORAGE_KEY = 'pm-tutorial-completed';

interface TutorialContextValue {
  /** Whether the tutorial has been completed or skipped */
  completed: boolean;
  /** Whether the tutorial is currently active/showing */
  active: boolean;
  /** Start the tutorial */
  start: () => void;
  /** Replay the tutorial from scratch */
  replay: () => void;
}

const TutorialContext = createContext<TutorialContextValue>({
  completed: false,
  active: false,
  start: () => {},
  replay: () => {},
});

export function useTutorial() {
  return useContext(TutorialContext);
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState(true); // default true to avoid flash
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load completion state from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setCompleted(true);
    } else {
      setCompleted(false);
    }
  }, []);

  // Auto-start tutorial for first-time users (after a short delay to let UI render)
  useEffect(() => {
    if (mounted && !completed) {
      const timer = setTimeout(() => {
        setActive(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [mounted, completed]);

  const markCompleted = useCallback(() => {
    setCompleted(true);
    setActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const start = useCallback(() => {
    setActive(true);
  }, []);

  const replay = useCallback(() => {
    setCompleted(false);
    setActive(true);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <TutorialContext.Provider value={{ completed, active, start, replay }}>
      {children}
      {active && (
        <TutorialOverlay
          steps={TUTORIAL_STEPS}
          onComplete={markCompleted}
          onSkip={markCompleted}
        />
      )}
    </TutorialContext.Provider>
  );
}
