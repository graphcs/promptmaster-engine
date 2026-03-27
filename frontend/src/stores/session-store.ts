import { create } from 'zustand';
import type { Phase, ModeType, AssembledPrompt, Iteration, EvaluationResult, Session } from '@/types';
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
  finalize: () => void;
  resetSession: () => void;
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
  assembled: null,
  promptEdited: '',
  systemPrompt: '',
  iterations: [],
  currentOutput: null,
  currentEval: null,
  suggestions: [],
  realignmentPrompt: null,
  model: DEFAULT_MODEL,
  finalized: false,
  selfAudit: null,
  sessionSaved: false,
  error: null,
  loading: false,
  constraintPresets: [],
  formatPresets: [],
  onboardingSeen: false,
  showScaffolding: false,
};

export const useSessionStore = create<SessionState>((set) => ({
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
  finalize: () => set({ finalized: true, phase: 'summary' }),
  resetSession: () => set({ ...initialState }),
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
}));
