# Scoped visual-journal profiles

The local profile `profiles/dimit-visual-journal.json` records an approved
preference for a life journal: briefly show the creator's own environment,
nature, and daily details even when unrelated to narration. Preserve place/time,
personality, natural sound, and breathing room. Music is off without a supplied
track authorized for the edit. Continue with voice, B-roll, and natural ambience;
do not wait for a song. Gentle lo-fi remains optional with a supplied, authorized
track and should sit lower under speech.

This is editorial guidance, not footage evidence, permission to use assets,
authority for external actions, or a rendering feature. The current user brief
takes precedence. Store the selected ID and applied preferences with edit notes;
do not add profile fields to the strict cut-only plan schema.

## Selection contract

`profiles/workflow.json` explicitly selects the profile for `task: edit`,
`intent: vlog-journal`, and formats `story` or `montage` in this checkout only.
The caller supplies the repository root. There is no home-directory, global,
parent-directory, environment-variable, or user-name inference. A repository
without this config has no automatic profile, even if its goal mentions Dimit
or vlogs. An empty `profileDefaults` array disables automatic selection.

The default detector recognizes English vlog, journal, video-diary and
day-in-the-life phrases, with conservative negation guards. Generic story edits,
tutorials, interviews, package/evaluate tasks, and copy-only/no-edit goals do not
select the profile. Bare journal mentions can be ambiguous; supply the actual
editing goal and correct task/format. Explicit `task: package` is the reliable
copy-only boundary. Keyword routing is not semantic understanding, and ambiguous
or unsupported wording may need an explicit ID or `none`.

Selection precedence:

1. `profile: "none"` disables the profile and does not read config or profile files.
2. An explicit ID loads `profiles/<id>.json` from the chosen root, overriding repo
   defaults and keyword/negation detection. It expresses a deliberate style
   selection for an eligible story/montage edit. It still fails for non-edit,
   tutorial/interview, tutorial-goal, or copy-only/no-edit contexts.
3. Otherwise, validate the local config and select a matching rule only for an
   affirmative vlog/journal edit goal. Negations such as "not a vlog", "without
   visual-journal style", and "no style profile" suppress automatic selection.
4. Without a matching local rule, return no profile and explain why.

Explicit options override unused invalid defaults. Invalid JSON/schema, unknown
preference IDs, duplicate/overlapping rules, missing selected profiles, and
filename/ID mismatches fail with errors rather than silently falling back.
Profiles use strict versioned JSON with a fixed vocabulary of editorial
preferences. They cannot embed executable instructions, arbitrary paths or
authorization fields. Files are limited to 64 KiB; resolved symlinks must remain
inside the selected repository. `sourceNote` is attribution, not authenticated
approval or executable guidance. Config/profile files contain no user absolute
paths or secrets and can move with the checkout.

## APIs and CLI

`playbook recommend` supports `--profile <id|none>` and `--repo <directory>`.
The implementation provides these modules for other agent integrations:

- Browser-safe `packages/editing-playbook/src/style-profile.ts`, exported from
  the package root.
  It provides schemas/types, `selectStyleProfile`, `isVlogJournalEdit`,
  `styleProfileScopeIssue`, `styleProfileInstructions`, `profileForRecommendation`,
  `stylePreferenceIds`, and `workflowConfigPath`.
- Node-only `packages/editing-playbook/src/style-profile-reader.ts`, exported as
  `@diffusionstudio/editing-playbook/profiles`, not through the browser-safe root.
  It provides `readWorkflowConfig(repositoryRoot)`,
  `readStyleProfile(id, repositoryRoot)`, and `recommendWithProfile(input)`.
- `apps/cli/src/playbook.ts` uses `recommendWithProfile` as below and retains
  task/format validation. The default root is this CLI build's checkout, as with
  `playbook skill`, rather than cwd.

```ts
print(await recommendWithProfile({
  repositoryRoot: options.repo ? resolve(options.repo) : resolve(__dirname, "../../.."),
  format: options.format as Format,
  goal: options.goal,
  task: options.task as RecommendationTask,
  hasReference: options.reference,
  profile: options.profile,
}));
```

The JSON result retains catalog skills, relationships, and `providerRequired:
false`. It adds `repositoryRoot`, `profileSelection` (`id`, `source`, `reason`,
`configPath`), and `styleProfile` (validated profile data, repository-relative
`path`, and full generated `instructions`), or `styleProfile: null`. Agents can
read the inline profile without native skill discovery; continue reading the
selected skills with their `readArgs` and the same `--repo` override. A selected
profile adds vlog story, scene building, audio continuity, and sound polish,
including their existing transitive prerequisites and review relationships.
Sound polish is consideration of natural sound/balance, not mandatory processing.

Existing pure callers can continue `recommend(format, goal, hasReference, task)`
without filesystem access or automatic personal preferences. They may pass a
validated profile as a fifth argument to attach the same instructions and skill
routing. Direct attachment is an explicit style selection and checks the same
task/format/copy scope; use `selectStyleProfile` first when implementing automatic
defaults. Never infer that loading a profile has edited or reviewed any media.

Representative calls:

```sh
dapi playbook recommend --format story --task edit --goal "Edit my daily vlog"
dapi playbook recommend --format story --goal "Assemble this footage" --profile dimit-visual-journal
dapi playbook recommend --format story --goal "Edit my vlog" --profile none
dapi playbook recommend --task package --goal "Write a title for my vlog"
```

Profiles themselves do not render. For silent B-roll over continuous original
sound, use the separate [layered workflow](layered.md). It has no music/ducking in
V1. Keep actual audiovisual review separate from profile and routing validation.

## Local verification

```sh
node --test packages/editing-playbook/test/style-profile.test.ts
npm run check --workspace=@diffusionstudio/editing-playbook
npm run test --workspace=@diffusionstudio/editing-playbook
```

The isolated tests exercise real repo selection, relocated roots, explicit
overrides/disable, negations, tutorial/copy boundaries, inline instructions,
strict validation and path containment. They do not call a provider, acquire a
music track, render footage, or claim perceptual approval.
