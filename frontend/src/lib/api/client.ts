import type {
  PMInput,
  AssembledPrompt,
  Iteration,
  EvaluationResult,
  ModeConfig,
  FlowTriggerType,
  FlowInspectType,
  FlowInspectResult,
  ChatMessage,
  ChatMessageRequest,
  ChatMessageResponse,
  ApplyToAnswerRequest,
  SaveAsNewVersionRequest,
  IterationFromConversationResponse,
  ContinueDocumentRequest,
  GenerateSetupRequest,
  GenerateSetupResponse,
  AuditFindingsRequest,
  AuditFindingsResponse,
  ApplyAuditRequest,
  ContinuitySnapshot,
  DetectLongFormResponse,
  GenerateOutlineResponse,
  GenerateSectionResponse,
  OutlineSection,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  async buildPrompt(inputs: PMInput): Promise<AssembledPrompt> {
    return apiFetch('/api/build-prompt', {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    });
  },

  async runIteration(req: {
    inputs: PMInput;
    prompt_text: string;
    system_text: string;
    iteration_number: number;
    iteration_history?: Iteration[];
    source?: string;
    model?: string;
  }): Promise<{ iteration: Iteration; suggestions: string[] }> {
    return apiFetch('/api/run-iteration', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async buildRealignment(req: {
    inputs: PMInput;
    evaluation: EvaluationResult;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<{ realignment_prompt: string }> {
    return apiFetch('/api/build-realignment', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async flowTrigger(req: {
    inputs: PMInput;
    current_output: string;
    trigger: FlowTriggerType;
    iteration_number: number;
    evaluation?: EvaluationResult | null;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<{ iteration: Iteration; suggestions: string[] }> {
    return apiFetch('/api/flow-trigger', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async flowInspect(req: {
    inputs: PMInput;
    current_output: string;
    inspection: FlowInspectType;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<FlowInspectResult> {
    return apiFetch('/api/flow-inspect', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async chatMessage(req: ChatMessageRequest): Promise<ChatMessageResponse> {
    return apiFetch('/api/chat-message', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async applyToAnswer(req: ApplyToAnswerRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/apply-to-answer', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async saveAsNewVersion(req: SaveAsNewVersionRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/save-as-new-version', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async continueDocument(req: ContinueDocumentRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/continue-document', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async detectLongForm(req: { inputs: PMInput; model?: string }): Promise<DetectLongFormResponse> {
    return apiFetch('/api/detect-long-form', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async generateOutline(req: {
    inputs: PMInput;
    suggested_section_count: number;
    model?: string;
  }): Promise<GenerateOutlineResponse> {
    return apiFetch('/api/generate-outline', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async generateSection(req: {
    inputs: PMInput;
    outline: OutlineSection[];
    section_index: number;
    prior_snapshot: ContinuitySnapshot | null;
    prev_section_content: string;
    model?: string;
  }): Promise<GenerateSectionResponse> {
    return apiFetch('/api/generate-section', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async finalizeLongForm(req: {
    inputs: PMInput;
    merged_content: string;
    outline: OutlineSection[];
    iteration_number: number;
    iteration_history: Iteration[];
    model?: string;
  }): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/finalize-long-form', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async generateSetup(req: GenerateSetupRequest): Promise<GenerateSetupResponse> {
    return apiFetch('/api/generate-setup', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async auditFindings(req: AuditFindingsRequest): Promise<AuditFindingsResponse> {
    return apiFetch('/api/audit-findings', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async applyAudit(req: ApplyAuditRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/apply-audit', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async runSelfAudit(req: {
    inputs: PMInput;
    iterations: Iteration[];
    model?: string;
  }): Promise<{ audit: string }> {
    return apiFetch('/api/run-self-audit', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async hardResetLessons(req: {
    inputs: PMInput;
    iterations: Iteration[];
    model?: string;
  }): Promise<{ lessons: string }> {
    return apiFetch('/api/hard-reset-lessons', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async formatSummary(req: {
    inputs: PMInput;
    iterations: Iteration[];
  }): Promise<{ summary: string }> {
    return apiFetch('/api/format-summary', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async exportSession(req: {
    inputs: PMInput;
    iterations: Iteration[];
    model?: string;
  }): Promise<{ json: string }> {
    return apiFetch('/api/export-session', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async getModels(): Promise<{ models: Array<{ id: string; name: string; context_length: number }> }> {
    return apiFetch('/api/models');
  },

  async getModes(): Promise<Record<string, ModeConfig>> {
    return apiFetch('/api/modes');
  },
};

export type { ChatMessage };
