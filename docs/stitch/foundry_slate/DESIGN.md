# Design System Specification

## 1. Overview & Creative North Star: "The Architectural Monolith"
This design system rejects the cluttered, "bubble-ui" aesthetics of common SaaS platforms in favor of **Architectural Monolithism**. Inspired by the precision of high-end editorial layouts and technical drafting, the system focuses on extreme legibility, intentional white space, and structural confidence. 

The "North Star" is to make the user feel like they are operating a high-precision instrument. We achieve this not through heavy borders or shadows, but through **Tonal Separation** and **Asymmetric Balance**. By keeping the main content area constrained to a focused 720px, we treat every prompt and output as a piece of curated gallery content.

---

## 2. Colors & Surface Logic

### The "No-Line" Rule
To maintain a premium, seamless feel, **1px solid borders are prohibited for sectioning.** Traditional dividers create visual noise. Instead, boundaries must be defined by shifts in background tokens. 
*   *Example:* A sidebar using `surface_container` sitting adjacent to a `surface` main content area provides a natural, sophisticated break without the "boxed-in" feel of a stroke.

### Surface Hierarchy & Nesting
We treat the UI as a physical stack of fine paper. Use the following tiers to define depth:
*   **Base Layer:** `surface` (#f7f9fb) for the primary application background.
*   **The Content Well:** `surface_container_lowest` (#ffffff) for primary cards and workspace areas.
*   **The Utility Layer:** `surface_container` (#eceef0) for the fixed 260px sidebar and secondary navigation elements.

### The "Glass & Tonal" Signature
While we avoid "AI Gradients," we utilize **Tonal Transitions** to provide soul. 
*   **Primary CTA:** Use `primary` (#004ac6) transitioning slightly into `primary_container` (#2563eb) at a 15-degree angle to give buttons a subtle "pressed" physical depth rather than a flat digital look.
*   **Floating Elements:** Command palettes or tooltips must use `surface_container_lowest` with a 20px `backdrop-blur` and 80% opacity to feel integrated into the environment.

---

## 3. Typography: The Editorial Scale
We use **Inter** exclusively. To move beyond "standard" UI, we use exaggerated scale shifts to create a hierarchy of authority.

| Level | Token | Weight | Size | Tracking | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-md` | 600 | 2.75rem | -0.04em | High-impact page headers. |
| **Headline** | `headline-sm` | 600 | 1.5rem | -0.02em | Section titles within the 720px well. |
| **Title** | `title-sm` | 500 | 1rem | -0.01em | Card headers and modal titles. |
| **Body** | `body-md` | 400 | 0.875rem | 0 | Primary reading and prompt text. |
| **Label** | `label-md` | 500 | 0.75rem | +0.02em | Sidebar items, button text, and metadata. |

*   **Editorial Spacing:** Maintain a line-height of 1.6 for `body-md` to ensure heavy prompt blocks remain breathable.

---

## 4. Elevation & Depth: Tonal Layering

### The Layering Principle
Depth is achieved through the **Stacking Order**. 
1.  **Level 0 (Floor):** `surface` (#f7f9fb).
2.  **Level 1 (In-set):** `surface_container_low` (#f2f4f6) for recessed areas like code blocks.
3.  **Level 2 (Raised):** `surface_container_lowest` (#ffffff) for interactive cards.

### Ambient Shadows
Shadows should feel like a soft afternoon light. 
*   **Token:** `0px 4px 20px rgba(25, 28, 30, 0.04)`.
*   Avoid dark grays; the shadow must be a low-opacity tint of `on_surface`.

### The Ghost Border Fallback
If a border is required for accessibility (e.g., input focus), use `outline_variant` (#c3c6d7) at **20% opacity**. This ensures the structure is felt but not "seen."

---

## 5. Components

### Buttons (Roundedness: `lg` - 0.5rem)
*   **Primary:** Background `primary_container`, text `on_primary`. No border. Subtle 2px bottom-heavy shadow on hover.
*   **Secondary:** Background `surface_container_high`, text `on_surface`.
*   **Ghost:** Background `transparent`, text `on_surface_variant`. 

### Cards & Workspace (Roundedness: `xl` - 0.75rem)
*   Forbid divider lines. Separate header from body using a `3` (1rem) spacing unit.
*   The max-width for content cards is strictly **720px**, centered within the main view to maintain focus.

### Input Fields & Prompt Editor
*   **Resting State:** `surface_container_low` background with no border.
*   **Focus State:** `surface_container_lowest` background with a `primary` "Ghost Border" at 40% opacity.
*   **Interaction:** Use Lucide icons at 18px size, colored in `outline`.

### Navigation Sidebar (Fixed 260px)
*   Uses `surface_container` background.
*   Active state items use `surface_container_highest` with a `lg` border radius. 
*   No vertical borders between the sidebar and main content; define the edge via the background color shift.

---

## 6. Do’s and Don’ts

### Do
*   **Use Asymmetry:** Align primary actions to the right of the 720px container while keeping labels left-aligned to create "white space tension."
*   **Trust the Scale:** Use `spacing.12` (4rem) between major sections to let the interface breathe.
*   **Contextual Icons:** Use Lucide icons sparingly; they are accents, not primary communicators.

### Don't
*   **No 1px Lines:** Never use a solid border to separate a header from a list. Use a `spacing.4` (1.4rem) gap instead.
*   **No Pure Black:** Never use #000000. Use `on_surface` (#191c1e) for text to maintain the "soft-ink" editorial feel.
*   **No AI "Fluff":** Avoid glows, sparkles, or rainbow gradients. The "Master" in the system name comes from technical prowess, not visual gimmicks.

### Accessibility Note
Ensure all text combinations maintain a 4.5:1 contrast ratio. When using `surface_container_low` against `surface`, ensure the content within uses `on_surface` for maximum legibility.