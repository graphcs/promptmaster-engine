import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Phase, ModeType, AssembledPrompt, Iteration, EvaluationResult, Session, UserRating, ChatMessage, SetupSuggestion, AuditFinding, CustomMode, LongFormState, OutlineSection } from '@/types';
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

  // Chat panel state
  activeIterationNumber: number | null;
  chatMessages: Record<number, ChatMessage[]>;
  chatPanelOpen: boolean;
  chatLoading: 'send' | 'apply' | 'save' | null;
  continuationLoading: boolean;

  // Smart Setup
  setupSuggestion: SetupSuggestion | null;
  setupLoading: boolean;
  setupError: string | null;

  // Audit → Action
  auditFindings: AuditFinding[] | null;
  auditLoading: boolean;
  applyAuditLoading: boolean;

  // Custom Modes library
  customModes: CustomMode[];
  customModesLoading: boolean;

  // Session ID — generated on first iteration, used for Supabase chat persistence
  sessionId: string | null;

  // Long-Form Document Orchestration
  longForm: LongFormState | null;
  longFormLoading: boolean;

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
  setActiveIteration: (n: number | null) => void;
  appendChatMessage: (iteration: number, message: ChatMessage) => void;
  setChatMessages: (iteration: number, messages: ChatMessage[]) => void;
  loadAllChatMessages: (byIteration: Record<number, ChatMessage[]>) => void;
  setChatLoading: (state: 'send' | 'apply' | 'save' | null) => void;
  setContinuationLoading: (b: boolean) => void;
  setSetupSuggestion: (s: SetupSuggestion | null) => void;
  setSetupLoading: (b: boolean) => void;
  setSetupError: (e: string | null) => void;
  applySetupSuggestion: (s: SetupSuggestion) => void;
  setAuditFindings: (f: AuditFinding[] | null) => void;
  setAuditLoading: (b: boolean) => void;
  setApplyAuditLoading: (b: boolean) => void;
  setCustomModes: (m: CustomMode[]) => void;
  setCustomModesLoading: (b: boolean) => void;
  setChatPanelOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
  finalize: () => void;
  resetSession: () => void;
  carryLessonsForward: (objective: string, constraints: string) => void;
  loadSession: (session: Session) => void;
  setLongForm: (state: LongFormState | null) => void;
  setLongFormStateName: (name: LongFormState['state']) => void;
  updateOutline: (outline: OutlineSection[]) => void;
  setSectionContent: (index: number, content: string, finish_reason: string) => void;
  setSectionStatus: (index: number, status: OutlineSection['status'], error?: string | null) => void;
  setSectionRegenerated: (index: number, content: string, finish_reason: string) => void;
  setCurrentSectionIndex: (i: number) => void;
  setContinuitySnapshot: (snapshot: LongFormState['continuity_snapshot']) => void;
  clearLongForm: () => void;
  setLongFormLoading: (loading: boolean) => void;
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
  activeIterationNumber: null as number | null,
  chatMessages: {} as Record<number, ChatMessage[]>,
  chatPanelOpen: false,
  chatLoading: null as 'send' | 'apply' | 'save' | null,
  continuationLoading: false,
  setupSuggestion: null as SetupSuggestion | null,
  setupLoading: false,
  setupError: null as string | null,
  auditFindings: null as AuditFinding[] | null,
  auditLoading: false,
  applyAuditLoading: false,
  customModes: [] as CustomMode[],
  customModesLoading: false,
  sessionId: null as string | null,
  longForm: null as LongFormState | null,
  longFormLoading: false,
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
      setMode: (mode) =>
        set(
          mode === 'custom'
            ? { mode }
            : { mode, customName: '', customPreamble: '', customTone: '' }
        ),
      setCustomMode: (customName, customPreamble, customTone) =>
        set({ customName, customPreamble, customTone }),
      setAssembled: (assembled) =>
        set({ assembled, promptEdited: assembled.user_prompt, systemPrompt: assembled.system_prompt }),
      setPromptEdited: (promptEdited) => set({ promptEdited }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      appendIteration: (iteration, suggestions) =>
        set((state) => {
          const newSessionId =
            state.sessionId ??
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
              : Math.random().toString(36).slice(2, 10));
          return {
            iterations: [...state.iterations, iteration],
            currentOutput: iteration.output,
            currentEval: iteration.evaluation,
            suggestions,
            activeIterationNumber: iteration.iteration_number,
            chatMessages: {
              ...state.chatMessages,
              [iteration.iteration_number]: state.chatMessages[iteration.iteration_number] || [],
            },
            sessionId: newSessionId,
          };
        }),
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
      setActiveIteration: (n) => set((state) => {
        if (n === null) return { activeIterationNumber: null };
        const iter = state.iterations.find((it) => it.iteration_number === n);
        if (!iter) return {};
        return {
          activeIterationNumber: n,
          currentOutput: iter.output,
          currentEval: iter.evaluation,
        };
      }),
      appendChatMessage: (iteration, message) =>
        set((state) => ({
          chatMessages: {
            ...state.chatMessages,
            [iteration]: [...(state.chatMessages[iteration] || []), message],
          },
        })),
      setChatMessages: (iteration, messages) =>
        set((state) => ({
          chatMessages: { ...state.chatMessages, [iteration]: messages },
        })),
      loadAllChatMessages: (byIteration) =>
        set({ chatMessages: byIteration }),
      setChatLoading: (chatLoading) => set({ chatLoading }),
      setContinuationLoading: (continuationLoading) => set({ continuationLoading }),
      setSetupSuggestion: (setupSuggestion) => set({ setupSuggestion }),
      setSetupLoading: (setupLoading) => set({ setupLoading }),
      setSetupError: (setupError) => set({ setupError }),
      setAuditFindings: (auditFindings) => set({ auditFindings }),
      setAuditLoading: (auditLoading) => set({ auditLoading }),
      setApplyAuditLoading: (applyAuditLoading) => set({ applyAuditLoading }),
      setCustomModes: (customModes) => set({ customModes }),
      setCustomModesLoading: (customModesLoading) => set({ customModesLoading }),
      applySetupSuggestion: (s) =>
        set({
          setupSuggestion: s,
          mode: s.mode,
          audience: s.audience,
          constraints: s.constraints,
          outputFormat: s.output_format,
        }),
      setChatPanelOpen: (chatPanelOpen) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('pm-chat-panel-open', chatPanelOpen ? '1' : '0');
        }
        set({ chatPanelOpen });
      },
      toggleChatPanel: () => set((state) => {
        const next = !state.chatPanelOpen;
        if (typeof window !== 'undefined') {
          localStorage.setItem('pm-chat-panel-open', next ? '1' : '0');
        }
        return { chatPanelOpen: next };
      }),
      setLongForm: (state) => set({ longForm: state }),
      setLongFormStateName: (name) => set((s) => ({
        longForm: s.longForm ? { ...s.longForm, state: name } : s.longForm,
      })),
      updateOutline: (outline) => set((s) => ({
        longForm: s.longForm ? { ...s.longForm, outline } : s.longForm,
      })),
      setSectionContent: (index, content, finish_reason) => set((s) => {
        if (!s.longForm) return {};
        const outline = s.longForm.outline.map((sec, i) =>
          i === index
            ? { ...sec, content, finish_reason, status: 'complete' as const, generated_at: new Date().toISOString() }
            : sec
        );
        return { longForm: { ...s.longForm, outline } };
      }),
      setSectionStatus: (index, status, error = null) => set((s) => {
        if (!s.longForm) return {};
        const outline = s.longForm.outline.map((sec, i) =>
          i === index ? { ...sec, status, error: error ?? sec.error } : sec
        );
        return { longForm: { ...s.longForm, outline } };
      }),
      setSectionRegenerated: (index, content, finish_reason) => set((s) => {
        if (!s.longForm) return {};
        const outline = s.longForm.outline.map((sec, i) =>
          i === index
            ? {
                ...sec,
                content,
                finish_reason,
                status: 'complete' as const,
                revision: sec.revision + 1,
                generated_at: new Date().toISOString(),
                error: null,
              }
            : sec
        );
        return { longForm: { ...s.longForm, outline } };
      }),
      setCurrentSectionIndex: (i) => set((s) => ({
        longForm: s.longForm ? { ...s.longForm, current_section_index: i } : s.longForm,
      })),
      setContinuitySnapshot: (snapshot) => set((s) => ({
        longForm: s.longForm ? { ...s.longForm, continuity_snapshot: snapshot } : s.longForm,
      })),
      clearLongForm: () => set({ longForm: null }),
      setLongFormLoading: (longFormLoading) => set({ longFormLoading }),
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
          activeIterationNumber: session.iterations.length > 0 ? session.iterations[session.iterations.length - 1].iteration_number : null,
          chatMessages: {},
          sessionId: session.session_id,
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
