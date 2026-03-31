**PromptMaster Engine – Developer Brief (v0.1)**

**Goal of the Prototype**

Build a minimal, disposable prototype that proves the PromptMaster interaction model works better than raw ChatGPT for producing aligned, clear outputs.

This is not a full product.

This is not production-grade software.

This is a proof engine.

**What the Prototype MUST DO (non-negotiable)**

**1\. Structured Input**

The prototype must collect the following inputs from a user:

* Objective (free text)  
* Audience (dropdown or text)  
* Constraints (optional free text)  
* Mode selection (dropdown)

Modes (initial):

* Architect  
* Critic  
* Clarity  
* Coach

No automatic detection required. User selects mode manually.

**2\. Prompt Assembly**

Based on the inputs, the system must:

* Generate a single optimized prompt  
* The prompt must include:  
  * the user’s objective  
  * the selected mode  
  * audience \+ constraints  
  * internal scaffolding instructions (not visible to the user unless toggled)

The user must be able to:

* View the generated prompt  
* Edit it before execution (optional but preferred)

**3\. LLM Execution**

The prototype must:

* Send the prompt to an LLM (OpenAI API is fine)  
* Capture:  
  * prompt text  
  * output text  
  * mode used  
  * iteration number

No streaming required.

**4\. Evaluation Layer (Core Differentiator)**

After output is returned, the system must evaluate it along three dimensions:

* Alignment Score

  Does the output match the stated objective and audience?

* Drift Score

  Does the output introduce irrelevant content, speculation, or deviation?

* Clarity Score

  Is the output structured, complete, and unambiguous?

These can be:

* heuristic  
* rule-based  
* LLM-assisted  
* qualitative (Low / Medium / High)

They do not need to be statistically precise.

**5\. Iteration Loop**

If any score is below threshold:

* The system must generate a realignment prompt  
* The user must be able to re-run the interaction  
* Iterations must be tracked (Iteration 1, 2, 3…)

If all scores are acceptable:

* User can finalize the session  
* Generate a simple summary

**6\. Session Summary**

At the end, the system should be able to output:

* Final prompt  
* Final output  
* Iteration count  
* Final scores  
* Short interaction summary

This can just be displayed or copyable text.

**Inputs (Explicit)**

* Objective (string)  
* Audience (string or enum)  
* Constraints (string)  
* Mode (enum)  
* Iteration number (system-managed)

**Outputs (Explicit)**

* Generated prompt (string)  
* LLM response (string)  
* Alignment score  
* Drift score  
* Clarity score  
* Session summary

**What Can Be Ugly / Temporary (Allowed)**

* No login  
* No user accounts  
* No database (in-memory OK)  
* No styling beyond basic layout  
* No mobile support  
* No performance optimization  
* No security hardening  
* No analytics  
* No certifications  
* No export formats beyond copy/paste

If it looks bad but works, that’s a win.

**What Absolutely Must Work**

* Prompt generation logic  
* Mode-based behavior differences  
* Evaluation logic  
* Iteration flow  
* Clear improvement between iterations

If this doesn’t work, nothing else matters.

**Explicit Non-Goals (Do NOT build)**

* Dashboards  
* Billing  
* User management  
* Team collaboration  
* Permissions  
* Plug-ins  
* Integrations  
* Auto-mode detection  
* Machine learning training  
* Fine-tuning  
* App store anything

**Estimated Scope**

* 2–4 weeks  
* 1 developer  
* Hourly  
* NDA \+ IP assignment required  
* Prototype expected to be partially disposable

**Success Criteria**

The prototype is successful if:

* Users report clearer outputs than raw ChatGPT  
* Users understand why outputs improved  
* Iteration improves alignment measurably  
* Educators can imagine using it in a classroom  
* You can demo it in under 5 minutes

