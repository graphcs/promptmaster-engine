'use client';

import { useState, useEffect, useCallback } from 'react';

export interface TutorialStep {
  /** CSS selector for the element to spotlight */
  target: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description text */
  description: string;
  /** Position of the tooltip relative to the target */
  position: 'top' | 'bottom' | 'left' | 'right';
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialOverlay({ steps, onComplete, onSkip }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  const step = steps[currentStep];

  const updateSpotlight = useCallback(() => {
    if (!step || !step.target) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);
      // Scroll element into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setSpotlightRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateSpotlight();
    // Recalculate on resize/scroll
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [updateSpotlight]);

  function handleNext() {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete();
    }
  }

  function handlePrev() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  if (!step) return null;

  // Calculate tooltip position with viewport clamping
  const padding = 12;
  const tooltipWidth = 320;
  const tooltipEstimatedHeight = 220;
  const tooltipStyle: React.CSSProperties = {};

  if (spotlightRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Determine best vertical position: prefer requested, but flip if it overflows
    let placeBelow = step.position === 'bottom' || step.position === 'right' || step.position === 'left';
    const spaceBelow = vh - spotlightRect.bottom - padding;
    const spaceAbove = spotlightRect.top - padding;

    if (placeBelow && spaceBelow < tooltipEstimatedHeight && spaceAbove > spaceBelow) {
      placeBelow = false;
    } else if (!placeBelow && spaceAbove < tooltipEstimatedHeight && spaceBelow > spaceAbove) {
      placeBelow = true;
    }

    if (placeBelow) {
      tooltipStyle.top = Math.min(spotlightRect.bottom + padding, vh - tooltipEstimatedHeight - 16);
    } else {
      tooltipStyle.bottom = Math.min(vh - spotlightRect.top + padding, vh - 16);
    }

    // Horizontal: start at element left, but clamp to viewport
    let left = spotlightRect.left;
    if (left + tooltipWidth > vw - 16) {
      left = vw - tooltipWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }
    tooltipStyle.left = left;
  }

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop with spotlight cutout using CSS clip-path */}
      <div
        className="absolute inset-0 bg-black/60 transition-all duration-300"
        style={
          spotlightRect
            ? {
                clipPath: `polygon(
                  0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
                  ${spotlightRect.left - 8}px ${spotlightRect.top - 8}px,
                  ${spotlightRect.left - 8}px ${spotlightRect.bottom + 8}px,
                  ${spotlightRect.right + 8}px ${spotlightRect.bottom + 8}px,
                  ${spotlightRect.right + 8}px ${spotlightRect.top - 8}px,
                  ${spotlightRect.left - 8}px ${spotlightRect.top - 8}px
                )`,
              }
            : {}
        }
        onClick={onSkip}
      />

      {/* Spotlight ring */}
      {spotlightRect && (
        <div
          className="absolute rounded-xl border-2 border-[var(--pm-primary)] pointer-events-none transition-all duration-300"
          style={{
            top: spotlightRect.top - 8,
            left: spotlightRect.left - 8,
            width: spotlightRect.width + 16,
            height: spotlightRect.height + 16,
            boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)',
          }}
        />
      )}

      {/* Tooltip card — centered if no spotlight target, positioned otherwise */}
      <div
        className={`bg-white rounded-2xl shadow-2xl p-5 sm:p-6 transition-all duration-300 ${
          spotlightRect
            ? 'absolute w-[calc(100vw-32px)] sm:w-[320px]'
            : 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-48px)] sm:w-[380px]'
        }`}
        style={spotlightRect ? { ...tooltipStyle, maxWidth: 'calc(100vw - 32px)' } : {}}
      >
        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentStep ? 'bg-[var(--pm-primary)]' : 'bg-[var(--surface-container-high)]'
              }`}
            />
          ))}
        </div>

        {/* Step counter */}
        <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--pm-primary)] mb-2">
          Step {currentStep + 1} of {steps.length}
        </p>

        {/* Content */}
        <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-2">
          {step.title}
        </h3>
        <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed mb-5">
          {step.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-xs text-[var(--outline)] hover:text-[var(--on-surface-variant)] transition-colors"
          >
            Skip tutorial
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-xs font-medium text-[var(--on-surface-variant)] rounded-lg hover:bg-[var(--surface-container-low)] transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--pm-primary)] rounded-lg hover:bg-[var(--pm-primary-container)] active:scale-[0.98] transition-all"
            >
              {currentStep < steps.length - 1 ? 'Next' : 'Finish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
