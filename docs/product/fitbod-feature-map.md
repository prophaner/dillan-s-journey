# Fitbod feature map

Source: "Fitbod iOS App - Feature Report" (owner's doc, 2026-10-15), a screenshot-based read of Fitbod 8.36 covering its four tabs, My Plan settings, calibration and adaptation, body and targets views, log, settings, integrations and growth loops. About two thirds of it is already shipped or planned in Dillan under a different mechanism (a program the user owns, not a daily generator); the rest is nine gaps worth adopting and fifteen items that conflict with the brief or the design non-negotiables.

Status key: Shipped = in docs/CHANGELOG.md; Planned = design README build order step or roadmap.md; Gap = fits the brief, no slice yet; Out of scope = conflicts with brief or design README. "§" cites docs/brief-v2.md.

## Feature map

| Fitbod feature | What it does (one line) | Dillan status | Where it lands | Data needed |
|---|---|---|---|---|
| Generated daily workout as home | One fresh session per day from the plan | Planned: step 5 (S01) | S01 Today, FR-06, Phase 1; Dillan shows the scheduled routine, not a regeneration | scheduled_sessions, sessions |
| Session duration chip | Shorten today only without touching the plan | Planned: step 5 (S01/S02) | Time control Full / Short / Priority only, FR-06 | sessions.time_choice (exists) |
| Session location chip | Swap equipment profile for today only | Gap | Profile (spec only) + S01, FR-04, Phase 1 | equipment_items.location (new) |
| Switch Workout sheet | Pick another split day out of sequence | Planned: step 5 (S01) | Course strip + missed-session handling, FR-06 | scheduled_sessions |
| Pick muscle groups (ad-hoc) | Generate a one-off targeted session | Planned: step 11 (S09) | Dillan proposal "build a session for X", FR-07, FR-12, Phase 2 | sessions with plan_snapshot |
| Create workout from scratch / saved workouts | Hand-built reusable workout | Planned: step 9 (D02) | Routine editor, FR-05 | routine_template_versions, routine_blocks |
| Exercise row with muscle-map thumbnail | Shows target muscle per exercise | Planned: step 9 (Exercise detail) | Intended emphasis, FR-05; media style is design open question 5 | exercises.muscles (exists) |
| Focus Exercise badge | One progressive-overload lift per day | Planned: step 5 (S01) | Priority blocks + "Why this is here", FR-02, FR-06 | routine_blocks.priority (exists) |
| Est. 1RM cards for focus lifts | Trend of estimated max per lift | Gap | S08 objective detail, FR-10, Phase 1 step 8 | derived from set_logs; formula version shown, not stored |
| Superset / Build superset | Grouped rounds with bracket | Shipped | S06, FR-05 | routine_blocks.block_type, rounds |
| Per-exercise replace (swap) | Swap an exercise | Shipped (this session only) | S04; "Use from now on" proposal on roadmap, FR-15 | set_logs.prescription_ref |
| Per-exercise "don't recommend" / Manage Exercises | Exclude or favorite exercises | Gap | Profile + swap alternatives slice, FR-01, FR-08, Phase 1 | exercise_preferences (new table) |
| + Add Exercise library search | Search by muscle, equipment, keyword | Planned: step 9 (Plan menu) | Exercise library, FR-05 | exercises |
| Refresh workout | Regenerate with same constraints | Out of scope: consistency before novelty (§2.2) | A Phase 2 proposal at most | none |
| Share workout link | Deep link to a generated workout | Out of scope: no social sharing before the loop works (§17 item 9) | Coach sharing is FR-14 with scopes | none |
| Active workout: steppers, rest timer | Set-by-set logging, auto rest | Shipped | S04, S05, FR-07 | set_logs, sessions |
| Adjust remaining sets after a change | Later sets follow the edited one | Gap (small) | S04 prefill from last logged set, FR-07, Phase 1 polish | none |
| Warm-Up Sets toggle | Prepend ramp sets to heavy lifts | Planned: step 9 (D02) | Warm-up blocks, FR-05; auto-prepend is a Phase 2 proposal | routine_blocks.block_type |
| Rest-timer sound | Audible cue at rest end | Planned: step 6 (S05) | Design open question 3: off by default, only while visible | none |
| Live heart rate in workout | Watch heart rate inline | Out of scope: no device integration at launch (FR-16, §2.3) | S23 states this | none |
| Tab lock during workout | Blocks navigation mid-session | Out of scope: Stop is one tap from everywhere (design README) | none | none |
| Goal picker (Build Muscle, etc.) | Preset goal list | Shipped (goals in user's words) | S12 step 2, FR-02 | goals.user_words |
| Injuries / Limitations | Excludes exercises loading a joint | Shipped (capture); Planned: roadmap swap filter | S12 step 5, S11, FR-09 | limitations, limitation_links |
| Equipment list (21 selected) | Filters library to owned gear | Shipped (onboarding); Planned: step 9 Profile edit | S12 step 4, FR-04 | equipment_items |
| Bodyweight-only toggle | Ignore equipment today | Gap (folds into locations) | FR-04 temporary availability | equipment_items.available (exists) |
| Workouts per week; specific days | Frequency and fixed weekdays | Shipped (days per week); Gap (specific days) | S12 step 3, Profile Availability, FR-01 | profiles.days_per_week (exists); profiles.training_days (new) |
| Duration setting | Default session length | Shipped | S12 step 3, FR-06 | profiles.session_minutes |
| Experience level | Beginner / Intermediate / Advanced | Gap | S12 or Profile, FR-01 | profiles.experience (new) |
| Training split with Recommended label | PPL, Upper/Lower, Full body | Planned: step 11 (S09) and S12 "Build one with Dillan" | Framework proposal, FR-03, Phase 2 | frameworks table (new, FR-03) |
| Exercise variability | Rotates exercises between sessions | Out of scope: consistency before novelty (§2.2); a directive at most (FR-13) | none | none |
| Circuits & Supersets toggle | Allows grouped rounds | Shipped (structural) | S06, FR-05 | routine_blocks |
| Timed intervals | Work/rest blocks instead of sets x reps | Planned: step 9 (D02) + S04 | FR-05, FR-07 duration field | set_logs.duration_seconds (new) |
| Units lb / kg | Display and plate math | Shipped (schema); Planned: Profile UI | FR-10, AT-22 | profiles.weight_unit, length_unit |
| Workout Insights (why this exercise) | Plain-language rationale per exercise | Planned: step 5 then step 14 | "Why this is here", FR-06, FR-12 | routine_template_versions.purpose, goal_links.relationship_note |
| Cardio / Stretching finishers | Appended cooldown blocks | Planned: step 9 (D02) | Optional cool-down blocks, FR-05 | routine_blocks.priority = optional |
| Start of week | Anchors week views | Gap (small) | S01 course strip, S08 Steady weeks | profiles.week_start (new) |
| Calibrate Strength assessment | 3 bodyweight tests seed loads | Planned: Phase 5 (brief §15) | FR-01, FR-10 assessments; skippable, no nag dot | assessments, assessment_results (new) |
| Starting weights from experience + bodyweight | Conservative first loads | Planned: step 11 (S09) | Phase 2 proposal with labeled uncertainty; §16 forbids prescribing loads from the brief | none |
| Adaptive load via e1RM, non-linear periodization | Next session adjusts load | Planned: steps 11-13 | Bounded adjustment under an approved progression rule (§7.2), FR-03, FR-15 | proposals, decisions tables (new, Phase 2) |
| Learned edits (stop recommending swapped exercises) | Repeated swaps retrain the engine | Planned: roadmap "Use from now on"; Gap for preferences | Dillan proposes an avoid, never self-applies (§7.3) | exercise_preferences (new) |
| Muscle recovery map | Per-muscle freshness drives selection | Out of scope: invented score, no activation measurement (§2.3, §17 item 8) | Self-reported fatigue in S03 check-in instead, FR-08 | none |
| Overall Strength score + percentile | Composite 0-100 vs other users | Out of scope: no validated or normative scores (FR-02, FR-10, §17 item 8) | none | none |
| Body composition + measurement stats | Weight and 14 manual metrics | Planned: step 8 (S08 Body + measurement entry) | FR-10; no composition inferred from girth | measurements (exists) |
| Apple Health sync prompt | Pull weight and workouts | Out of scope at launch; S23 (step 16) shows the honest state | FR-16, Phase 4 optional | measurements.provenance, record_source 'import' (exist) |
| Weekly Set Targets hexagon | Sets per push/pull/legs vs budget, history | Gap (modified) | S08 History "work performed by movement pattern", FR-10; no target ring | exercises.movement (exists), set_logs, plan_snapshot |
| Log header: workouts, milestones, weekly goal, streak | Counters and badges | Out of scope: no streaks, no badges (design README) | Steady weeks card is the replacement, S08 | none |
| Calendar strip | Week strip with logged markers | Planned: step 5 (S01 course strip), S08 History | FR-06, FR-11 | scheduled_sessions, sessions |
| Past workouts timeline | Reverse-chronological history | Shipped (last five on S16); Planned: S08 History | FR-07 | sessions |
| Add Past Workout | Backdated manual session | Gap | S16 sheet, FR-07, FR-16 launch requirement, Phase 1 | sessions.started_at user-set, source 'user' |
| Share cards / Strava / Year in review | Social exports and recap | Out of scope: §17 item 9, no gamification | none | none |
| Guest pass, gifting, apparel, subscription | Growth and billing | Out of scope: monetization outside pilot (§16) | none | none |
| Alternate app icon | Cosmetic | Out of scope: branding before the loop works (§17 item 9) | none | none |
| Health Profile (sex, DOB, height, weight) | Feeds normalization and calories | Planned: step 8 for height and weight; sex and DOB out of scope, no consumer without cited norms (FR-02) | measurements | none new |
| Export Workout Data (CSV) | Portability | Planned: step 15 (Privacy & data) | FR-17 JSON/CSV plus readable plans | none |
| Strava / Fitbit connect | External feeds | Out of scope: FR-16; only a vetted provider via Phase 4 approval | S23 | none |
| Notifications settings | Reminder cadence | Planned: step 16 (S22) | FR-11 | none |
| Ask our trainer (staff email) | Human help channel | Planned: step 15 (S15) | Own invited coach, FR-14; not staff | coach_access_grants |
| Permanently delete account | Account deletion | Planned: step 15 (Privacy & data) | FR-17; cascade exists | owner_id cascade (exists) |
| Apple Watch app, AirPods motion | Wrist logging, rep counting | Out of scope: no Watch, no rep detection (§2.3) | none | none |
| Info card per plan setting | Explains what each setting changes | Planned: step 9 (Profile/Plan) | FR-13 preview impact; design pattern, no data | none |
| Designed empty states | "Log 3 workouts to unlock" | Planned: step 10 | All states; unknown shows "—", never 0 | none |
| Floating collapsing tab bar, BETA tags, Recommended labels | Chrome patterns | Out of scope: fixed bottom nav and tokens in design package | none | none |

## Gaps worth adopting

1. **Log a past session.** S16 sheet: date, time, exercises, sets. Phase 1, right after the swap-alternatives slice. FR-07 (ad-hoc and backdated sessions) and the FR-16 launch requirement for manual entry with provenance. No schema change: sessions.started_at/ended_at user-set, source 'user', plan_snapshot null. Shows "Saved on this device" until acknowledged, labeled "Entered by you".
2. **Exercise preferences (avoid / prefer, with reason).** Phase 1, inside the swap-alternatives slice. FR-01 (exercise preferences), FR-08 (preferences as structured facts). New table exercise_preferences: owner_id, exercise_id, stance in ('avoid','prefer'), reason, source, version. Dillan may propose an avoid later; it never writes one (§7.3).
3. **Work performed per week by movement pattern.** S08 History, Phase 1 step 8: sets planned vs done per push / pull / hinge / squat / carry, gaps shown. FR-10 keeps work performed separate from consistency. Derived from set_logs and plan_snapshot via exercises.movement; no new tables. No percentage ring, no target unless the user sets a process goal (FR-02), no streaks (design README).
4. **Estimated 1RM on objective detail, labeled.** S08 objective detail, Phase 1 step 8. FR-10 allows estimated metrics with formula, assumptions and version labeled. Derived only, same exercise id and load_unit, tagged "Estimated · Epley v1"; never a record across protocols or a strength score (§17 item 8).
5. **Training locations and temporary availability.** Profile (spec only), step 9, plus an S01 note when today's gear is not at the active location. FR-04. Add equipment_items.location text (null = default) and profiles.preferences.active_location; reuse equipment_items.available.
6. **Experience, specific training days, start of week.** One more S12 question plus Profile fields, step 9. FR-01 asks for experience and weekly availability. Add profiles.experience text (check), training_days smallint[], week_start smallint. Experience never picks numeric loads (§16).
7. **Duration-type sets and timed intervals.** Routine editor (step 9) and S04. FR-05 (timed intervals), FR-07 (duration, hold time). Add set_logs.duration_seconds int; prescriptions jsonb gains a measure type. AT-31 timer rules apply.
8. **Optional baseline assessments.** Phase 5 (§15). FR-01: relevant, optional, skippable, no failing score. New tables assessments (protocol, version, instructions, equipment, review_status) and assessment_results (owner_id, assessment_id, result, unit, conditions, technique_confidence, comparable, observed_at, source). No percentile, no reminder dot.
9. **Next-set prefill after an edit.** S04 polish, Phase 1: a changed set becomes the prefill for the next one (FR-07 prefilled previous values). No data change.

## Explicitly not adopting

- Streaks, weekly goal counter, milestone badges, share cards, year in review: design README forbids streaks and guilt; §17 item 9 forbids gamified rankings and social feeds before the loop works.
- Overall Strength score and percentile: FR-02 and FR-10 forbid invented normative or universal scores; §17 item 8.
- Muscle recovery map and recovered-muscle push nudges: an invented physiological model (§2.3, §17 item 8); FR-11 forbids escalating reminders.
- Refresh / regenerate workout and exercise variability: consistency before novelty (§2.2); changes carry a reason and review trigger (FR-03).
- Tab lock during a workout: Stop and End are one tap from every training screen (design README).
- Calibrate Strength red-dot nag: no guilt copy; nothing requested before the first completed session.
- Starting loads from body weight: §16 says do not prescribe numeric loads from the brief; Phase 2 can propose with labeled uncertainty.
- Apple Health, Strava, Fitbit connect buttons, Watch app, AirPods rep counting: FR-16, §2.3; S23 shows honest "Not connected".
- Guest pass, gift subscriptions, paywall, apparel, review prompt, alternate icons: monetization and branding are outside the pilot (§16, §17 item 9).
- Sex and date of birth in a health profile: no consumer without a cited normative source (FR-02).

## Architecture notes

- **Data model.** New tables follow the phase-0 pattern: owner_id -> profiles(id) on delete cascade, source record_source default 'user', is_demo, archived_at, version with bump_version and the audit trigger, owner RLS plus coach_can_read(owner_id, scope). New: exercise_preferences; later assessments (owner_id null = reviewed library, as exercises) and assessment_results. New columns: profiles.experience, training_days, week_start; equipment_items.location; set_logs.duration_seconds. Estimated 1RM and weekly sets are computed, not stored; if cached later they carry formula_version. Past sessions reuse sessions and set_logs with user-set timestamps. Schema changes go through schema-guardian and the owner (CLAUDE.md rule 3).
- **Outbox.** Kinds keep the `<entity>:<verb>` and `update:<table>` shapes with expectedVersion (AGENTS.md). New: session:log_past (session plus its sets in one item, idempotency_key on both), preference:set, preference:clear, update:equipment_items, update:profiles, assessment:record (Phase 5). Duration sets extend the set:log payload.
- **Phase 2 AI.** Proposals, never direct writes: "avoid this exercise" after repeated swaps (material, FR-15); starting loads and progression (bounded adjustment only under an approved progression rule, else material, §7.2); volume or split changes (material, new routine version); "build a session for these muscles" (creates a scheduled_session on approval). Direct user writes stay routine actions (§7.2): past session, preferences, measurements, assessment results. Cards show Waiting / Applied / Didn't save; `applied` only after the authorized write succeeds (§7.3).

## Proposed roadmap insertions

Under `# Phase 1`, after the swap-alternatives line:

```
- [ ] Exercise preferences: avoid / prefer with reason; swap alternatives honor them (FR-01, FR-08)
- [ ] Log a past session from Train: date, time, exercises, sets; "Entered by you" (FR-07, FR-16)
- [ ] S12 asks experience; Profile: experience, specific training days, start of week (FR-01)
- [ ] Equipment locations and temporary availability; unavailable-gear note on Today (FR-04)
- [ ] S04: a changed set prefills the next set (FR-07)
- [ ] Duration-type sets and timed intervals in S04 and the routine editor (FR-05, FR-07)
- [ ] S08 History: sets done vs planned per movement pattern, per week; no target ring, no streaks (FR-10)
- [ ] S08 objective detail: estimated 1RM labeled with formula and version, same exercise and unit only (FR-10)
```

Under a new `# Phase 2` heading:

```
- [ ] Dillan proposes "avoid this exercise" after repeated swaps; proposal card, never self-applied (FR-15, §7.3)
- [ ] Starting loads and progression as proposals, or bounded adjustments under an approved rule (FR-03, §7.2)
- [ ] "Build a session for these muscles" as a proposal that schedules an ad-hoc session (FR-07, FR-12)
```

Under a new `# Phase 5` heading:

```
- [ ] Optional baseline assessments: reviewed protocols, versioned, skippable, no percentile or reminder dot (FR-01, FR-10)
```
