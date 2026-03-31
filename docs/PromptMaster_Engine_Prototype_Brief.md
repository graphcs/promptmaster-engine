**PromptMaster Engine — One-Page Prototype Brief**

What this is

A short-term, disposable prototype to validate a structured interaction layer on top of an LLM. This is not a platform, not a startup build, and not production software.

Goal

Prove that adding structure, mode selection, and evaluation on top of an LLM produces clearer, more aligned outputs than raw ChatGPT-style prompting.

Core idea

Most AI failures come from vague objectives and unexamined outputs. PromptMaster treats prompting as a process, not a trick.

**What the prototype does (must-have)**

1. Structured input  
   * Objective  
   * Audience  
   * Constraints  
   * Mode selection (Architect, Critic, Clarity, Coach)  
2. Prompt assembly  
   * System generates an optimized prompt from inputs \+ selected mode  
   * User can view and optionally edit before execution  
3. LLM execution  
   * Send prompt to LLM via API  
   * Capture output and iteration count  
4. Evaluation layer  
   * Alignment score: does output match objective?  
   * Drift score: does it wander or hallucinate?  
   * Clarity score: structure, completeness, ambiguity

   These can be heuristic or LLM-assisted. Precision is not required.

5. Iteration loop  
   * If scores are low, system generates a realignment prompt  
   * User can re-run and compare iterations  
6. Session summary  
   * Final output  
   * Prompt history  
   * Scores  
   * Iteration count

**What this is NOT**

* No accounts  
* No dashboards  
* No billing  
* No scaling  
* No ML training or fine-tuning  
* No long-term roadmap

If it’s ugly but works, that’s a success.

**Scope & engagement**

* 2–4 weeks  
* Single developer  
* Hourly contract  
* NDA \+ IP assignment  
* Prototype expected to be partially disposable

**Why this is interesting**

This sits above the model, not inside it.

It’s about interaction logic, evaluation, and iteration discipline — not model training.

A provisional patent covering this interaction system has already been filed.

