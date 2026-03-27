# Session Workspace — Page-Specific Design Overrides

> These rules override MASTER.md for the main session workspace page.

## Score Badge System

Evaluation badges for Alignment, Drift, and Clarity dimensions.

### Color Tokens (Score States)

| State | Light Mode BG | Light Mode Text | Dark Mode BG | Dark Mode Text | Usage |
|-------|--------------|-----------------|-------------|----------------|-------|
| High (Good) | `#ECFDF5` | `#065F46` | `#064E3B` | `#6EE7B7` | Alignment=High, Clarity=High, Drift=Low |
| Medium | `#FFFBEB` | `#78350F` | `#78350F` | `#FCD34D` | Any dimension=Medium |
| Low (Bad) | `#FEF2F2` | `#7F1D1D` | `#7F1D1D` | `#FCA5A5` | Alignment=Low, Clarity=Low, Drift=High |

### Drift Polarity Inversion

Drift uses **inverted polarity**: Low drift = good (green), High drift = bad (red). This is the opposite of Alignment and Clarity where High = good.

### Badge Component Spec

```
Score Badge:
  padding: 4px 12px
  border-radius: 9999px (pill shape)
  font-size: 13px
  font-weight: 600
  letter-spacing: 0.025em
  text-transform: uppercase
```

### Trend Indicators

| Direction | Symbol | Color (Light) | Color (Dark) | Meaning |
|-----------|--------|--------------|-------------|---------|
| Improved | ▲ | `#059669` | `#6EE7B7` | Score got better |
| Declined | ▼ | `#DC2626` | `#FCA5A5` | Score got worse |
| Unchanged | — | `#6B7280` | `#9CA3AF` | No change |

## Phase Indicator

Visual stepper showing the 5 workflow phases.

| Phase | Label | Active Color |
|-------|-------|-------------|
| input | 1. Input | `#2563EB` (primary) |
| review | 2. Review | `#2563EB` |
| output | 3. Output | `#2563EB` |
| realign | 4. Realignment | `#F59E0B` (amber — corrective) |
| summary | 5. Summary | `#059669` (green — complete) |

Inactive phases: `#CBD5E1` (slate-300)
Completed phases: `#059669` with checkmark icon

## Evaluation Card Layout

Quality Scores (Alignment + Clarity) displayed in 2-column grid.
Scope Check (Drift) displayed full-width below with explanatory caption.

```
┌─────────────────────────────────────────────┐
│ Quality Scores                              │
│ ┌──────────────────┐ ┌──────────────────┐   │
│ │ Alignment: High  │ │ Clarity: High    │   │
│ │ On-target...     │ │ Well-structured  │   │
│ └──────────────────┘ └──────────────────┘   │
│                                             │
│ Scope Check                                 │
│ ┌───────────────────────────────────────┐   │
│ │ Drift: Low                            │   │
│ │ Focused and relevant                  │   │
│ │ ⓘ Low = focused. High = off-topic.  │   │
│ └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Tier Badge Colors

| Tier | Name | Color | Badge BG |
|------|------|-------|----------|
| 1 | Prompt Starter | `#9CA3AF` | `#F3F4F6` |
| 2 | Prompt Practitioner | `#3B82F6` | `#EFF6FF` |
| 3 | Prompt Architect | `#8B5CF6` | `#F5F3FF` |
| 4 | PromptMaster | `#F59E0B` | `#FFFBEB` |

## Dark Mode Palette

| Token | Light | Dark |
|-------|-------|------|
| Background | `#F8FAFC` | `#0F172A` |
| Surface | `#FFFFFF` | `#1E293B` |
| Surface Elevated | `#FFFFFF` | `#334155` |
| Border | `#E2E8F0` | `#334155` |
| Text Primary | `#1E293B` | `#F1F5F9` |
| Text Secondary | `#64748B` | `#94A3B8` |
| Text Muted | `#94A3B8` | `#64748B` |
| Primary | `#2563EB` | `#3B82F6` |
| Accent | `#F97316` | `#FB923C` |

## Sidebar Spec

- Width: 280px (desktop), drawer on mobile
- Background: Surface color
- Border-right: 1px solid Border color
- Sections separated by thin dividers
- Session history items: compact cards with objective preview (50 chars)
