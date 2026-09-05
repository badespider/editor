# dapi CLI Reference

Reference for `dapi`, the Diffusion Studio CLI. Every canvas and project command talks to the running app over a local socket. Responses are JSON written to stdout; errors are human-readable messages on stderr with a non-zero exit.

Each feature command has its own file (linked below). The JSX code syntax consumed by [`mount`](./mount.md) and [`node insert`](./node/insert.md) is specified in [jsx/](./jsx/README.md); the markup is **pseudo-SVG**, mirroring SVG's shape-and-paint model with the editor's own tags and props rather than the SVG spec.

## Groups

**Top-level:** [`open`](./open.md), [`whoami`](./whoami.md), [`logs`](./logs.md), [`screenshot`](./screenshot.md), [`report`](./report.md), [`context`](./context.md) (alias `ctx`), [`mount`](./mount.md), [`models`](./models.md), [`voices`](./voices.md), [`fonts`](./fonts.md), [`fetch`](./fetch.md).

| Group | Alias | Scope |
| ----- | ----- | ----- |
| `selection` | `sel` | Read and mutate the current node selection. |
| `node` | `n`, `entity` | Anything that targets one or more nodes; scenes are nodes too. |
| `project` | `p` | Create, list, open, and delete projects. |
| `asset` | `a` | Manage and inspect assets in the open project. |
| `folder` | `fld` | Organize the asset library into folders. |
| `playbook` | | Local editing skills, plan checks, cut previews and reference candidates. |

How the surface is divided:

- Declarative composition happens through `mount`, which renders a Solid JSX project into the canvas (see [jsx/](./jsx/README.md)); `node insert` runs the same pipeline but inserts the rendered nodes into an existing parent entity instead of mounting document roots.
- Scenes are created declaratively via `mount` (the `scene` property on a root, e.g. `<rect scene="...">`); there is no imperative scene command.
- AI asset generation (image / video / speech / audio) is declared in the project module (`generate.*`, see [jsx/generate.md](./jsx/generate.md)) and produced on mount. `models` and `voices` list what those declarations can reference.
- Inspecting an existing asset (probe / transcribe / listen / filmstrip / waveform / grab) lives under `media`; writing an asset's original file back to disk is `asset export`.
- Organizing the library lives under `folder`; moving assets between folders is `asset mv`.

## Commands

### App

- [`dapi open`](./open.md): launch the app, or open a file, folder, or deep link
- [`dapi whoami`](./whoami.md): print the authenticated account
- [`dapi logs`](./logs.md): recent console output from the running app
- [`dapi screenshot`](./screenshot.md): capture the entire application window as a PNG
- [`dapi report`](./report.md): file a GitHub issue about a bug in the CLI or the app, with diagnostics attached

### Document

- [`dapi context`](./context.md): essential context about the open project
- [`dapi mount`](./mount.md): compile a Solid JSX project module and mount it into the canvas

### Selection

- [`dapi selection ls`](./selection/ls.md): list the selected nodes
- [`dapi selection set`](./selection/set.md): replace the selection
- [`dapi selection focus`](./selection/focus.md): frame the selection on the canvas

### Nodes

- [`dapi node ls`](./node/ls.md): raw entity records
- [`dapi node tree`](./node/tree.md): an entity's subtree as nested JSON
- [`dapi node grep`](./node/grep.md): search entity records with a regex
- [`dapi node capture`](./node/capture.md): capture a node to a labelled contact sheet, or one PNG per position
- [`dapi node insert`](./node/insert.md): insert JSX tags into an existing parent
- [`dapi node rm`](./node/rm.md): delete entities
- [`dapi node cp`](./node/cp.md): deep-clone nodes
- [`dapi node patch`](./node/patch.md): assign JSX props on existing entities
- [`dapi node render`](./node/render.md): render a scene to a video file

### Projects

- [`dapi project active`](./project/active.md): print the active project
- [`dapi project ls`](./project/ls.md): list projects
- [`dapi project create`](./project/create.md): create and open a project
- [`dapi project set`](./project/set.md): set the active project
- [`dapi project rm`](./project/rm.md): delete a project

### Assets

- [`dapi asset add`](./asset/add.md): add local files as assets
- [`dapi asset ls`](./asset/ls.md): raw asset records
- [`dapi asset tree`](./asset/tree.md): the library as its folder tree
- [`dapi asset rm`](./asset/rm.md): delete assets
- [`dapi asset mv`](./asset/mv.md): move assets into a folder
- [`dapi asset export`](./asset/export.md): write assets' original bytes to disk

### Media

- [`dapi media probe`](./media/probe.md): container and track metadata
- [`dapi media transcribe`](./media/transcribe.md): timed speech transcript
- [`dapi media grab`](./media/grab.md): decode video frames to a labelled contact sheet, or one PNG per frame
- [`dapi media filmstrip`](./media/filmstrip.md): grid of video frames as a PNG
- [`dapi media waveform`](./media/waveform.md): audio waveform PNG with silence highlighting
- [`dapi media listen`](./media/listen.md): AI description of an audio track
- [`dapi media understand`](./media/understand.md): local agent-operated evidence (default), inspection, transcript import and observations; optional Gemini analysis, status and claim verification

### Folders

- [`dapi folder ls`](./folder/ls.md): list child folders
- [`dapi folder create`](./folder/create.md): create a folder
- [`dapi folder rename`](./folder/rename.md): rename a folder
- [`dapi folder mv`](./folder/mv.md): reparent folders
- [`dapi folder rm`](./folder/rm.md): delete folders (cascades)

### Generation reference

- [`dapi models`](./models.md): list generation models and constraints
- [`dapi voices`](./voices.md): list speech voices

### Fonts

- [`dapi fonts`](./fonts.md): list local fonts

### Download

- [`dapi fetch`](./fetch.md): download a video with yt-dlp (installed separately)

## Shared types

```ts
NodeRef = { id: number; name: string; type: string }    // node ids are entity ids: integers
Size    = { width: number; height: number }
Asset   = { id: string; name: string; type: string }    // asset ids are opaque strings (sqids)
Folder  = { id: string; name: string; type: 'folder' }  // folder ids are opaque strings (sqids)
Time    = number | `${number}f` | "MM:SS"               // seconds, frames at 30 fps ("45f"), or a clock string; see jsx/timing.md
```

Time inputs take the `Time` format unless noted otherwise. Times in **outputs** are plain seconds, except the raw records of `node ls`, which use engine units (frames at 30 fps, packed colors, dB).

## Conventions

- **Stdout is JSON.** Commands that return a single record emit one JSON value. Commands that return a collection emit JSON Lines (one object per line, no surrounding array) so per-item results stay streamable. `node tree` and `asset tree` emit one nested object per root. Exceptions: `open` for file / URL / no-target writes nothing; `fonts --names-only` writes plain family names; `logs` writes plain formatted log lines; `mount` and `node insert` write nothing.
- **Batch commands are fail-fast** (`node rm`, `node patch`, `asset add`, …): one invalid input fails the whole command with a single stderr message and exit `1`. Ids are validated before anything changes, so a failed `rm`/`mv`/`cp` changes nothing; there are no per-item partial results.
- **Unix-style names are canonical:** list/read is `ls`, delete is `rm`, duplicate is `cp`, move/reparent is `mv`, search is `grep`. The longer English forms (`list`, `remove`, `duplicate`, `move`) are aliases of the Unix forms, not the other way around. `get` is a universal alias for `ls`. Commands without a natural Unix equivalent (`tree`, `rename`, `patch`, `add`, `create`, `active`, `context`, `whoami`, `open`, `focus`, `set`) keep their descriptive names.
- **Stderr:** human-readable error messages.
- **Exit codes:** `0` on success, `1` on any error (missing file, app not running, invalid input, IPC error).
- **App must be running:** canvas/project operations talk to the open Diffusion Studio instance. `fonts`, `fetch`, `playbook`, agent-operated media evidence, and `media understand --local` (including local status/evidence reads) can run without it. `report` tolerates the app's absence, recording it in the issue instead of failing. The default `--provider agent` makes no model calls; Gemini requires explicit provider selection and upload consent.

## Editing skills and local plans

See [the default agent workflow](./agent-workflow.md) and [playbook](./playbook.md) for the seven-skill relationship map, plan validation,
provider-free cut previews and candidate reference workflow.
