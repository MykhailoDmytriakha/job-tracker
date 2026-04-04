# Learnings

Self-education log. Every bug, user correction, and design insight gets recorded here so the same mistake is never repeated.

---

## 2026-03-31

### L028: Tooltips should be click-to-show, not hover-only
**Context:** Meta field hints used native `title` attribute (browser tooltip on hover). User feedback: inconsistent, no visual affordance, no interactivity.
**Fix:** Replaced with `HintBubble` component (`src/components/HintBubble.tsx`). Click `?` to toggle popup, click outside to dismiss. Hover animates the bubble (scale + accent color) to signal interactivity.
**Rule:** Any contextual help text in the UI must use `HintBubble`, not `title`. Native tooltips are for icons only (where the label IS the tooltip).
**Usage:**
```tsx
import { HintBubble } from "./HintBubble";
// Inside a label:
<span className="meta-label">
  My Field
  <HintBubble text="Explanation of what this field does." />
</span>
```

---

## 2026-03-30

### L001: SQLAlchemy cascade must be explicit on ALL child relationships
**Context:** Delete task crashed with `NOT NULL constraint failed: activities.task_id`
**Root cause:** `activities` relationship on Task model had no `cascade="all, delete-orphan"`. SQLAlchemy default = set FK to NULL on parent delete, which violates NOT NULL.
**Fix:** Added `cascade="all, delete-orphan"` to activities relationship. Delete endpoint explicitly clears many-to-many relationships and deletes subtasks.
**Rule:** Every relationship where the child cannot exist without the parent MUST have `cascade="all, delete-orphan"`.

### L002: CORS must list all possible dev ports
**Context:** Dashboard clicks and all API calls silently failed. No errors in UI.
**Root cause:** Frontend on port 5174, CORS only allowed 5173.
**Fix:** Added 5174 and 5175 to allowed origins.
**Rule:** Silent CORS failures are the hardest to debug. In dev, always allow multiple ports.

### L003: Badge spam kills readability
**Context:** User rated UI 3/10: "everything flickers, dependencies don't read, not user-friendly"
**Root cause:** 5-6 small badges per task item, all same visual weight. Nothing stands out.
**Fix:** Replaced badge spam with explicit text status tags + reduced to 1-2 meaningful indicators.
**Rule:** Color IS the message. One glance = one signal per visual channel. Less is more.

### L004: Destructive actions need confirmation
**Context:** User: "delete should have confirmation"
**Fix:** Custom modal (not window.confirm) before delete.
**Rule:** Any irreversible action must have a confirmation step with custom UI, not system dialog.

### L005: Inline edit must not cause layout shift
**Context:** User: "forms jump during editing"
**Root cause:** View/edit mode had different element dimensions.
**Fix:** Measure scrollHeight of view element before switching, set textarea initial height to match.
**Rule:** When replacing a read-only element with an editable one, preserve the exact dimensions.

### L006: Dashboard items must be actionable
**Context:** User: "dashboard clicks not working"
**Root cause:** onClick did nothing, no navigation.
**Fix:** Navigate to `/tasks?selected=ID`.
**Rule:** Every clickable item must do something visible. If it looks clickable but does nothing, that's worse than not being clickable.

### L007: Left border stripes are cryptic without explanation
**Context:** User circled the left border stripes and asked "what is this?"
**Root cause:** Abstract color signals without text or tooltip. First-time user sees random colored lines with no affordance.
**Fix:** Replaced with explicit readable text status tags ("Blocked", "Overdue", "Waiting") with tooltips on hover.
**Rule:** NEVER use abstract visual signals without accompanying text or tooltip. If a new user cannot understand a UI element within 1 second, it fails.

### L008: Don't visualize default states
**Context:** Every task showed "MEDIUM" badge. 80% of tasks are medium, so the badge adds zero information.
**Root cause:** Showing priority unconditionally. Default states are noise.
**Fix:** Only show HIGH priority. Medium/low = no badge.
**Rule:** Only deviations from the norm deserve visual weight. If 80% show the same badge, it's noise.

### L009: System dialogs break visual harmony
**Context:** User: "custom modal, not system confirm"
**Root cause:** `window.confirm()` breaks the app's visual language, can't be styled.
**Fix:** Custom ConfirmModal with app design tokens, backdrop blur, animation, danger button.
**Rule:** Never use `window.confirm/alert/prompt`. Always custom modals matching the design system.

### L010: Follow established task tracker UX conventions
**Context:** User: "there are many task tracker apps, follow their intuitiveness and color schemes"
**Root cause:** Building UI from abstract principles instead of studying Linear, Todoist, Things, Notion.
**Rule:** Before designing any task management UI element, check how established tools handle it. Users have muscle memory. Match conventions: checkbox left, title center, meta right. Property list sidebar like Notion/Linear.

### L011: Metadata as property list, not grid
**Context:** User: 2-column meta grid with grey cells "is not harmonious"
**Root cause:** Grid with bg-muted background looks like a broken spreadsheet. Empty cells create dead zones.
**Fix:** Vertical list of key-value rows. Label left (100px), value right. Border between rows. Like Linear/Notion sidebar.
**Rule:** Task metadata = property list, not spreadsheet. Vertical flow, no boxes, no dead cells.

### L012: Measure before switching to edit mode
**Context:** Description editing still caused layout jump.
**Root cause:** Textarea starts at min-height, not matching the div's actual content height.
**Fix:** Use ref.scrollHeight measurement before switching. Textarea starts at exact same height.
**Rule:** For any view-to-edit transition, measure the original element first.

### L013: Nesting must go as deep as the data model
**Context:** User: "no ability to add subtask for subtask"
**Root cause:** UI stopped at depth 1 even though data model supports unlimited nesting.
**Fix:** Recursive SubtaskItem component. Each level shows its own subtasks + "Add subtask" input.
**Rule:** If the data model supports it, the UI must too. Don't artificially limit depth.

### L014: Compliments signal direction, not completion
**Context:** User: "you're already doing better" + "be responsible, adapt"
**Insight:** Each fix raises the bar. The compliment means the direction is right but there's more to do.
**Rule:** Read about-user.md to understand thinking patterns. Anticipate needs. Don't wait for complaints.

### L015: Link-to-entity UI needs browsable list, not just search
**Context:** User: "adding dependency is not obvious, unclear what tasks I have"
**Root cause:** Search-only assumes user remembers task names.
**Fix:** "+ Add dependency" button opens browsable list of all tasks. Search narrows it. Already-linked tasks excluded.
**Rule:** "Pick from list" > "type to search". Always show options first.

### L016: Distinct visual identity for distinct metrics
**Context:** User: "subtask progress and checklist progress must be different colors, with tooltips"
**Root cause:** Both progress indicators looked identical.
**Fix:** Subtask progress = purple pill + purple bar. Checklist progress = green pill + green bar. Tooltips on each.
**Rule:** If two metrics measure different things, they MUST look different. Color + tooltip minimum.

### L017: Completion enforcement cascades to all children
**Context:** User: "can't close task if subtasks open or checklist unchecked, enforce at API"
**Fix:** API returns 409 if trying to close with: (1) unresolved dependencies, (2) open subtasks, (3) unchecked checklist. Works at every nesting level because subtask = Task with same rules.
**Rule:** Completion = everything inside is complete. System-level invariant, not UI suggestion. Critical for future CLI/agent integration.

### L018: Dependency chain visualization, not just flat lists
**Context:** User: "I need to see the chain and where I am in it"
**Root cause:** Flat "Blocked by" / "Blocks" lists don't show full sequence context.
**Fix:** API endpoint walks full graph via BFS + topological sort. UI renders vertical chain with position indicator (numbered circles, current = blue, done = green). Clickable navigation.
**Rule:** Dependencies are chains, not pairs. Always show full context + position.

### L019: SQLite in-memory testing needs StaticPool
**Context:** 53 backend tests all failed with "no such table" despite create_all succeeding.
**Root cause:** SQLite in-memory DB is per-connection. FastAPI TestClient runs in separate thread, gets different connection = different empty DB.
**Fix:** `create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})` forces all connections to share one DB.
**Rule:** Always use StaticPool for SQLite in-memory tests with multi-threaded frameworks.

### L020: Test app must be separate from production app
**Context:** TestClient(app) triggers lifespan which touches production DB.
**Root cause:** Production app's lifespan runs create_all + migrations + seed on the real data.db file.
**Fix:** Create separate test_app (FastAPI instance without lifespan) in conftest.py. Same routers, no startup side effects.
**Rule:** Test infrastructure must never touch production data. Separate app instance for tests.

---

## Meta-patterns observed across all learnings

**Pattern A: Silent failures are the worst bugs.** CORS (L002), dashboard clicks (L006), system dialogs swallowing errors (L009). If something fails silently, the user blames the tool, not the error.

**Pattern B: "Obvious to the builder" != "obvious to the user."** Left border stripes (L007), search-only dependency add (L015), badge spam (L003), grid layout (L011). Every design choice must pass the "new user in 1 second" test.

**Pattern C: The data model is the source of truth for UI capabilities.** Nesting (L013), chain visualization (L018), enforcement cascading (L017). If the backend supports it, the frontend must expose it. Hidden capabilities = missing features.

**Pattern D: Testing infrastructure has its own learning curve.** SQLAlchemy cascade (L001), StaticPool (L019), separate test app (L020). Each ORM/framework has gotchas that only surface under test conditions, not in dev.

### L021: Chain list is not a graph - must render actual connections
**Context:** User: "chain is not harmonious and not understandable, needs to render a dependency graph"
**Root cause:** Chain visualization is a numbered vertical list. It shows order but not relationships. User sees 6 items in a column but can't tell which depends on which. It looks like a flat todo list, not a dependency graph. The "Blocked by" and "Blocks" sections below duplicate information already in the chain but in a different format, creating confusion.
**Fix:** Replace chain list with an actual visual graph: nodes connected by lines/arrows showing direction. Current task highlighted. Done tasks visually distinct. Clickable nodes. Remove redundant "Blocked by"/"Blocks" flat lists - the graph shows this.
**Rule:** If the data is a graph, render it as a graph. Lists cannot communicate relationships. Arrows/connections are mandatory for dependency visualization.

### L022: Delete must respect dependency chain integrity
**Context:** User: "if task is in a dependency chain, don't allow delete if chain breaks, show warning with chain if it's a leaf"
**Root cause:** Delete was unconditional - just cleared all deps and deleted. This silently breaks dependency chains that other tasks rely on.
**Fix:** Three-tier delete logic at API level:
  - **Middle of chain** (has both blockers AND dependents): 409, cannot delete, must remove dependencies first. Even force won't work.
  - **Leaf with deps** (has blockers OR dependents, not both): 409 with explanation, but allows `?force=true` via confirm dialog.
  - **No deps**: deletes normally with simple confirm.
Frontend: Delete button first tries without force. If 409, shows modal with the API's explanation. If chain-middle: modal says "Cannot delete" with OK only. If leaf: modal says what will happen with "Delete anyway" button.
**Rule:** Dependency chains are structural integrity. Deleting from the middle = data corruption. Enforce at API level. Leaf deletion = acceptable with informed consent.

### L023: Blocked checkbox must give feedback, not fail silently
**Context:** User clicks checkbox on blocked task in the list, nothing happens, no message. Only sees "Blocked" after opening detail panel.
**Root cause:** toggleStatus catches the 409 error silently. User gets zero feedback on WHY the click did nothing.
**Fix:** Show a toast/notification when trying to check off a blocked task: "Can't complete: blocked by #X". Feedback must appear at the point of action (the list), not require opening the detail panel.
**Rule:** Every failed user action must produce visible feedback at the point of interaction. Silent failures = confused users.

### L024: Dependency tree must use decomposition model, not execution order
**Context:** User: "leaves should close first, then parent closes". But tree showed execution order (root=first, leaf=last).
**Root cause:** Tree rendered top-to-bottom as execution chain (do root first → leaf last). User thinks in decomposition: top = goal, children = prerequisites that close first. These are opposite visual directions.
**Fix:** Reversed tree: goals (end of chain, blocks nothing) at top, prerequisites (blockers) as indented children. Reading: "to close top, first close all children below." This matches subtask mental model.
**Rule:** Dependency trees MUST use decomposition model. Top = goal (close last). Children = prerequisites (close first). This matches how every user thinks about task breakdown.

### L025: "Blocked by" and "Blocking" buttons need both directions
**Context:** User: "I expected adding Solo would put it BELOW test task, not above"
**Root cause:** Single "Add dependency" was ambiguous about direction.
**Fix:** Two explicit buttons with directional arrows: "↑ Blocked by..." (add parent/upstream) and "Blocking... ↓" (add child/downstream). Picker shows direction-specific explanation.
**Rule:** Bidirectional relationships need bidirectional UI. Never use ambiguous "add" — always specify which direction.

### L026: Task #ID references must be clickable everywhere
**Context:** User: "when modal says 'blocks #7 Test task', I want to click #7 and go to it"
**Root cause:** Error messages, banners, modals, toasts all mentioned task IDs as plain text. User sees a reference but can't act on it.
**Fix:** `linkifyTaskRefs()` function parses `#ID` in any string and renders as clickable spans. Applied to: error banner, blocked banner, delete confirmation modal, toast notifications. Click navigates to that task.
**Rule:** Every task ID mention in the UI must be a clickable link. If you reference something, make it navigable. Dead references = frustrated users.

### L027: Double delete call from split responsibility
**Context:** Delete button stopped working silently.
**Root cause:** TaskDetail called `tasksApi.delete()`, then `onDelete()` callback in Tasks page called `tasksApi.delete()` AGAIN on the already-deleted task → 404 error swallowed.
**Fix:** TaskDetail owns the API call. `onDelete` callback only updates UI state (clear selection, reload list). Single responsibility: component that initiates the action owns the API call, parent only reacts.
**Rule:** API calls and state updates must not be split across parent-child. One component owns the mutation, the other reacts to its completion.

## 2026-04-03

### L029: Full-height route pages need their own scroll container
**Context:** User reported that `/tasks/:taskId/meeting/:meetingId/cockpit` rendered correctly but the page could not scroll when the cockpit content exceeded the viewport.
**Root cause:** The app shell uses fixed-height layout (`#root` = `100vh`, `main` = `overflow: hidden`) and relies on each page to own its vertical scrolling. Meeting Cockpit used `min-height: calc(100vh - 52px)` but did not define its own `overflow-y: auto`, so content became taller than `main` and got clipped instead of scrollable.
**Fix:** Made `.ck` the route-level scroll container (`flex: 1`, `min-height: 0`, `overflow-y: auto`, `overflow-x: hidden`) and documented the behavior in `features.md`.
**Rule:** In the app shell, any full-height route page must explicitly own vertical scrolling. If parent `main` hides overflow, child pages cannot rely on document scroll.

### L030: Cockpit prep content must preserve meaning through rendering
**Context:** User reported that `Ready Answers` looked wrong, `Post-Call Notes` showed broken `\n` escapes, and the bottom resource tray felt flat and hard to parse.
**Root cause:** Cockpit content was rendered as raw markdown without normalizing escaped newlines from storage, so notes could show literal `\\n`. Also, the footer resources were dumped into one undifferentiated chip row, losing type semantics (docs vs contacts vs company vs links).
**Fix:** Normalize cockpit markdown before render/edit, respect line breaks in paragraph rendering, and group footer resources into centered color-coded sections by entity type.
**Rule:** Prep surfaces must preserve both text structure and resource semantics. If the source has meaningful line breaks or typed entities, the UI must carry that structure through to the final render.

### L031: Long cockpit modals must be viewport-bounded, not content-sized
**Context:** User clicked long footer resources like interview briefings and the modal became taller than the screen, making the popup look broken and hard to use.
**Root cause:** Cockpit modal was rendered inside the transformed scroll container and had no `max-height`, so long markdown documents expanded the whole modal to content height instead of keeping the shell fixed and scrolling inside the body.
**Fix:** Render the modal through a portal to `document.body`, cap modal height to the viewport, keep the header fixed, and let only the modal body scroll. Also softened the featured footer chip styling so emphasis stays subtle.
**Rule:** Any modal that can open unbounded content must be viewport-constrained and portal-based. The frame stays fixed; only the content area scrolls.

## 2026-04-04

### L032: Cockpit creation must be explicit in the meeting workflow
**Context:** User created a meeting in task detail, saw that a cockpit page exists, but had no clear action for creating the cockpit itself. The existing `Cockpit` button looked like navigation, not initialization.
**Root cause:** The UI exposed the cockpit destination but not the state transition from “meeting exists” to “cockpit workspace created.” That made the workflow conceptually incomplete.
**Fix:** Add explicit cockpit state (`not created yet` / `ready`), a dedicated `Create cockpit` action on the meeting card, and starter cockpit sections created on demand before navigation.
**Rule:** When a feature has two phases, creation and usage must be distinct in the UI. A plain “open” button is not enough if the user still needs to initialize the workspace first.

### L033: Nested task detail payloads must include the same meeting state as dedicated meeting endpoints
**Context:** After adding explicit `Create cockpit` / `Open cockpit` states, task `97` still showed `Create cockpit` even though the meeting already had cockpit content and the dedicated meetings endpoint returned those sections.
**Root cause:** The task detail serializer built `MeetingOut` objects manually inside `_full()` and forgot to include `cockpit_sections`, so `TaskOut.meetings[*].cockpit_sections` always defaulted to `[]`.
**Fix:** Include serialized `cockpit_sections` when building nested meetings inside the task detail response and verify that `/api/tasks/:id` matches `/api/tasks/:id/meetings` for cockpit state.
**Rule:** If a nested object is exposed both standalone and inside a parent payload, their state-bearing fields must stay structurally equivalent. A partial nested serializer creates false UI states.

### L034: "Create" actions for persistent workspaces must be idempotent
**Context:** Once the cockpit-state bug was found, it became clear that a stale `Create cockpit` button could have re-sent the initialization request for an already existing cockpit.
**Root cause:** The bulk cockpit initializer deleted all existing cockpit sections before recreating them, which is valid for replace semantics but dangerous for a UI action labeled as creation.
**Fix:** Make cockpit initialization a no-op when sections already exist, so repeated create attempts preserve prior content.
**Rule:** If the UI says “Create” for a persistent workspace, the backend must treat repeated requests as safe and non-destructive unless the user explicitly asked for reset or replace.

### L035: Modal viewers for related documents need in-place switching
**Context:** In the cockpit footer, opening the wrong document forced the user to close the modal and reopen another document from the footer, slowing down rapid review.
**Root cause:** The modal header exposed only the current title and close action, with no notion of sibling documents already available in the same footer group.
**Fix:** Add an inline document switcher inside the modal header so related docs can be swapped in-place without closing the popup.
**Rule:** If a modal is used as a viewer for a small set of sibling resources, navigation between those resources should happen inside the modal, not through repeated open/close cycles.

### L036: In-modal resource navigation must preserve the same grouping semantics as the footer
**Context:** After adding document tabs to the cockpit modal, the user still expected the popup navigation to reflect the same grouped structure as the footer: documents, companies, and contacts, not just a flat doc-only switcher.
**Root cause:** The first pass solved speed of switching but dropped the footer’s information architecture, so the modal and footer no longer spoke the same visual language.
**Fix:** Build modal navigation from the same resource groups as the footer, keep the same group colors for docs/companies/contacts, and mark external links separately instead of making them look like popup resources.
**Rule:** If a UI exposes grouped resources in one surface and lets the user continue navigating them in another, the second surface must preserve the same grouping and visual semantics.

### L037: Modal headers should not restate the active item when grouped navigation already makes it obvious
**Context:** After grouped modal navigation was added, the left-side title like `Resume` became redundant because the active chip inside the colored header already identified the current resource.
**Root cause:** The modal kept the older standalone title while also introducing richer grouped navigation, so the same information was shown twice in the same header.
**Fix:** Hide the standalone modal title whenever grouped resource navigation is present; keep the title only for single-resource modals.
**Rule:** If an active state is already explicit inside a navigation control, don’t repeat it as a separate heading in the same header band.

### L038: Activity log text must wrap arbitrary long tokens inside modal layouts
**Context:** User reported that the task popup opened from Dashboard and Pipeline gained a horizontal scrollbar when an activity entry contained a very long URL.
**Root cause:** Activity text used default line-breaking, so unbroken strings like URLs could not wrap. The detail columns were scroll containers, which let that overflow turn into horizontal scrolling.
**Fix:** Make activity text preserve line breaks and wrap long tokens (`overflow-wrap: anywhere` / `word-break: break-word`) and explicitly hide horizontal overflow in task detail columns.
**Rule:** Any user-generated log or note text shown inside fixed-width panels or modals must wrap arbitrary tokens (URLs, hashes, IDs) and must never create horizontal scrolling.

### L039: Dense cockpit writing surfaces need their own text-size control
**Context:** User reported that Cockpit content sections such as `My Pitch` and `Post-Call Notes` sometimes feel too small and asked for an in-page way to regulate font size.
**Root cause:** Cockpit optimized for information density with markdown/read-edit font sizes around 13-14px, but long-form prep notes are a reading/writing surface, not chrome. One fixed size is too rigid for different screens and visual comfort needs.
**Fix:** Add a Cockpit-only content text-size control, persist the preference locally, and apply the same scale to both reading and editing states of section content.
**Rule:** For long-form prep, notes, or writing surfaces, content typography must be user-adjustable independently from surrounding UI chrome. Read mode and edit mode must stay in sync.

### L040: Bottom app bars inside fixed-height shells must use dynamic viewport units and safe-area padding
**Context:** User reported that the Cockpit footer looked correct on desktop but was half-cut on iPad and could disappear on Android.
**Root cause:** The app shell used `100vh`, which can exceed the visible viewport on mobile browsers when browser chrome is present. Cockpit also rendered its footer as a plain bottom flex item without sticky positioning or bottom safe-area compensation.
**Fix:** Move the app shell to dynamic viewport sizing (`100dvh` with `100vh` fallback) and make the Cockpit footer sticky with `env(safe-area-inset-bottom)` padding so it stays fully visible above browser UI.
**Rule:** In mobile webviews/browsers, any bottom toolbar inside a fixed app shell must account for dynamic viewport height and bottom safe areas. `100vh` alone is not reliable.

### L041: Cockpit viewer modals must inherit the same text-size preference as the main prep surface
**Context:** After adding `S / M / L / XL` text sizing to Cockpit, the user noticed that footer-opened modals still showed document text at the old fixed size.
**Root cause:** The main Cockpit surface carries its typography scale on `.ck`, but the resource viewer modal is rendered through a portal to `document.body`, so it does not inherit those CSS variables automatically.
**Fix:** Apply the Cockpit content scale to the modal container too, and define the shared typography variables on both `.ck` and `.ck-modal`.
**Rule:** Any portal-based viewer opened from a configurable writing/reading surface must inherit the same typography preference, or the experience feels inconsistent.

### L042: Detached dev scripts must own a new session, not just use nohup
**Context:** New `start_dev.sh` initially launched `uvicorn --reload` and `vite` with `nohup ... &`, reported success, but both services disappeared right after the launcher exited.
**Root cause:** `nohup` alone did not fully isolate the dev servers from the parent execution context. Reloaders and child processes could still die with the launcher/process group, so the start script produced a false positive.
**Fix:** Launch background dev services in a new session/process group and stop them by recorded group leader PID, with port-based cleanup only as a fallback.
**Rule:** For any persistent background dev script, detach with a new session and treat start/stop as process-group management, not plain PID management.

### L043: Repository-scoped deliverables must stay inside the repository unless global install is explicit
**Context:** While creating a new reusable skill, the first implementation path targeted the global Codex skills directory. The user corrected the scope: "давай в проекте только".
**Root cause:** I optimized for reusability before confirming installation scope. For repo work, that silently crosses a boundary between project artifact and user environment configuration.
**Fix:** Create the skill under the current repository instead of `~/.codex/skills` and treat global installation as opt-in only.
**Rule:** When the user asks to create tooling, skills, templates, or automations during repo work, default to repository-local placement unless they explicitly ask for a global install.

---

## Meta-patterns observed across all learnings

**Pattern A: Silent failures are the worst bugs.** CORS (L002), dashboard clicks (L006), system dialogs swallowing errors (L009), checkbox blocked (L023). If something fails silently, the user blames the tool, not the error.

**Pattern B: "Obvious to the builder" != "obvious to the user."** Left border stripes (L007), search-only dependency add (L015), badge spam (L003), grid layout (L011), execution-order tree (L024). Every design choice must pass the "new user in 1 second" test.

**Pattern C: The data model is the source of truth for UI capabilities.** Nesting (L013), chain visualization (L018, L021), enforcement cascading (L017). If the backend supports it, the frontend must expose it.

**Pattern D: Testing infrastructure has its own learning curve.** SQLAlchemy cascade (L001), StaticPool (L019), separate test app (L020). Each ORM/framework has gotchas that only surface under test conditions.

**Pattern E: User feedback is always about the gap between expectation and reality.** "Not harmonious" (L010, L011) = "I've used better tools." "Not obvious" (L007, L015) = "I shouldn't need to think." "Leaves first" (L024) = the user's mental model is decomposition, not execution order.

**Pattern F: Every reference must be actionable.** Task IDs (L026), dashboard items (L006), dependency nodes (L018). If the UI mentions something the user might want to navigate to, it must be a link. Dead references = dead ends.
