import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Phase, ModeType, AssembledPrompt, Iteration, EvaluationResult, Session, UserRating } from '@/types';
import { DEFAULT_MODEL } from '@/lib/constants';

interface SessionState {
  // Phase
  phase: Phase;

  // Inputs
  objective: string;
  audience: string;
  constraints: string;
  outputFormat: string;
  mode: ModeType;
  customName: string;
  customPreamble: string;
  customTone: string;

  // Assembled prompt
  assembled: AssembledPrompt | null;
  promptEdited: string;
  systemPrompt: string;

  // Iteration state
  iterations: Iteration[];
  currentOutput: string | null;
  currentEval: EvaluationResult | null;
  suggestions: string[];
  realignmentPrompt: string | null;

  // Session metadata
  model: string;
  finalized: boolean;
  selfAudit: string | null;
  sessionSaved: boolean;
  error: string | null;
  loading: boolean;

  // UI state
  constraintPresets: string[];
  formatPresets: string[];
  onboardingSeen: boolean;
  showScaffolding: boolean;

  // Session Facts / Information Anchors (Ch5 S5)
  sessionFacts: string[];

  // Active Prompt Stack (Ch5 S6) — id from PROMPT_STACKS
  activeStackId: string | null;

  // User's custom presets (loaded from Supabase or localStorage)
  customConstraintPresets: string[];
  customFormatPresets: string[];

  // Actions
  setPhase: (phase: Phase) => void;
  setObjective: (objective: string) => void;
  setAudience: (audience: string) => void;
  setConstraints: (constraints: string) => void;
  setOutputFormat: (outputFormat: string) => void;
  setMode: (mode: ModeType) => void;
  setCustomMode: (name: string, preamble: string, tone: string) => void;
  setAssembled: (assembled: AssembledPrompt) => void;
  setPromptEdited: (prompt: string) => void;
  setSystemPrompt: (prompt: string) => void;
  appendIteration: (iteration: Iteration, suggestions: string[]) => void;
  setIterationRating: (iterationNumber: number, rating: UserRating | null) => void;
  setRealignmentPrompt: (prompt: string | null) => void;
  setModel: (model: string) => void;
  setSelfAudit: (audit: string) => void;
  setSessionSaved: (saved: boolean) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setConstraintPresets: (presets: string[]) => void;
  setFormatPresets: (presets: string[]) => void;
  setOnboardingSeen: (seen: boolean) => void;
  setShowScaffolding: (show: boolean) => void;
  addSessionFact: (fact: string) => void;
  removeSessionFact: (index: number) => void;
  clearSessionFacts: () => void;
  setActiveStack: (id: string | null) => void;
  setCustomConstraintPresets: (presets: string[]) => void;
  setCustomFormatPresets: (presets: string[]) => void;
  addCustomConstraintPreset: (label: string) => void;
  removeCustomConstraintPreset: (label: string) => void;
  addCustomFormatPreset: (label: string) => void;
  removeCustomFormatPreset: (label: string) => void;
  finalize: () => void;
  resetSession: () => void;
  carryLessonsForward: (objective: string, constraints: string) => void;
  loadSession: (session: Session) => void;
}

const initialState = {
  phase: 'input' as Phase,
  objective: '',
  audience: 'General',
  constraints: '',
  outputFormat: '',
  mode: 'architect' as ModeType,
  customName: '',
  customPreamble: '',
  customTone: '',
  assembled: null as AssembledPrompt | null,
  promptEdited: '',
  systemPrompt: '',
  iterations: [] as Iteration[],
  currentOutput: null as string | null,
  currentEval: null as EvaluationResult | null,
  suggestions: [] as string[],
  realignmentPrompt: null as string | null,
  model: DEFAULT_MODEL,
  finalized: false,
  selfAudit: null as string | null,
  sessionSaved: false,
  error: null as string | null,
  loading: false,
  constraintPresets: [] as string[],
  formatPresets: [] as string[],
  onboardingSeen: false,
  showScaffolding: false,
  sessionFacts: [] as string[],
  activeStackId: null as string | null,
  customConstraintPresets: [] as string[],
  customFormatPresets: [] as string[],
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...initialState,

      setPhase: (phase) => set({ phase }),
      setObjective: (objective) => set({ objective }),
      setAudience: (audience) => set({ audience }),
      setConstraints: (constraints) => set({ constraints }),
      setOutputFormat: (outputFormat) => set({ outputFormat }),
      setMode: (mode) => set({ mode }),
      setCustomMode: (customName, customPreamble, customTone) =>
        set({ customName, customPreamble, customTone }),
      setAssembled: (assembled) =>
        set({ assembled, promptEdited: assembled.user_prompt, systemPrompt: assembled.system_prompt }),
      setPromptEdited: (promptEdited) => set({ promptEdited }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      appendIteration: (iteration, suggestions) =>
        set((state) => ({
          iterations: [...state.iterations, iteration],
          currentOutput: iteration.output,
          currentEval: iteration.evaluation,
          suggestions,
        })),
      setIterationRating: (iterationNumber, rating) =>
        set((state) => ({
          iterations: state.iterations.map((it) =>
            it.iteration_number === iterationNumber ? { ...it, user_rating: rating } : it
          ),
        })),
      setRealignmentPrompt: (realignmentPrompt) => set({ realignmentPrompt }),
      setModel: (model) => set({ model }),
      setSelfAudit: (selfAudit) => set({ selfAudit }),
      setSessionSaved: (sessionSaved) => set({ sessionSaved }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      setConstraintPresets: (constraintPresets) => set({ constraintPresets }),
      setFormatPresets: (formatPresets) => set({ formatPresets }),
      setOnboardingSeen: (onboardingSeen) => set({ onboardingSeen }),
      setShowScaffolding: (showScaffolding) => set({ showScaffolding }),
      addSessionFact: (fact) =>
        set((state) => ({ sessionFacts: [...state.sessionFacts, fact] })),
      removeSessionFact: (index) =>
        set((state) => ({
          sessionFacts: state.sessionFacts.filter((_, i) => i !== index),
        })),
      clearSessionFacts: () => set({ sessionFacts: [] }),
      setActiveStack: (activeStackId) => set({ activeStackId }),
      setCustomConstraintPresets: (customConstraintPresets) => set({ customConstraintPresets }),
      setCustomFormatPresets: (customFormatPresets) => set({ customFormatPresets }),
      addCustomConstraintPreset: (label) =>
        set((state) => ({
          customConstraintPresets: state.customConstraintPresets.includes(label)
            ? state.customConstraintPresets
            : [...state.customConstraintPresets, label],
        })),
      removeCustomConstraintPreset: (label) =>
        set((state) => ({
          customConstraintPresets: state.customConstraintPresets.filter((p) => p !== label),
          constraintPresets: state.constraintPresets.filter((p) => p !== label),
        })),
      addCustomFormatPreset: (label) =>
        set((state) => ({
          customFormatPresets: state.customFormatPresets.includes(label)
            ? state.customFormatPresets
            : [...state.customFormatPresets, label],
        })),
      removeCustomFormatPreset: (label) =>
        set((state) => ({
          customFormatPresets: state.customFormatPresets.filter((p) => p !== label),
          formatPresets: state.formatPresets.filter((p) => p !== label),
        })),
      finalize: () => set({ finalized: true, phase: 'summary' }),
      resetSession: () => set({ ...initialState }),
      carryLessonsForward: (objective, constraints) =>
        set({ ...initialState, objective, constraints }),
      loadSession: (session) =>
        set({
          objective: session.objective,
          audience: session.audience,
          constraints: session.constraints,
          outputFormat: session.output_format,
          mode: session.mode,
          model: session.model || DEFAULT_MODEL,
          iterations: session.iterations,
          finalized: session.finalized,
          currentOutput: session.iterations.length > 0 ? session.iterations[session.iterations.length - 1].output : null,
          currentEval: session.iterations.length > 0 ? session.iterations[session.iterations.length - 1].evaluation : null,
          phase: session.finalized ? 'summary' : 'output',
          sessionSaved: true,
        }),
    }),
    {
      name: 'pm-session',
      // Use sessionStorage: persists across refreshes but clears on tab/browser close
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          const value = sessionStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          sessionStorage.removeItem(name);
        },
      },
      // Don't persist transient UI state
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { error, loading, ...persisted } = state;
        return persisted as unknown as SessionState;
      },
    }
  )
);
