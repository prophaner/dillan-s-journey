# Dillan — Web-First Product Requirements and Development Brief

**Version:** 2.0 — Web-first revision • **Date:** October 15, 2026  
**Product owner:** Luis Ramos  
**Audience:** Luis, Claude as development partner, designers, engineers, and future coaching reviewers  
**Status:** Product baseline for implementation planning and feedback; not a claim that the app has been built  
**Working product name:** Dillan. The AI gym coach's name is confirmed; the application's final brand is undecided.

## 1. Executive brief

Build a mobile-first, responsive web app for personal home-gym coaching that helps a user understand what to work toward, why each session matters, and whether their effort is producing useful progress. The app combines structured training, low-friction logging, longitudinal observations, and a conversational AI Gym Coach named Dillan. An optional human coach can inspect authorized progress information and propose programs or directives.

The primary problem is misdirected effort: training without clear priorities, making unnecessary changes, struggling to interpret results, and losing useful observations across disconnected tools. The product must reduce planning burden while preserving the user's understanding and control.

The core loop is: establish a baseline → agree on goals and a framework → plan → execute and log → reflect → evaluate → preserve or adjust the plan. A successful loop may end with “stay the course.” Novel recommendations are not inherently valuable.

Dillan is a coach with a personality and independent judgment. He is caring, protective, firm, respectful, and willing to disagree. He reviews meaningful suggestions from the user, a human coach, and himself against the same explicit criteria. The user can override ordinary programming disagreements, but an override does not require Dillan to endorse unsafe guidance or erase recorded restrictions.

“Protect the user like a patient” means care, diligence, continuity, and caution. It does not mean the app diagnoses, treats, or replaces a clinician. The person using the app remains the decision-maker and can always stop, skip, or reduce a session.

### 1.1 What has already been decided

- The AI coach is named **Dillan** and is explicitly a **Gym Coach**.
- Goals, training frameworks, progression, assessments, daily logging, equipment, limitations, body measurements, reminders, and conversation belong in scope.
- Dillan's directives must be visible, editable within defined boundaries, versioned, and explainable.
- Human coaches need permissioned access to progress and a way to submit coach-specific directives.
- Meaningful changes require reasons and feedback, regardless of who proposes them.
- Dillan may recommend against or decline changes. The user needs a proportionate override mechanism.
- Consistency and gradual improvement matter more than novelty or maximum workload.
- The confirmed launch platform is the web, used primarily on mobile phones. A native iPhone or Watch app is not required to start or complete the web release.
- Apple Watch/Health connectivity remains a future integration objective, not a dependency for launch. Manual logging is fully supported from day one.
- All additions discussed in the planning conversation are included, including recovery, technique confidence, missed-session handling, plateaus, preferences, uncertainty, privacy, and portability.

### 1.2 Proposed defaults, not settled user decisions

- Start with an adult personal-use pilot; build multi-user isolation from the beginning so a coach can have multiple clients later.
- Build one responsive web application for trainees and coaches, with role-appropriate views. Add progressive web app (PWA) capabilities where useful; installation is optional. The website is the actual product, not a temporary native-app prototype.
- Start in English with selectable metric/imperial units and local timezone support.
- Default Dillan to suggesting changes; enable bounded automatic adjustments only after explicit configuration.
- Initially support one active primary human coach per user. Model relationships so additional coaches can be supported later.
- Keep review frequencies configurable. Weekly reflection and a less frequent program review are starting UX defaults, not exercise prescriptions.
- Use a small, reviewed exercise and framework catalog before expanding content volume.

## 2. Product objectives and boundaries

### 2.1 Four questions the app must answer

1. What should I do today?
2. Why is it worth doing?
3. Am I progressing toward what matters to me?
4. What, if anything, should change?

### 2.2 Product principles

| Principle | Product consequence |
|---|---|
| Outcomes before activities | Every program has explicit priorities and measurable objectives. |
| Consistency before novelty | Changes have an explanation, scope, and review trigger. |
| Effort is different from outcome | Track work performed, perceived difficulty, adherence, and results separately. |
| More is not automatically better | Appropriate recovery and reduced sessions can represent good decisions. |
| User autonomy | No permission is required to stop, skip, reduce, or truthfully log a workout. |
| Protective judgment | A coach title or confident user request is not sufficient reason to accept a change. |
| Explainability | Recommendations identify relevant goals, observations, rules, and uncertainties. |
| Minimum useful burden | Ask for data only when it supports reflection or a decision. |
| Durable records | Structured data is authoritative; chat history is not the database. |
| Honest uncertainty | Missing information remains unknown; AI inferences are labeled. |
| Reversible decisions | Plans and directives are versioned; changes can be reviewed and undone. |

### 2.3 Not in the initial scope

Native iPhone/Android applications, a Watch application, direct browser HealthKit access, and automatic Apple Health synchronization at launch; clinical diagnosis or autonomous rehabilitation; medical clearance; emergency monitoring; camera-based form certification; automatic muscle-activation measurement; automated repetition detection; social leaderboards; calorie-driven gamification; detailed meal planning; coach billing or a coach marketplace; third-party gym hardware integrations; unrestricted AI actions. These may require separate future discovery and are not implied by this specification.

The app can record clinician-provided restrictions and accommodate them. It must not present an unreviewed AI-generated assessment protocol as clinically validated. Legal, privacy, and distribution requirements must be evaluated for the actual launch context; no compliance certification is claimed here.

## 3. Users, roles, and ownership

| Role | Responsibilities | Default authority |
|---|---|---|
| Trainee / owner | Sets goals, trains, logs, shares data, approves changes | Own records and sharing; ordinary overrides; stop/skip at any time |
| Human coach | Reviews shared data, provides feedback, proposes training and directives | Read-only progress plus proposal rights when granted; no blanket access |
| Dillan | Explains, proposes, monitors available trends, applies permitted adjustments | Narrow tools and explicit policy limits; no independent expansion of permissions |
| Product administrator | Maintains app and reviewed content | No routine access to private health notes or chats; exceptional support access must be controlled and audited |

Data belongs to the trainee. Coach access requires invitation acceptance and explicit scopes. An invitation draft does not send itself. Revocation blocks future authorized access, including cached server summaries and queued notifications; previously downloaded copies cannot be technically recalled and should be disclosed at sharing time.

## 4. Information architecture

Keep the daily interface small even though the underlying system is rich.

| Area | Primary contents |
|---|---|
| Today | Today's plan, purpose, available-time adaptation, check-in, resume session |
| Train | Session runner, set logging, rest timer, alternatives, technique cues |
| Progress | Objectives, trends, capability levels, assessments, measurements, review history |
| Dillan | Conversation, recommendations, pending proposals, memory corrections |
| My Plan | Active framework, program, schedule, routine/exercise library |
| My Profile | Equipment, preferences, limitations, availability, units, integrations |
| Coaching & Directives | Human coach access, Dillan directives, effective policy, decisions and overrides |
| Settings | Notifications, privacy, AI data permissions, export, deletion, accessibility |

The coach workspace is part of the same responsive web product and starts with authorized clients, pending proposals and reviews, then a client-specific progress view. Do not show a roster of unrelated users.

### 4.1 Mobile-first web interaction requirements

- Primary use: portrait mobile browser, with one-handed navigation and minimal typing during training. Use a compact bottom navigation for Today, Train, Progress, and Dillan; keep secondary settings in a clear menu. This is a proposed layout, not a locked visual design.
- Support ordinary browser visits without installation. Optional home-screen installation offers an app-like entry point, not extra entitlement to personal data.
- Use large touch targets, numeric keyboards for set values, sticky actions that account for the on-screen keyboard, safe-area spacing, and visible undo. No hover-only controls.
- Avoid horizontal page scrolling at 320 CSS pixels. Validate 360–430 pixel phone layouts, tablet layouts, and desktop coach views.
- Make program editing, directive comparison, and coach analysis comfortable on desktop without sacrificing mobile access.
- Preserve draft/session state across navigation and accidental refresh. Show whether a log is saved on this device, synced, or failed.
- Browser support baseline: Safari on iPhone and Chrome on Android, plus current mainstream desktop browsers; record exact tested versions in each release. Feature-detect optional APIs rather than assuming parity.
- Native installation, an Apple developer account, or an App Store release must not be prerequisites for basic use.

## 5. Functional requirements

Requirement IDs are stable references for implementation, testing, and feedback. Phasing appears in section 15; a later phase is not removal from scope.

### FR-01 — Onboarding and baseline

Capture goals in the user's words, training experience, current routine, time budget, weekly availability, equipment, exercise preferences, relevant restrictions, and technique confidence. Allow progressive onboarding, skipping, and “unknown.” A user with an existing routine must be able to start logging it without first accepting a replacement program.

Baseline assessments are selected for relevance and suitability, not presented as a compulsory universal battery. Each assessment specifies instructions, required equipment, units, conditions, stop guidance, and source/review status. Record incomplete or declined assessments without assigning a failing score. Targets remain provisional until there is sufficient baseline information.

Acceptance: a new user can save an incomplete profile, enter an existing routine, and begin a session; missing data is visibly distinct from a zero result.

### FR-02 — Goals, priorities, and levels

Support long-term direction, training-block objectives, and short-term milestones. Each objective contains a purpose, priority, baseline, target or target range, metric, timeframe, evaluation method, and status. Allow process goals such as consistency alongside performance and body-measurement goals.

For each training period, distinguish **improve**, **maintain**, and **defer**. Record tradeoffs when priorities compete. Optional effort-allocation percentages must specify their denominator, such as planned training minutes. They are planning estimates, not precise physiological effects. Multi-purpose exercises must not be counted twice in a percentage total without explicit allocation rules.

Capability levels are domain-specific and tied to defined, repeatable criteria. Strength, endurance, mobility, control, and habit consistency need not progress together. Do not invent age-adjusted normative scores or imply clinical validation. Any normative comparison requires a suitable cited source and explicit applicability limits.

Acceptance: each active objective can be traced to relevant training and an evaluation; changing a level definition does not silently relabel historical results.

### FR-03 — Frameworks and program philosophy

Maintain a versioned framework record covering its intended use, scheduling logic, exercise-selection principles, progression and regression rules, recovery approach, evaluation cadence, and evidence/content-review status. Explain the active framework in plain language.

A program instantiates a framework for this user, their equipment, goals, constraints, and schedule. Dillan should first understand the routine already being executed. Unknown reasoning is marked as unknown rather than fabricated. Multiple methods may coexist, but their roles and progression rules must remain coherent.

Acceptance: the user can ask why a routine is structured this way and receive an answer grounded in the active program rather than generic fitness advice.

### FR-04 — Equipment and training environment

Inventory equipment type, available quantities, resistance ranges and increments, attachments, space/setup constraints, and temporary availability. Support bodyweight and outdoor options. Record actual home-gym inventory through onboarding; do not assume purchases or room arrangements from earlier unrelated discussions.

Substitutions must consider equipment, training intent, limitations, proficiency, and setup time. The app must not recommend unsupported mounting or load-bearing arrangements. A temporarily unavailable item need not be deleted.

Acceptance: a routine requiring unavailable equipment is flagged before the session, with compatible alternatives or a clear unresolved requirement.

### FR-05 — Exercise and routine library

An **exercise variation** includes name, movement pattern, intended emphasis, primary/supporting muscles, equipment, setup, execution cues, breathing cues, common mistakes, supported measurement types, alternatives, and reviewed media or instructions. Distinguish reviewed content from user-created and AI-drafted entries.

Muscle emphasis belongs to the precise variation: grip, stance, range, support, and other execution details can matter. Display intended emphasis without claiming that sensation or Apple Watch data proves correct activation. Provide “I do not understand this” and technique-confidence feedback.

A **routine template** contains ordered blocks and exercise prescriptions. Support straight sets, supersets, circuits, warm-up/work/cool-down blocks, rest, timed intervals, unilateral work, and optional/priority blocks. Represent grouping structurally, not only in text. Each exercise in a superset still has independent results. Permit manual create, duplicate, edit, archive, and version history. Editing a template never rewrites past sessions.

Acceptance: a two-exercise superset can prescribe multiple rounds, different repetitions for each exercise, transition rest, and round rest, and log each performed set separately.

### FR-06 — Planning and time adaptation

Schedule routines within a training block and provide a full session plus a shorter version preserving the main objective. Include setup, transitions, rest, and user pace in duration estimates; clearly label estimates. Avoid promising exact completion time.

Each exercise or block exposes “Why this is here,” linking to a goal, maintained capability, skill, or area for improvement. Unaddressed limitations must be shown as accommodated, avoided, pending, or unrelated—not falsely marked resolved.

Missed-session handling offers resume, reschedule, skip, or reconsider the remaining week. Do not automatically cram missed volume into the next session. Longer breaks or illness prompt a context check and a proportionate return proposal.

Acceptance: switching from a full session to a shorter plan preserves the original plan snapshot, explains omissions, and records what was actually performed.

### FR-07 — Day, session, exercise, and set logging

Support a daily record even without a workout; planned and ad-hoc sessions; exercise-level results; and individual sets. Store planned prescription and actual performance separately.

Set fields depend on exercise type: repetitions, resistance, duration, distance, side, assistance, hold time, and optional perceived difficulty. Define resistance conventions explicitly, including per-dumbbell versus combined load. Distinguish total versus per-side repetitions. Use RPE (rating of perceived exertion) and/or RIR (repetitions in reserve) only with explanations and scale definitions; either may be skipped. Do not silently treat RPE and RIR as interchangeable.

Provide prefilled previous values, quick repeat, undo, rest timers, pause/resume, abandoned-session recovery, and backdated corrections. Timers must be computed from saved timestamps, not from assuming JavaScript runs continuously. On return from a locked screen or suspended tab, recalculate elapsed/rest time. Do not promise a background timer sound. A checked-off session does not imply every prescribed set was completed. Partial completion is valid. Voice/text logging can draft structured entries; ambiguous or consequential parses require confirmation.

Acceptance: log, edit, undo, force-close, and resume without losing locally saved sets while browser storage remains intact; separately verify server-synced recovery. A repeated request does not duplicate a set. Historical entries preserve their applicable routine version.

### FR-08 — Notes, recovery, and longitudinal memory

Support daily notes, session notes, set comments, ad-hoc observations, enjoyment/preferences, technique confidence, and relevant sleep/fatigue/stress/illness context. Nutrition context may be noted, but comprehensive diet planning is not required.

Separate raw notes from extracted structured facts and AI hypotheses. Important durable facts proposed from conversation are reviewable and correctable. “My shoulder felt uncomfortable during this movement today” must not become a permanent diagnosis. Preserve date, affected movement/side, source, visibility, and review status.

Dillan should recognize repeated patterns while checking whether circumstances are comparable. New information updates understanding immediately; program changes still follow the change policy. Deleting or correcting a note must invalidate derived memories and summaries where necessary.

Acceptance: users can see what Dillan remembers, its source, and correct or remove it; inferred claims are distinguishable from user-confirmed facts.

### FR-09 — Limitations and areas for improvement

Represent reported injury, pain/discomfort, restricted motion, asymmetry, low capacity, technique uncertainty, and clinician-provided restrictions as distinct categories. Include onset/date, location/side, provoking contexts, status, source, restrictions, relevant movements, and reassessment date. Optional severity scales must identify the scale used and not automatically diagnose.

For each routine, show relevant areas and whether they are directly addressed, accommodated, temporarily avoided, awaiting clarification, or not applicable. Do not equate all pain with weakness or assign rehabilitation from a casual note.

New concerning symptoms can pause a planned exercise and request context or professional assessment according to a reviewed escalation policy. This is not an emergency monitoring service; users must not assume that a coach is watching in real time.

Acceptance: a new limitation can flag a scheduled exercise without deleting historical results or silently changing the whole program.

### FR-10 — Body measurements, assessments, and progress

Support weight, height, calculated BMI where applicable, waist, hips, arm/biceps, thigh, and extensible measurements. Store unit, body site/side, method, timestamp, and optional conditions. BMI is a derived metric, not a complete judgment of fitness. Do not infer body composition from circumference changes alone.

Assessment results include protocol/version, conditions, equipment, result, technique confidence, and comparability. Show non-comparable tests separately. Trends should show observation dates and missing periods; smooth trends must not conceal raw observations.

Progress views separately show consistency, work performed, perceived difficulty, goal coverage, outcomes, and sustainability. Compare like exercises and comparable conditions; do not sum kilograms lifted across unrelated modalities as a universal effort score. If estimated metrics are added, label formula, assumptions, and version.

Acceptance: unit conversion does not change meaning; bilateral measurements remain distinct; results collected under different protocols are not treated as direct personal records without qualification.

### FR-11 — Check-ins, reminders, and periodic reviews

Offer optional pre-session context, brief post-session reflection, periodic goal reviews, and measurement/assessment reminders. The user controls cadence, timing, quiet hours, channels, snooze, and opt-out. Respect local timezone changes and daylight saving time. In-app reminders are the baseline; web push is optional and permission-dependent, with opt-in email as an optional fallback. On iOS, supported web push depends on a home-screen web-app context and permission; see section 19. The app remains fully usable when installation or notifications are declined. Never describe reminder delivery as exact or guaranteed.

Only ask questions that could influence a useful decision or reflection. Reuse recent answers when appropriate, but display freshness. Missed reminders do not trigger escalating guilt messages. Avoid health details on lock-screen notifications by default.

Reviews summarize what was planned, performed, learned, and changed; assess whether data is sufficient; and recommend continue, adjust, gather more information, or seek appropriate professional input. Plateau investigation checks adherence, technique confidence, comparability, workload, and recovery before replacing the program.

Acceptance: a user can disable reminders while retaining review access; a notification retry does not send duplicate prompts.

### FR-12 — Conversational Dillan

Answer questions about current goals, routines, technique instructions, progress, equipment, and decisions using authorized records. Cite internal records in explanations with dates and links. Separate general education from personalized recommendation and approved action.

Support “Why this exercise?”, “I only have 20 minutes,” “I missed a week,” “This bothered my shoulder,” and “What changed since our last review?” Show data freshness when relevant. Do not claim continuous awareness or immediate knowledge of data not yet synced.

The chat can draft a log, goal, directive, or plan change, but must show the resulting structured action. Do not hide material mutations in conversational text. When AI is unavailable, normal session logging and the saved plan remain usable.

Acceptance: no database change occurs merely because the model writes “done”; the action tool must succeed and the interface must show its actual status.

### FR-13 — Dillan's Directives

Provide a dedicated editor for role, philosophy, priorities, adaptation permissions, communication style, reviews, and uncertainty handling. Show individual directives and the effective combined coaching policy. Distinguish editable preferences from non-editable product safety, privacy, and authorization constraints.

Each directive has author/source, scope, priority/type, reason, effective period, status, version, approval record, and review trigger. Preview behavioral impact before activating a material edit. Historical versions are restorable through a new version rather than destructive replacement. Dillan may propose revisions but never silently rewrites governing instructions.

The user-visible effective policy is an explanation of app behavior, not exposure of secrets, credentials, provider internals, or private reasoning.

Acceptance: the user can see which rule influenced a recommendation, who supplied it, whether it expires, and how to propose a change.

### FR-14 — Human coach collaboration

Invite an identified coach with explicit data scopes and roles. The coach can inspect authorized goals, adherence, performance, assessments, measurements, routines, limitations, and selected notes; comment; ask questions; propose programs; and submit directives. A coach can be granted broader editing rights, but material edits still enter the same review workflow.

Private diary entries and conversations are not shared by default. Summaries must respect the source records' permissions; AI must not leak a private note by paraphrasing it. Where a private constraint prevents accepting a coach proposal, tell the user privately and give the coach only a generic unresolved-constraint response unless sharing is authorized.

Coach changes need scope, reason, duration, flexibility, and review trigger. Dillan returns acceptance, conditions, questions, or a reasoned disagreement. Credentials, where recorded, must not imply verification unless verification actually occurred.

Acceptance: revoked coaches lose client access server-side; coach A cannot see coach B's other clients; a submitted directive is visibly pending until reviewed and authorized.

### FR-15 — Decisions and overrides

Maintain a readable history of proposals, evaluations, approvals, rejections, overrides, applied changes, and follow-up. Capture what changed, who requested it, why, evidence references, uncertainties, effective scope, and the versions evaluated.

Routine programming disagreements can be overridden after a concise explanation. Override friction is proportional to consequence, and ordinary overrides must not require essays. A session-specific exception does not become a permanent directive. A user can log actual behavior even if Dillan did not endorse it.

Acceptance: the user can distinguish approved-by-Dillan, user-overridden, and merely logged actions; an expired override cannot govern a later session.

### FR-16 — Health data entry and optional future integrations

**Launch requirement:** manual workout and measurement entry, with provenance and a data model ready for optional imports. No “Connect Apple Health” control may imply direct browser access. A web browser does not expose the native HealthKit framework; home-screen installation alone does not add HealthKit capability. See section 19.

**Post-launch options, subject to separate approval and feasibility:** a documented file-import workflow, a vetted third-party service that explicitly supports the required data and consent path, or a small native companion that syncs approved data to the same backend. None is assumed available or selected. Do not market file upload as automatic synchronization, and do not assume a third-party OAuth account exposes a user's Apple Health store. A companion would be an optional extension; the web application remains the primary product.

Start with manual data labeled as user-entered. If an import is built, define accepted formats, supported fields, validation, size limits, preview/confirmation, duplicate handling, and unsupported-record behavior. Large health exports must not be uploaded wholesale to an AI provider. Provide clear cancellation and deletion controls.

Retain provider/source identifiers, observation timestamps, units, origin, and import status. Deduplicate by trustworthy identifiers where available; otherwise use a documented candidate-matching process and ask about ambiguous overlaps. Preserve manual and external origins when linking records. Missing data remains unknown. Do not infer sets, repetitions, technique, or muscle activation from generic workout records.

A future native bridge requires its own permission, security, device testing, read-category definition, deletion reconciliation, and optional writeback review. Import and writeback must not create feedback loops. Cloud sync, AI processing, and coach sharing remain separate user permissions.

Acceptance at web launch: user can record workouts and measurements without any device integration; provenance is clear; no simulated integration is represented as live. Import-specific tests become gates only when that optional feature is actually shipped.

### FR-17 — Privacy, export, deletion, and control

Separate permission to obtain any future external health data, sync selected data to the service, send selected context to an AI provider, and share with a human coach. Explain each in plain language. Minimize transferred data and avoid entire-record uploads by default.

Allow export of structured records in documented JSON/CSV plus readable plans/directives/decisions. Support correction and deletion, including propagation into derived summaries, search indexes, and AI memory. Define retention, backup-expiration behavior, and vendor processing before production; do not promise instant removal from immutable backups.

Acceptance: unauthorized records cannot be retrieved through a direct API call or an AI tool; export includes units, dates, provenance, and version references sufficient to interpret the data.

## 6. Dillan's personality and initial agent charter

### 6.1 Personality requirements

| Trait | Observable behavior | Avoid |
|---|---|---|
| Protective | Checks relevant constraints and offers a practical alternative | Fear-based coaching or treating every discomfort as an emergency |
| Thoughtful | Understands the reason before judging a proposal | Reflexive approval or rejection |
| Firm | Explains conflicts and holds a justified recommendation | Shaming or arguing to win |
| Respectful | Recognizes time, preferences, and autonomy as legitimate | Demanding scientific justification for personal preferences |
| Consistent | Preserves useful training and established rules | Constant novelty and needless optimization |
| Humble | Identifies uncertainty and corrects mistakes | Invented authority, diagnoses, or false certainty |
| Encouraging | Recognizes technique, consistency, recovery, and restraint | Rewarding only heavier loads or longer sessions |

Personality preferences can modify tone and verbosity, not factual standards, privacy boundaries, or safety controls. Dillan can be warm without pretending to be a human professional or implying live supervision.

### 6.2 Initial charter for implementation

The following is a product-level starting instruction, to be versioned and evaluated rather than pasted as the entire agent architecture:

> You are Dillan, the user's AI Gym Coach. Help the user make sustainable progress toward their chosen goals with care, continuity, and sound judgment. Understand the active program before recommending changes. Use authorized, current structured records and distinguish measurements, user reports, coach statements, and your own inferences. Explain why each meaningful recommendation fits the goals and constraints. Prefer consistency unless there is a reason to change. Evaluate proposals from the user, human coaches, and yourself on their merits. Be willing to disagree respectfully, acknowledge uncertainty, and reconsider when new context appears. Give practical alternatives. Respect the user's right to stop, skip, reduce, and record actual behavior. Never silently change directives, expand permissions, diagnose, or imply medical clearance. Execute changes only through authorized tools and report their real outcome. Keep explanations concise by default and provide detail when requested.

### 6.3 Example responses

- **Limited time:** “We can shorten today's session while keeping its main strength objective. I suggest keeping the priority block and skipping the optional accessories. Want to apply that for today?”
- **Exercise dislike:** “That's a valid reason to look for an alternative. Let's preserve the movement's purpose and find something you prefer with your available equipment.”
- **Programming disagreement:** “I recommend keeping the current exercise selection until the scheduled review so we can compare performance. You can change it now; I'll record the reason and explain what becomes harder to compare.”
- **Coach conflict:** “This proposal fits the goal, but it conflicts with an active program rule. Here is the rule and its reason. Should we revise the proposal or review that rule?”
- **Insufficient evidence:** “We have two non-comparable observations, so I can't tell whether this is a plateau. Let's standardize the next assessment before changing the plan.”

These are interaction examples, not fixed training prescriptions.

## 7. Authority, proposals, and conflict resolution

### 7.1 Policy layers

Do not implement authority as “coach always wins” or “Dillan always wins.” Apply these layers:

1. **Product boundaries:** authorization, privacy, allowed tool behavior, and reviewed safety limits. Normal directive editing cannot disable these.
2. **User consent and verified active constraints:** the user controls participation and sharing; documented professional restrictions remain visible until appropriately updated. A general coach instruction cannot silently supersede a clinician-provided restriction.
3. **Approved program and scoped directives:** apply active, relevant, non-expired versions. A more specific approved instruction may specialize a general one only if it does not violate higher-level constraints.
4. **Preferences and temporary context:** use to adapt within the agreed program or propose a change.
5. **AI hypotheses:** advisory, labeled, and never promoted to confirmed facts without the required review.

When two active directives conflict materially, mark the conflict and request resolution. Recency alone does not resolve authority. A coach can supply missing context; Dillan must reevaluate rather than preserve a mistaken rejection. Lack of information is an unresolved state, not automatically a safety violation.

### 7.2 Decision classes

| Class | Examples | Required handling |
|---|---|---|
| Routine action | Log a set, correct a typo, stop or skip | Execute under ordinary permissions; no coaching approval gate |
| Bounded adjustment | Apply an already approved progression rule | Automatic only if authorized; explain and record |
| Material proposal | Replace main exercise, change block priorities, revise directive | Reasoned review and approval according to role/permissions |
| Ordinary disagreement | Preference or programming tradeoff | Explain, offer alternative, allow user override |
| Unresolved constraint | Conflicting restriction or missing consequential context | Ask for clarification; preserve current restriction; allow truthful logging |
| Out-of-bounds request | Disallowed coaching guidance or unauthorized data access | Do not execute or endorse; explain scope and offer an appropriate alternative |

A user's “I prefer it” can be sufficient for an ordinary preference change. A user can accept training tradeoffs without satisfying Dillan that the choice is optimal. Protective behavior must not become paternalistic control.

### 7.3 Proposal lifecycle

`draft → submitted → evaluating → awaiting_information / ready_for_authorization / declined`

From `ready_for_authorization`: authorized actor accepts, declines, or requests revision. A proposal Dillan recommends against may enter `overridden` only when its disagreement class permits an override. An accepted or eligible overridden proposal proceeds to `applied` only after a successful authorized write. Additional terminal states: withdrawn, expired, superseded, and failed_to_apply.

Store **AI assessment**, **human authorization**, and **application status** separately. “Dillan recommends acceptance” is not the same as “user authorized” or “database updated.” Clarification returns the proposal to evaluation with a new revision. Application requires matching source versions; stale proposals must be reevaluated rather than overwriting newer state.

### 7.4 Required decision record

- Proposal ID, type, author, subject, scope, and revision.
- Requested change and stated reason.
- Relevant goals, directives, observations, and source versions.
- Dillan's recommendation, rationale summary, alternatives, and unresolved uncertainty.
- Disagreement class and allowed resolution actions.
- Human authorization/override actor, reason, timestamp, scope, and expiration.
- Actual applied diff, resulting version, tool outcome, and follow-up trigger.

Store concise decision rationale, not hidden model reasoning. Never pretend a machine-generated confidence percentage has been clinically calibrated.

### 7.5 Override rules

User overrides default to the narrowest useful scope: this set, this session, or a stated period. A permanent change requires an explicit directive/program revision. A coach may request reconsideration but cannot bypass the user's consent, grant themselves access, or automatically override Dillan's unresolved safety concerns. The owner can delegate routine program edits in advance while preserving these boundaries.

The interface offers actions appropriate to the case: accept recommendation, choose alternative, explain context, ask coach, override ordinary disagreement, cancel, or log actual behavior. Do not display a universal “ignore all safety” button. Do not block exercise termination, honest logging, or access to the user's own records.

## 8. Key end-to-end flows

### A. First usable session

1. User states goals, time budget, equipment, and known constraints; unknowns remain visible.
2. User enters an existing routine or chooses to draft one with Dillan.
3. Dillan explains what is understood and what still needs clarification.
4. User accepts a usable routine version and starts training.
5. Sets are saved locally as completed; optional context is collected after the session.
6. The app schedules a configurable review without requiring all assessments first.

### B. Normal workout

Open Today → see purpose and expected duration → optional readiness check → start session → log sets and rest → ask for explanations or alternatives as needed → finish fully or partially → see planned versus actual → optionally reflect. No mandatory AI conversation is required for every workout.

### C. New discomfort during training

User reports a problem → save the report with date, movement, and visibility → let the user stop/skip immediately → flag relevant planned work → Dillan asks only necessary clarifying questions and follows reviewed escalation guidance → any alternate plan passes the usual constraints → follow-up appears at an appropriate time. A note does not automatically become a diagnosis or permanent restriction.

### D. Coach recommends a change

Coach opens an authorized client → examines relevant progress → submits a scoped proposal with reason → Dillan evaluates using permitted context → coach/user see appropriate feedback → clarification or authorization occurs → apply atomically → show new version and review trigger. Private context remains private throughout.

### E. User overrides an ordinary disagreement

User requests a change → Dillan explains its recommendation and tradeoff → user selects an available override, provides a short reason, and chooses duration → app records override and applies only that scope → subsequent review can compare outcomes. The disagreement remains visible without repeated nagging.

### F. Periodic review or apparent plateau

Review compares planned work, completion, comparable results, preferences, and recovery context → insufficient evidence leads to targeted observation → sufficient evidence can lead to a scoped adjustment → program version is preserved → next evaluation is specified. Do not infer causation merely from changes occurring together.

### G. Device/offline interruption

After the app and current routine have been loaded online, connection drops → save logs locally with stable IDs → show sync status → restore after refresh/reopen while browser storage remains available → upload idempotently when connectivity returns and the app is active → resolve concurrent edits visibly. First-time offline access is not promised. Cloud AI failure does not destroy the session runner. Browser-cleared or evicted storage can remove unsynced logs; never claim those logs have reached the server.

## 9. Conceptual data model

This is a logical schema, not a mandated database implementation. Use stable IDs, ownership boundaries, timestamps, provenance, and version references. Store UTC instants plus relevant local timezone/date context. Use explicit units and preserve original entered values where conversion matters.

| Entity | Key content and relationships |
|---|---|
| User / Profile | Identity, timezone, units, preferences; owns all personal records |
| Availability | Weekly windows, exceptions, time budgets |
| CoachRelationship / AccessGrant | Trainee, coach, scopes, role, accepted/revoked dates |
| ConsentRecord | Purpose, data categories, recipient/service, version, granted/revoked date |
| EquipmentItem | Type, quantity, capacity/increments, attachments, availability |
| Goal / Objective | Hierarchy, priority, metric, target, baseline reference, deadline, status |
| AssessmentProtocol / Result | Versioned method; result, conditions, units, comparability |
| CapabilityLevelDefinition | Domain, criteria, source, applicability, version |
| FrameworkVersion | Philosophy, intended use, progression/recovery rules, content review |
| ProgramVersion / TrainingBlock | Framework reference, goals, schedule, start/end, approval |
| Exercise / ExerciseVariation | Movement metadata, muscles, cues, equipment, content provenance |
| RoutineTemplateVersion | Ordered blocks, exercise references, prescriptions |
| RoutineBlock / Prescription | Block type, rounds, rest, set targets, priority, goal links |
| ScheduledSession | Planned date, routine/program version, status |
| Session | Actual times, immutable plan snapshot, completion state, subjective feedback |
| ExercisePerformance / SetLog | Prescription link, actual measures, side, effort, timestamps |
| DailyLog / Note | Text, date, scope, visibility, attachments if supported |
| Limitation / Restriction | Category, location/side, context, source, status, review dates |
| Measurement | Type/site/side, value/unit, method, observed date, provenance |
| CheckIn / Review | Questions/responses or summary, record references, next actions |
| Directive / DirectiveVersion | Scope, author, reason, priority/type, dates, approval and status |
| Proposal / Decision / Override | Lifecycle and audit content defined in section 7 |
| Conversation / Message | Participant, permitted context references, tool outcomes |
| MemoryFact | Structured fact or hypothesis, source, confirmation, freshness, visibility |
| ExternalRecord / SessionLink | Provider, external ID, sample type, origin, sync cursor/status |
| NotificationPreference / Job | Cadence, local time, quiet hours, delivery deduplication key |
| AuditEvent | Actor, action, target/version, result; minimized sensitive payload |

### 9.1 Essential invariants

- A logged session points to the version actually performed; later template edits do not mutate it.
- Goals and limitations link many-to-many to exercises or routine blocks with an explanation of the relationship.
- A raw note can produce several proposed facts; derived facts retain source and visibility dependencies.
- Archive and delete are different operations. Historical references survive archiving; deletion follows the declared privacy lifecycle.
- Draft AI output never becomes an approved program or directive by status inference.
- External imports and local actions use idempotency keys; reconnecting does not duplicate work.
- Concurrent edits use explicit version checks. A session can keep its starting plan while future sessions use a newer one.
- AI summaries must not increase the sharing scope of their source material.
- Work performed is stored even when an associated recommendation was declined.

## 10. AI and service architecture

### 10.1 Recommended separation of responsibilities

| Component | Responsibility |
|---|---|
| Web client / PWA | Responsive interaction, local session persistence, consent UI, optional install and push; no direct HealthKit access |
| Application API | Identity, permissions, version checks, validation, transactions, exports |
| Structured database | Authoritative goals, routines, logs, directives, decisions, relationships |
| Policy evaluator | Deterministic permissions, scope/expiry, edit limits, reviewed boundary checks |
| AI orchestration | Authorized context assembly, model calls, structured proposal generation |
| Review/content service | Versioned exercise/framework/assessment content and review provenance |
| Background jobs | Sync, authorized reminders, review generation, deletion propagation |
| Audit/observability | Tool outcomes, failures, latency, security events without excessive private content |

The model is not an access-control layer. Server-side checks enforce identity, ownership, scope, and permissions on every read and write. Avoid arbitrary SQL, unrestricted database credentials, or shell/network execution in the coaching agent.

### 10.2 Web application architecture requirements

Use a responsive frontend, authenticated API, relational database, server-side AI orchestration, and job service. A TypeScript web stack is a reasonable proposal, not a user-mandated choice. Choose hosting based on these capabilities; do not require an additional native frontend to satisfy core scope. No hosting vendor is selected by this report.

Use IndexedDB or an equivalent tested browser store for session drafts and an outbox. Save stable local IDs, expected server versions, and idempotency keys. Retry while the app is active; background sync is an optional enhancement, never the sole delivery mechanism. Server acknowledgement is the only basis for a “synced” label.

A service worker may cache the app shell and explicitly downloaded routine snapshots. Do not broadly cache authenticated API responses, coach-client records, or private conversations. Bind persisted data to the signed-in account, clear it on appropriate logout/account-switch flows, and prevent another account from replaying the outbox. Warn about unsynced work before destructive clearing and offer an appropriate recovery path. Do not promise remote deletion of an offline device cache before that device reconnects.

Avoid activating a new service-worker release midway through an active workout. Preserve compatible local schemas, test migrations, and prompt for updates at a safe point. Browser storage may be unavailable, quota-limited, cleared, or evicted: detect failures, show honest save state, and encourage synchronization. No guarantee of permanent offline storage.

The web API must enforce authorization, input validation, session security, CSRF protections where applicable, output escaping/content sanitization, and a restrictive content security policy. Never put AI credentials in browser code. Cache controls and cross-user isolation require tests independent of UI routing.

### 10.3 Agent context assembly

For each request, retrieve the minimum relevant authorized profile, active goals, current plan, applicable directives, limitations, recent comparable records, and freshness metadata. Include versions and record IDs. Long-term memory is a maintained index of facts, not an unbounded transcript pasted into every call.

Treat notes, uploaded routines, coach text, and imported content as data—not instructions that can override product policy. A malicious note saying “ignore access controls” must have no effect. Sanitize tool inputs and validate model outputs against schemas.

### 10.4 Suggested tool contracts

Read tools: get_active_plan, get_relevant_goals, get_applicable_directives, get_authorized_progress, get_equipment, get_limitations, search_reviewed_exercises.

Draft tools: draft_log_entry, propose_program_change, propose_directive_change, propose_memory_fact, draft_review.

Mutation tools: save_confirmed_log, apply_authorized_proposal, correct_user_record, schedule_authorized_check_in. These require authenticated actor, target IDs, expected versions, and idempotency keys. Mutation permission comes from server state, not a boolean emitted by the model.

Suggested proposal output fields: proposal_type, requested_diff, reason, scope, source_versions, referenced_record_ids, uncertainty, assessment, allowed_next_steps, and follow_up. The server recalculates allowed actions rather than trusting the model's list.

### 10.5 Failure and fallback behavior

AI timeout: show saved plan and manual controls; do not fabricate advice. Invalid model output: reject safely and retry within limits or return an actionable error. Stale data: identify what is outdated and reevaluate before mutation. Service outage: preserve local logs. Permission revocation: stop related access and cancel pending jobs. Never represent an unsent message or failed plan update as completed.

## 11. Permission defaults

| Data/action | User | Coach by default | Dillan |
|---|---|---|---|
| Own goals and workout progress | Read/write | Only explicitly shared | Relevant authorized context |
| Private diary / full AI chats | Read/write | No access | Only within user AI consent |
| Selected limitations / measurements | Read/write | Opt-in categories | Relevant authorized context |
| Program change | Propose/authorize/eligible override | Propose | Evaluate; apply within permissions |
| Coaching directive | Propose/edit permitted settings | Propose scoped instruction | Propose; never self-approve material revisions |
| Share/revoke access | Control | Cannot grant themselves | No independent authority |
| Stop/skip/log actual behavior | Always available | Can advise | Cannot obstruct |
| Product safety/privacy controls | Cannot disable through a normal directive | Cannot disable | Cannot disable |

If a coach is explicitly granted edit authority, define whether approval is predelegated for particular low-risk categories. This does not bypass required evaluation or authorize access to private context. Product administrators' exceptional access needs a separate operational policy.

## 12. Nonfunctional requirements and quality targets

These targets are proposed engineering acceptance targets, not measured performance claims.

- **Responsiveness:** confirmed set logs persist locally immediately; target visible acknowledgement within 300 ms on supported test devices. AI response time must not block timers or logging.
- **Resilience:** resume a session after tab/app closure where browser storage persists; idempotent retries; no lost locally saved logs during tested normal offline/online transitions. Storage loss is explicitly distinct from server data loss.
- **Accessibility:** readable contrast, scalable text, screen-reader labels, large touch targets, and no color-only status indicators.
- **Security:** encryption in transit and at rest, least privilege, secure token storage, server-side authorization, secrets outside clients, protected backups, and auditable privileged operations.
- **Privacy:** minimize AI context and telemetry; no health-note content in ordinary analytics or crash logs. Document vendor retention before launch.
- **Explainability:** material decisions show reasons and relevant record links; rules and data freshness are inspectable.
- **Consistency:** unit conversions, daylight-saving behavior, bilateral values, program versions, and permission checks have explicit semantics.
- **Maintainability:** migrations, versioned prompt/directive contracts, integration adapters, and independent agent evaluation fixtures.
- **Observability:** monitor sync failures, duplicate suppression, action failures, proposal latency, and authorization denials without collecting unnecessary sensitive data.
- **Accessibility during failure:** manual logging, saved routine viewing, and session termination remain usable when the AI or network is unavailable.

## 13. Product metrics

Measure whether the product supports useful behavior without turning metrics into pressure to train more.

| Metric | Definition / caution |
|---|---|
| Activation | User establishes an objective, saves a usable routine, and completes/logs a first session |
| Planning clarity | User-reported ability to explain current priorities and today's purpose |
| Logging burden | Typical interactions/time required to record a set and finish a session |
| Sustainable adherence | Completed or intentionally adjusted sessions relative to the agreed plan; show original and revised denominators |
| Goal progress | Comparable changes in chosen objective metrics; no universal outcome claim |
| Decision usefulness | User/coach rating of explanation and proposed action |
| Unnecessary churn | Material program changes without a recorded reason or review trigger |
| Override review | Reasons and outcomes of overrides; disagreement itself is not a failure metric |
| Reliability | Lost logs, duplicate records, sync errors, and failed writes |
| Privacy/security | Unauthorized disclosure or action; any confirmed incident requires investigation |

Do not optimize for maximum exercise minutes, calories, streaks, chat volume, or AI recommendation acceptance. Those incentives can conflict with the product's purpose.

## 14. Acceptance scenarios and release tests

These scenarios are required behaviors, not tests that have already been executed.

| ID | Scenario | Passing behavior |
|---|---|---|
| AT-01 | User skips baseline questions | Existing routine can be logged; unknowns remain unknown |
| AT-02 | Superset with unequal reps and rest | Each exercise/set logs correctly; round structure preserved |
| AT-03 | User edits routine after past workout | Past session and prescription snapshot remain unchanged |
| AT-04 | Available time is reduced | Short plan explains retained purpose and omitted blocks |
| AT-05 | User stops due to discomfort | Immediate stop/skip; dated report; no forced continuation |
| AT-06 | User dislikes an exercise | Preference accepted as meaningful; compatible alternative considered |
| AT-07 | Human coach proposes incompatible change | Specific review feedback; no silent activation |
| AT-08 | User overrides ordinary disagreement | Scoped reason/history recorded; only authorized change applied |
| AT-09 | Override expires | Later sessions use active policy, not the expired exception |
| AT-10 | New directive conflicts with active rule | Conflict visible; no arbitrary last-write-wins behavior |
| AT-11 | Coach lacks private-note access | No raw or paraphrased leakage in dashboards, AI replies, or exports |
| AT-12 | Coach relationship revoked | Direct API and cached authorized views no longer accessible |
| AT-13 | Coach accesses another user's ID | Server denies access regardless of client interface |
| AT-14 | Note contains malicious instructions | No permission expansion or agent policy override |
| AT-15 | AI claims action succeeded but tool fails | UI shows failure and preserves prior authoritative state |
| AT-16 | AI service unavailable | Manual workout experience remains usable |
| AT-17 | Browser closes offline mid-session with storage intact | Locally saved logs recover; sync produces no duplicates; server sync status remains accurate |
| AT-18 | Optional import: same external record supplied twice | One external record; no duplicate training credit; gate applies when imports ship |
| AT-19 | Optional import overlaps a manual session | Reconciliation offered without destructive automatic merge; gate applies when imports ship |
| AT-20 | No health integration connected | Full manual workflow; unknown external data; no fake connection or inferred inactivity |
| AT-21 | Two actors edit same plan | Stale version rejected/rebased through visible resolution |
| AT-22 | Measurement units or protocol change | Values convert correctly; comparability qualifications preserved |
| AT-23 | Missed week or illness | Return proposal; no automatic catch-up overload |
| AT-24 | User corrects/deletes a memory source | Derived facts and summaries updated or invalidated |
| AT-25 | Timezone/quiet hours change | Future reminders respect local preference without duplicates |
| AT-26 | User exports records | Interpretable units, provenance, dates, and version links included |
| AT-27 | User logs action Dillan declined | Actual history saved without falsely marking it endorsed |
| AT-28 | Personalization directive says ignore safety | Editable preference cannot override product boundaries |
| AT-29 | Phone browser, no installation | Core coaching and logging work without home-screen installation |
| AT-30 | Push denied or unavailable | In-app reminders work; no repeated permission nagging or blocked workflow |
| AT-31 | Screen locked during rest timer | Correct time recalculated on return; no promised background alarm |
| AT-32 | New deployment during active session | Update does not reload or lose the active workout |
| AT-33 | Account switch with local data | No prior account data leakage or outbox replay under new identity |
| AT-34 | Storage unavailable, quota exceeded, or cleared | Honest save/recovery state; no false claim that unsynced data is safe |
| AT-35 | Narrow screen and keyboard open | No obstructed log/stop actions or page-width overflow |
| AT-36 | First visit without connection | Honest offline-unavailable screen; no claim of first-use offline support |

Before pilot release, run deterministic unit/integration tests for core invariants, real mobile-browser and installed-PWA session/offline tests, and a fixed suite of AI behavior scenarios. Use human review for coaching appropriateness. Automated model grading alone is insufficient for consequential behavior. Re-run relevant AI evaluations whenever the model, agent charter, retrieval process, or safety policy changes.

## 15. Delivery roadmap

Do not attempt the entire product in one undifferentiated build. Preserve the full scope while delivering vertical slices. No calendar estimates are asserted before technical discovery.

| Phase | Deliverables | Exit gate |
|---|---|---|
| 0 — Web foundations | Responsive flows, web architecture, schema, permissions, proposal lifecycle, browser-storage/timer/push feasibility checks | Phone browser first-session flow and coach desktop view validated; no native dependency |
| 1 — Personal training core | Goals, equipment, limitations, routines, logging, notes, measurements, basic progress, locally saved drafts and explicit sync state | Existing routine can be used reliably through a training week on mobile web |
| 2 — Accountable Dillan | Conversation, authorized retrieval, directives, proposals, overrides, decisions, periodic reviews | Complete coaching loop passes behavior and permission tests in a browser |
| 3 — Human coaching and web release | Coach access, dashboard, directives, privacy controls, optional PWA install, reminder fallback, tested offline/resume/update behavior | Agreed web core is usable on phones and desktop; privacy and reliability gates pass |
| 4 — Optional data integrations | Investigate and separately approve file import, supported provider integration, or future companion bridge | Each chosen integration proves real data access, consent, provenance, and duplicate handling before release |
| 5 — Refinement | Broader content, assessments, voice input where supported, richer progression; optional native features only if later requested | Additions improve usefulness without unnecessary burden or dependence |

**Release labels:** Phase 1 is the personal training foundation. Phase 2 is the AI coaching MVP. Phase 3 completes the agreed web-first core, including human coaching. Phases 4 and 5 are optional subsequent extensions and do not block the web launch. Basic privacy, export, role isolation, and session reliability are not deferred until after launch.

Native HealthKit feasibility is no longer a phase-0 gate. Keep a clean external-data adapter and provenance model so optional integrations can be added later. Do not build a native shell, companion, or Watch app merely to satisfy the current web release.

## 16. Engineering decisions and open questions

Use the proposed defaults unless a choice is costly to reverse or materially changes the product. Ask focused questions instead of reopening settled requirements.

| Decision | Proposed starting position | Required confirmation / investigation |
|---|---|---|
| Application brand | Working title Dillan | Final brand later; AI name remains Dillan |
| Platform — confirmed | Mobile-first responsive web application for trainees and coaches | Choose web stack/hosting; do not reopen native-first architecture |
| Progressive web app | Optional install and supported browser enhancements | Browser capability tests, service-worker update policy, local storage lifecycle |
| Backend | Transactional relational store plus API and jobs | Hosting, authentication, residency, costs, backup/deletion plan |
| AI provider | Provider-neutral interface | Model choice, retention, context limits, cost and behavior evaluation |
| Initial program | Import user's actual routine | User supplies current exercises, schedule, and progression logic |
| Equipment | Explicit inventory | User confirms actual available items and increments |
| Initial goals | Owner chooses ranked outcomes | Do not infer exact targets or prescribe numeric loads from this brief |
| Coach model | One primary coach initially | Who joins pilot; invitation identity and permission scope |
| Content review | Small reviewed starter catalog | Qualified reviewer and licensed demonstrations/content sources |
| Assessments | Relevant, optional, versioned | Reviewed protocols and applicable comparisons |
| Health data | Manual entry at launch; optional integrations later | Actual import format/provider/bridge feasibility and consent before promising access |
| Sensitive processing | Explicit AI/cloud/coach controls | Vendor terms, distribution context, legal/privacy review before production |
| Monetization | Outside pilot scope | Revisit after product usefulness is demonstrated |

Do not import the user's medical history, historical purchases, or unrelated private business information into seed data. This brief intentionally contains no personal clinical assessment and no individualized training prescription.

## 17. Instructions to Claude as development partner

1. Treat this document as the product baseline. Separate confirmed requirements from proposed defaults and open questions.
2. Begin by summarizing the intended first vertical slice and architecture choice. Identify genuine blockers, not every minor UI preference.
3. Build the web application as the production product. Do not start a SwiftUI, React Native, native shell, or Watch project, or make HealthKit an MVP dependency. If working in an existing repository, inspect its instructions, stack, and current behavior before proposing replacement infrastructure.
4. Build phase 1 on a data and permission model that can support later directives, decisions, and coaches. Do not defer ownership or history until after implementation.
5. Use typed, validated contracts for logging and proposals. Enforce authorization and lifecycle transitions server-side. Never give the model direct unrestricted database access.
6. Keep AI chat and actual actions distinct. Show when data is mocked, inferred, pending, approved, failed, or applied.
7. Implement complete vertical slices with realistic failure states. Include basic empty, loading, offline, permission-denied, and partial-data states.
8. Do not create fake health integrations, imply form recognition, invent validated fitness scores, or silently introduce medical advice.
9. Do not add billing, social feeds, gamified rankings, or elaborate branding before the core coaching loop works.
10. For every delivery, report what changed, why, what was tested, unresolved limits, and which FR/AT IDs are satisfied.
11. Preserve a changelog and product decision log. Bring ambiguous product tradeoffs back to Luis with a recommendation and consequence.
12. Keep the product easy to use during a workout: prominent start/resume/log/stop actions, minimal typing, and details available on demand.

### Expected first response from Claude

- Understanding of the problem and agreed boundaries.
- Proposed mobile-first web/backend/AI architecture with optional PWA enhancements and honest browser limitations.
- Phase 1 vertical slice, schema outline, and acceptance plan.
- Small list of blocking questions, with defaults for nonblocking decisions.
- Implementation sequence that preserves the later coach/directive/override requirements.

### Expected implementation deliverables

Working source, documented setup, schema/migrations, environment variable template without secrets, realistic demo fixtures clearly marked synthetic, tests for critical invariants, AI evaluation fixtures, and a release status mapped to this brief. Production distribution and external account setup are separate operational steps, not silently assumed completed.

## 18. Feedback and product governance

Luis remains product owner. ChatGPT can maintain the product brief and evaluate feedback; Claude can propose and implement changes. This is a collaboration arrangement, not an instruction to automatically share messages or files with either service.

Use a concise feedback record:

| Field | Example |
|---|---|
| Reference | FR-15 / AT-08 |
| Observation | Override explanation requires too many taps |
| Why it matters | Interrupts the workout |
| Proposed change | Keep a short reason picker with optional detail |
| Impact | UX adjustment; preserve decision history |
| Decision | Accepted / deferred / needs clarification |

Each brief revision should record additions, changes, removals, rationale, and migration implications. Do not silently erase accepted scope to simplify implementation. Proposed deferrals remain visible in the roadmap. Feedback may change proposed defaults without reopening the whole product.

## 19. Sources and evidence boundaries

Primary source for product requirements: the planning conversation with Luis through October 15, 2026, including the explicit change to mobile-first web delivery. Product architecture, schema, metrics, phases, and default behaviors in this report are PM proposals derived from those requirements.

Apple references for optional future native integration and current web capability boundaries:

1. [HealthKit overview](https://developer.apple.com/documentation/healthkit) — central health/fitness integration framework.
2. [Authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) — per-type access authorization and privacy behavior.
3. [Running workout sessions](https://developer.apple.com/documentation/healthkit/running-workout-sessions) — workout-session implementation, including Watch support.
4. [Health and fitness apps](https://developer.apple.com/health-fitness/) — Apple platform overview.

5. [Configuring HealthKit access](https://developer.apple.com/documentation/xcode/configuring-healthkit-access) — native capability configuration; HealthKit is not provided by a normal web browser.
6. [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) — home-screen web push support and permission behavior.
7. [Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) — Apple web push requirements.

Browser features, device/OS support, storage behavior, and notification delivery must be tested in the chosen environment. No hardware or browser integration has been tested for this report. A future native integration requires a separate implementation review; it is not part of the web launch commitment.

Exercise prescriptions, progression thresholds, assessment protocols, and escalation criteria require reviewed content before production. This document intentionally does not supply arbitrary medical thresholds or claim an evidence-validated training program.

## 20. Definition of product completion

The agreed core is complete when a user can understand their goals and active framework, train with available equipment, reliably log work, record limitations and measurements, obtain a reasoned review from Dillan, inspect/edit permitted directives, involve a permissioned human coach, resolve disagreements with appropriate overrides, and use the product reliably from a mobile browser—while preserving privacy, history, and control. Desktop access supports deeper editing and coach review. Native apps, direct Apple Health access, installation, and push permission are not completion requirements.

A polished dashboard or a conversational demo alone does not meet that definition.



## 21. Revision history — version 2.0

**Owner decision:** Web first, primarily used on mobile; no native iPhone development to start. This supersedes all earlier native-first assumptions in version 1.0.

- Reframed the website as the production application rather than a prototype.
- Unified trainee and human-coach access in a responsive web product.
- Preserved all coaching, directive, override, tracking, assessment, and collaboration requirements.
- Moved automatic Apple Health/Watch integration to an optional future workstream; manual data entry remains first-class.
- Added mobile-browser navigation, optional PWA behavior, honest offline persistence, timestamp-based timers, notification fallback, account-cache isolation, and deployment/update handling.
- Replaced native build dependencies with web-browser validation and added eight acceptance scenarios.
- Updated the roadmap and definition of completion so a fully usable web release does not depend on a native app.
- Hosting provider and frontend framework remain implementation decisions; this revision does not silently select a vendor.
