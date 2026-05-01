'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { loadAllMessagesForSession, saveMessage } from '@/lib/supabase/conversation';
import type { ChatMessage, PMInput, Iteration } from '@/types';
import { ChatMessageList } from './chat-message-list';
import { ChatActionBar } from './chat-action-bar';
import { ChatInput } from './chat-input';
import { VersionSelector } from './version-selector';

const AUTO_OPEN_KEY = 'pm-chat-panel-auto-opened';
const PANEL_OPEN_KEY = 'pm-chat-panel-open';

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function ChatPanel({ sessionId }: { sessionId: string | null }) {
  const phase = useSessionStore((s) => s.phase);
  const iterations = useSessionStore((s) => s.iterations);
  const activeIterationNumber = useSessionStore((s) => s.activeIterationNumber);
  const chatMessages = useSessionStore((s) => s.chatMessages);
  const chatPanelOpen = useSessionStore((s) => s.chatPanelOpen);
  const chatLoading = useSessionStore((s) => s.chatLoading);

  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const model = useSessionStore((s) => s.model);

  const setActiveIteration = useSessionStore((s) => s.setActiveIteration);
  const appendChatMessage = useSessionStore((s) => s.appendChatMessage);
  const loadAllChatMessages = useSessionStore((s) => s.loadAllChatMessages);
  const setChatLoading = useSessionStore((s) => s.setChatLoading);
  const setChatPanelOpen = useSessionStore((s) => s.setChatPanelOpen);
  const setError = useSessionStore((s) => s.setError);
  const appendIteration = useSessionStore((s) => s.appendIteration);

  const hydratedSessionRef = useRef<string | null>(null);

  // Hydrate persisted open/closed state from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(PANEL_OPEN_KEY);
    if (stored !== null) {
      setChatPanelOpen(stored === '1');
    }
  }, [setChatPanelOpen]);

  // Auto-open the first time an iteration appears.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (iterations.length === 0) return;
    const autoOpened = localStorage.getItem(AUTO_OPEN_KEY);
    if (!autoOpened) {
      setChatPanelOpen(true);
      localStorage.setItem(AUTO_OPEN_KEY, '1');
    }
  }, [iterations.length, setChatPanelOpen]);

  // When a session is loaded, hydrate chat messages from Supabase once.
  useEffect(() => {
    if (!sessionId) return;
    if (hydratedSessionRef.current === sessionId) return;
    hydratedSessionRef.current = sessionId;
    loadAllMessagesForSession(sessionId).then((byIter) => {
      loadAllChatMessages(byIter);
    });
  }, [sessionId, loadAllChatMessages]);

  if (phase !== 'output' || !chatPanelOpen) return null;

  const activeIteration: Iteration | undefined =
    activeIterationNumber !== null
      ? iterations.find((it) => it.iteration_number === activeIterationNumber)
      : iterations[iterations.length - 1];

  if (!activeIteration) return null;

  const messages = chatMessages[activeIteration.iteration_number] || [];

  function buildInputs(): PMInput {
    return {
      objective,
      audience,
      constraints,
      output_format: outputFormat,
      mode,
      session_facts: sessionFacts,
      ...(mode === 'custom' ? { custom_name: customName, custom_preamble: customPreamble, custom_tone: customTone } : {}),
    };
  }

  async function handleSend(text: string) {
    if (!activeIteration) return;
    const userMsg: ChatMessage = {
      id: genId(),
      iteration_number: activeIteration.iteration_number,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    appendChatMessage(activeIteration.iteration_number, userMsg);
    setChatLoading('send');
    setError(null);

    if (sessionId) {
      saveMessage({
        session_id: sessionId,
        iteration_number: activeIteration.iteration_number,
        role: 'user',
        content: text,
      }).catch(() => { /* swallow — UX continues */ });
    }

    try {
      const res = await api.chatMessage({
        inputs: buildInputs(),
        active_iteration: activeIteration,
        chat_history: messages,
        user_message: text,
        iteration_history: iterations,
        model,
      });
      appendChatMessage(activeIteration.iteration_number, res.assistant_message);
      if (sessionId) {
        saveMessage({
          session_id: sessionId,
          iteration_number: activeIteration.iteration_number,
          role: 'assistant',
          content: res.assistant_message.content,
        }).catch(() => { /* swallow */ });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat reply failed.');
    } finally {
      setChatLoading(null);
    }
  }

  async function handleApply() {
    if (!activeIteration || messages.length === 0) return;
    setChatLoading('apply');
    setError(null);
    try {
      const res = await api.applyToAnswer({
        inputs: buildInputs(),
        active_iteration: activeIteration,
        chat_history: messages,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        model,
      });
      appendIteration(res.iteration, res.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply to answer failed.');
    } finally {
      setChatLoading(null);
    }
  }

  async function handleSaveAsNew() {
    if (!activeIteration || messages.length === 0) return;
    setChatLoading('save');
    setError(null);
    try {
      const res = await api.saveAsNewVersion({
        inputs: buildInputs(),
        active_iteration: activeIteration,
        chat_history: messages,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        model,
      });
      appendIteration(res.iteration, res.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save as new version failed.');
    } finally {
      setChatLoading(null);
    }
  }

  return (
    <aside className="hidden md:flex fixed top-16 right-0 bottom-0 w-[380px] bg-white shadow-ambient border-l border-[var(--outline-variant)]/20 flex-col z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]">chat_bubble</span>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Chat</span>
        </div>
        <button
          type="button"
          onClick={() => setChatPanelOpen(false)}
          aria-label="Close chat"
          className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Version selector */}
      <div className="px-4 py-2 border-b border-[var(--outline-variant)]/20">
        <VersionSelector
          versions={iterations}
          activeNumber={activeIterationNumber}
          onSelect={(n) => setActiveIteration(n)}
        />
      </div>

      {/* Messages */}
      <ChatMessageList messages={messages} loading={chatLoading === 'send'} />

      {/* Actions */}
      <ChatActionBar
        onApplyToAnswer={handleApply}
        onSaveAsNewVersion={handleSaveAsNew}
        disabled={chatLoading !== null || messages.length === 0}
        loading={chatLoading === 'apply' ? 'apply' : chatLoading === 'save' ? 'save' : null}
      />

      {/* Input */}
      <ChatInput
        disabled={chatLoading !== null}
        onSend={handleSend}
      />
    </aside>
  );
}
