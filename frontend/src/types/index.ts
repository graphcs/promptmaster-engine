export type ModeType = 'architect' | 'critic' | 'clarity' | 'coach' | 'therapist' | 'cold_critic' | 'analyst' | 'custom';
export type ScoreLevel = 'Low' | 'Medium' | 'High';
export type Phase = 'input' | 'review' | 'output' | 'realign' | 'summary';

export interface PMInput {
  objective: string;
  audience: string;
  constraints: string;
  output_format: string;
  mode: ModeType;
  custom_name?: string;
  custom_preamble?: string;
  custom_tone?: string;
}

export interface AssembledPrompt {
  system_prompt: string;
  user_prompt: string;
  scaffolding_notes: string;
}

export interface DimensionScore {
  score: ScoreLevel;
  explanation: string;
}

export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
}

export interface Iteration {
  iteration_number: number;
  prompt_sent: string;
  system_prompt_used: string;
  output: string;
  mode: ModeType;
  evaluation: EvaluationResult | null;
}

export interface PromptTemplate {
  template_id: string;
  name: string;
  created_at: string;
  mode: ModeType;
  audience: string;
  constraints: string;
  output_format: string;
  objective_hint: string;
  custom_name: string;
  custom_preamble: string;
  custom_tone: string;
}

export interface Session {
  session_id: string;
  created_at: string;
  objective: string;
  audience: string;
  constraints: string;
  output_format: string;
  mode: ModeType;
  model: string;
  iterations: Iteration[];
  finalized: boolean;
}

export interface ModeConfig {
  display_name: string;
  tagline: string;
  tone: string;
}

export interface SessionSummary {
  session_id: string;
  objective: string;
  mode: string;
  iterations: number;
  created_at: string;
  finalized: boolean;
}

export interface TemplateSummary {
  template_id: string;
  name: string;
  mode: string;
  audience: string;
  created_at: string;
}
