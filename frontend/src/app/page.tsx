'use client';

import Link from 'next/link';
import Image from 'next/image';
import { SplineScene } from '@/components/ui/splite';
import { Spotlight } from '@/components/ui/spotlight';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { Card } from '@/components/ui/card';

const MODES = [
  { icon: 'architecture', name: 'Architect', desc: 'Structure, systems, and frameworks' },
  { icon: 'rate_review', name: 'Critic', desc: 'Finding weak points and contradictions' },
  { icon: 'lightbulb', name: 'Clarity', desc: 'Translating complexity into understanding' },
  { icon: 'sports', name: 'Coach', desc: 'Motivation and reframing obstacles' },
  { icon: 'psychology', name: 'Therapist', desc: 'Empathetic exploration and insight' },
  { icon: 'ac_unit', name: 'Cold Critic', desc: 'Brutal honesty, zero praise' },
  { icon: 'analytics', name: 'Analyst', desc: 'Data-driven, evidence-based reasoning' },
  { icon: 'tune', name: 'Custom', desc: 'Your own mode — define the persona' },
];

const PHASES = [
  { step: '01', name: 'Define', desc: 'Choose a mode, set your objective, audience, and constraints.', icon: 'edit_note' },
  { step: '02', name: 'Review', desc: 'See the optimized prompt with invisible scaffolding built in.', icon: 'visibility' },
  { step: '03', name: 'Execute', desc: 'Generate output with a separate, independent AI evaluation.', icon: 'electric_bolt' },
  { step: '04', name: 'Evaluate', desc: 'See alignment, clarity, and drift scores with actionable suggestions.', icon: 'assessment' },
  { step: '05', name: 'Refine', desc: 'Iterate, realign, or finalize — every cycle improves the output.', icon: 'auto_fix_high' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface)]">
      {/* ===== NAVIGATION ===== */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a1a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="PromptMaster" className="w-8 h-8 rounded-lg" />
            <span className="text-white font-semibold tracking-tight">PromptMaster</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/session"
              className="px-5 py-2 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-screen bg-[#0a0a1a] overflow-hidden">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#2563eb" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20 flex flex-col lg:flex-row items-center min-h-screen">
          {/* Left: Copy */}
          <div className="flex-1 space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--pm-primary)] animate-pulse" />
              A system for thinking with AI
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40 leading-[1.1]">
              Stop prompting.
              <br />
              Start thinking.
            </h1>

            <p className="text-lg md:text-xl text-white/50 max-w-xl leading-relaxed">
              Get clearer, more precise results by structuring how you interact
              with AI — using modes, evaluation, and iterative refinement.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/session"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--pm-primary)] text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                Start Building
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/5 text-white/80 text-sm font-semibold rounded-xl border border-white/10 hover:bg-white/10 transition-all"
              >
                See How It Works
              </a>
            </div>
          </div>

          {/* Right: Spline 3D Scene */}
          <div className="flex-1 relative h-[400px] lg:h-[500px] w-full mt-12 lg:mt-0">
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Gradient fade to white */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--surface)] to-transparent" />
      </section>

      {/* ===== PRODUCT SHOWCASE (ContainerScroll) ===== */}
      <section className="bg-[var(--surface)]">
        <ContainerScroll
          titleComponent={
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--pm-primary)]">
                The Interface
              </p>
              <h2 className="text-4xl md:text-[3.5rem] font-bold text-[var(--on-surface)] leading-tight tracking-tight">
                Not another chatbox.
                <br />
                <span className="text-[var(--pm-primary)]">A structured workflow.</span>
              </h2>
            </div>
          }
        >
          <Image
            src="/app-screenshot.png"
            alt="PromptMaster session interface"
            height={720}
            width={1400}
            className="mx-auto rounded-2xl object-cover h-full object-left-top"
            draggable={false}
          />
        </ContainerScroll>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="py-32 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20 space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--pm-primary)]">
              How It Works
            </p>
            <h2 className="text-display text-[var(--on-surface)]">
              Five phases. One aligned output.
            </h2>
            <p className="text-body text-[var(--on-surface-variant)] max-w-2xl mx-auto">
              PromptMaster structures every AI interaction into a repeatable loop:
              define, review, execute, evaluate, and refine — until the output
              matches your intent.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {PHASES.map((phase) => (
              <div key={phase.step} className="relative group">
                <div className="bg-white rounded-2xl p-6 shadow-ambient hover:shadow-lg transition-all hover:-translate-y-1 h-full space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-extrabold text-[var(--pm-primary)] tracking-widest">
                      {phase.step}
                    </span>
                    <span className="material-symbols-outlined text-[var(--pm-primary)] text-[20px]">
                      {phase.icon}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--on-surface)]">
                    {phase.name}
                  </h3>
                  <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
                    {phase.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MODES ===== */}
      <section className="py-32 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20 space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--pm-primary)]">
              8 Modes
            </p>
            <h2 className="text-display text-[var(--on-surface)]">
              Choose how the AI thinks.
            </h2>
            <p className="text-body text-[var(--on-surface-variant)] max-w-2xl mx-auto">
              Each mode locks the AI into a specific persona with tailored tone,
              structure, and invisible scaffolding — so the output matches the
              task, not a generic response.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {MODES.map((mode) => (
              <Card
                key={mode.name}
                className="p-6 bg-[var(--surface-container-low)] border-0 hover:bg-[var(--surface-container)] hover:-translate-y-1 transition-all cursor-default group"
              >
                <span className="material-symbols-outlined text-[var(--pm-primary)] text-[28px] mb-4 block group-hover:scale-110 transition-transform">
                  {mode.icon}
                </span>
                <h3 className="text-sm font-bold text-[var(--on-surface)] mb-1">
                  {mode.name}
                </h3>
                <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">
                  {mode.desc}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== KEY DIFFERENTIATORS ===== */}
      <section className="py-32 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-ambient space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--pm-primary)]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--pm-primary)]">verified</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--on-surface)]">
                Independent Evaluation
              </h3>
              <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
                A separate AI call scores every output on alignment, clarity, and
                drift — the AI never grades itself.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-ambient space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--pm-primary)]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--pm-primary)]">target</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--on-surface)]">
                Drift Detection
              </h3>
              <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
                Every output is checked for scope deviation. When drift is
                detected, the system triggers a corrective realignment.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-ambient space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--pm-primary)]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--pm-primary)]">auto_fix_high</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--on-surface)]">
                Iterative Refinement
              </h3>
              <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
                Each cycle improves on the last. Actionable suggestions tell you
                exactly what to change and which action to take next.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-32 bg-[#0a0a1a] relative overflow-hidden">
        <Spotlight className="-top-40 right-0 md:right-60 md:-top-20" fill="#2563eb" />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
            Ready to think with AI?
          </h2>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Define your request. Let the system structure it. Evaluate the
            result. Refine until it&apos;s right.
          </p>
          <Link
            href="/session"
            className="inline-flex items-center justify-center gap-2 px-10 py-4 bg-[var(--pm-primary)] text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            Start Your First Session
          </Link>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-12 bg-[#0a0a1a] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="PromptMaster" className="w-6 h-6 rounded" />
            <span className="text-sm text-white/40">PromptMaster</span>
          </div>
          <p className="text-xs text-white/30">
            Built on the methodology from &ldquo;How to Become a PromptMaster&rdquo;
          </p>
        </div>
      </footer>
    </div>
  );
}
