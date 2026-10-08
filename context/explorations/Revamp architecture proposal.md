---
title: Revamp architecture proposal
kind: working-artifact
state: proposed
updated: 2026-10-08
---

# Revamp architecture proposal

Working architectural patch for the [full revamp exploration](Revamp%20exploration%20guide.md).
Explicit changes override the baseline context. Unspecified fundamentals provisionally carry
forward only where consistent with this proposal. These are exploration decisions, not shipped
contracts. See the [research questions](Revamp%20research%20questions.md) for unresolved questions.

- **Three node types: View, matrix, matrix row**
  - Promote matrixes and views to be nodes (and stream items) in their own right, with their own label / title that shares the same discovery mechanisms as label-role columns for matrix rows. All node handling and text-based discovery is extended to understand nodes of all three types: matrix rows, matrixes, and views.
  - All nodes (including matrixes and views) have a home position somewhere in the outline forest - this gives them lifecycle, context, navigation, and scope shared with related nodes in the workspace. Retain this invariant for plugin helpers. Pivot helpers are owned beneath their pivot; global stores are root-homed. Separate roots and positionless stores were explored and set aside for now.
  - Each node type has different rules for node edges:
    - View nodes are leaves - they have no positional children, only inline results, which act somewhat like position-locked portals. Results can be written to if recognized, but not directly reordered. (The results' subtrees can be interacted with normally.)
    - **Accepted matrix-child rule:** a matrix node may directly position its member row nodes, other matrix nodes, and view nodes through `own` or `portal`. Foreign-matrix row nodes are forbidden as direct positional children. Matrix/view nodes are structural entries, not members of the parent matrix's table. This preserves homogeneous row children. See the [rule and examples](Revamp%20plugin%20semantics%20and%20storage.md#narrower-matrix-child-rule).
    - Matrix nodes provisionally have a collapsed-by-default static view at the bottom listing all matrix members that are homed elsewhere - that is, _not_ direct positional children of `own` or `portal` type. These act like view inline results. Collapse behavior and placement remain open alongside matrix display settings.
    - Matrix row nodes can have edges of any kind.
- **Node labels**
  - Matrixes and views have plain text labels that must be valid SQLite aliases.
  - Matrix row node labels come from their label-role column if any. This column does not need to exist; but without one, matrix row nodes are not eligible for quick text-based discovery. Matrix row nodes with no label are displayed as just a field strip of their previewable fields, in the stream.
- **Matrix designations**
  - Only user-managed matrixes are eligible for default/aspect designation. Here, user-managed means ordinary user-controlled data, regardless of creator or outline `own` parent. A core- or plugin-created matrix may be user-managed; a helper owned beneath a user-managed pivot remains plugin-managed.
  - Default item matrix
    - There is always one, and only one, matrix assigned to this designation. The matrix must be user-managed and have at least label- and content-role columns. It can have other columns, too. The designation can be reassigned to another matrix, as long as it is eligible.
    - This matrix is the source of new matrix rows for a 'switch to default items' gesture (might also be named 'switch to notes', 'switch to bullets', etc.), that modifies the current insertion in place when it is not the default item type.
  - Aspect matrix
    - There can be 0 or more matrixes with this designation. These matrixes are eligible for 'quick-attach' or 'aspect' gestures (like using the `#` sigil in prose), using their label.
    - Eligible user-managed matrixes created at the root level become these by default unless they are the default item matrix. Plugin-managed root stores do not receive this designation. The default item matrix is not eligible to be an aspect matrix.
- **Matrix display settings (provisional)**
  - Collapse is a display setting, not a matrix designation. Keep role terminology for columns.
  - The current proposal collapses and de-emphasizes selected matrixes by default and places them at the bottom of their home's navigation view. Plugin data-store matrixes motivate this behavior, but it could apply to any matrix.
  - Aspect matrixes are user data; aspect designation does not itself imply collapse. The implicit root categories and prominence overrides previously explored are set aside as the current recommendation. Visual clutter remains deferred while working with ordinary owned-helper homes. See the [focused exploration](Revamp%20plugin%20semantics%20and%20storage.md#workspace-entry-and-helper-placement).
  - Revisit collapse together with inline results and elsewhere-homed matrix members under the chosen placement model. Setting scope, defaults, placement, and persistence remain open; the current proposal is not a settled presentation contract.
- **Node insertion**
  - A matrix parent determines the matrix of inserted row children before the sibling defaults below. Inserting a row next to a helper under `Cards` creates a card, not a foreign default-item row. Insertion and type-switch gestures must obey the matrix-child rule.
  - Default behavior when inserting a new node underneath a given node (as a new sibling):
    - Matrix row node: Inserts a new matrix row node of the same type. ('Switch to default items' gesture is active as long as only label- and content-role columns have been changed.)
    - Matrix node: Inserts a new default item type node.
    - View node: Inserts a new default item type node.
- **Edge types**
  - `own`
    - Imparts dependent lifecycle - the owned node is deleted if the parent is.
    - Imparts position in the outline / closure tree.
    - The default edge type when inserting and moving nodes, and when type is unspecified in general.
    - A node can own any number of child nodes. A node can be owned by at most one parent node.
    - All nodes are either owned by one other node, or by the root sentinel (implying their home position is at the root).
  - `portal`
    - Does not impart any dependent lifecycle.
    - Imparts position in the outline / closure - duplicated, nonexclusive position.
    - Nodes can have multiple portals in both directions.
  - `attach`
    - Imparts dependent lifecycle - the attached node is deleted if the parent is.
    - Does not impart a position in the outline / closure tree.
    - The attached node is considered a subordinate 'part' of the parent node. Attached row aspects conceptually give a host an additional type and more fields. Plugin helpers use `own`; they do not need new matrix-part attachment semantics.
    - The host row supplies positional and prose context for the combined object. The attachment retains its own stored identity, matrix membership, and home so writes and plugin state target the specific aspect. Task aspects can each have an optional label regardless of the host's label; no labels or context prose are copied. The host label supports discovery of the context. Multiple/nested attachments require explicit task-versus-host result identities; those query shapes remain open.
    - A node can have any number of attached child nodes. A node can be attached to at most one parent node.
    - Row-aspect attachments should be considered for 'is-a' queries such as "tasks under Project X". In other words, attachments impart their type and fields onto the parent node.
    - Attachments should not be traversed for positional queries. For instance, if a task node is a subtree descendant of an attached node (but the attached node is not itself a task), "tasks under Project X" on the parent node does not find it.
    - Attachments can be created with the 'quick-attach' / 'aspect' gestures (like using the `#` sigil in content prose), or with a more general attach gesture as a command. The 'quick-attach' gesture both creates a row of the target type and attaches it, simultaneously. The row is homed at the end of its matrix's owned children by default.
  - `ref`
    - Does not impart any dependent lifecycle.
    - Does not impart a position in the outline / closure tree.
    - References are conceptually 'closer' to nodes than nodes' owned children, usually representing things like links within content-column prose.
    - A node can have any number of incoming and outgoing references.
    - References can be made with the `@` sigil in content prose, or with a more general command.
  - Dependent lifecycle means cascading deletes through ownership, attachment, and matrix membership. Deleting a matrix deletes all its members, including those homed elsewhere, and deletion continues through their lifecycle dependents. Portal targets are not deleted merely because they appear in a deleted subtree.
  - Both attachments and refs are displayed in their own region closer to a node's identity / content / focus region, not in the more disconnected child / navigation region. They will sometimes have an inline sigil (`#` or `@`) within the content-role column prose, but this is not a requirement. (If they don't have an inline sigil, they can still be displayed as if they are a full-width 'inline' badge at the end of the content, even if they aren't in the actual content column data.)
- **Delete confirmations**
  - Any deletion that has blast radius beyond the obvious immediate context has a confirmation dialog explaining the blast radius. Examples:
    - Deleting a node with a plain subtree and edges that only lead to matrix rows or views - no confirmation needed.
    - Deleting a node that contains matrix nodes in it (or deleting a matrix node itself), with some of that matrix's rows homed outside the node's subtree - confirmation needed.
- **Data flow**
  - Row data flows downward; nothing queries per mount. Each rendering or field control declares the fields they read. The host combines all declarations and runs one query per matrix per page. Results land in a store keyed by (matrix, row). Each mount subscribes to its own records, not to a query. Only rows the recognizer gives an identity get stored by key - aggregates stay plain read-only results. (This addressed N+1 and fan-out issues globally. It also means the worker will need to invalidate per row instead of per table. SQLite’s update hook already supplies row IDs.)
- **Cycles**

  - **Position graph (`own` ∪ `portal`) is acyclic.** A node cannot be positioned, whether homed or portaled, under itself or any of its positional descendants.
  - **Lifecycle graph (`own` ∪ `attach` ∪ matrix membership) is acyclic.** Membership counts as an edge from a matrix node to each of its members, because deleting a matrix deletes its members. A node cannot be owned by or attached to itself, or to any node that depends on it through any chain of these edges. This rule covers:
    - Attachment cycles of any length.
    - Mixed cycles: A owns B while A is attached to B (`A → B → A`). B being attached to A instead gives two parallel dependencies, not a cycle.
    - A matrix node homed under one of its own members, or under anything that member's lifecycle reaches.
  - **Gathered appearances get a render guard.** View results and a matrix's elsewhere-homed members are not positions, so the graph rules do not cover them. If a node is already on the current appearance path, it renders as an opaque indicator that shows only its identity and cannot be expanded or interacted with. This covers:
    - A view that appears in its own results' subtrees.
    - A matrix node portaled into the subtree of one of its elsewhere-homed members.
    - Mutual recursion between views.
  - **Enforcement.** Check the relevant graph rules when an edge is created or moved, including membership changes. Walk upward from the proposed parent to detect whether the child is already an ancestor in that graph. The lifecycle check needs a maintained lifecycle closure or a bounded upward walk alongside today's ownership closure.
    - Each node has at most one owner and one attachment parent; a matrix row belongs to one matrix. These bounds limit immediate lifecycle parents, not total ancestors. Position checks must also follow all portal parents. A bounded walk must report an unresolved check if it exhausts its budget; it must not admit an unchecked edge. Traversal budgets and enforcement during replicated changes remain research questions.

- Plugins

  - A bundle of related behaviors and views that augment the app in some focused way.
  - Scope and application (under exploration)
    - Plugins are usually applied explicitly by the user to an eligible matrix, which becomes a pivot for that application. Inputs bind to stable column IDs per application and read those columns from each row of the pivot matrix. Label/content roles can overlap input bindings but are not required unless the plugin actually needs them. Input shapes should accommodate existing compatible matrixes; setup may offer missing columns and reasonable defaults for blank matrixes.
    - **Accepted write scope:** applying a plugin grants ongoing use of that pivot without per-operation authorization. Global execution requires authorization for each operation that writes user-managed data; an operation may be a bounded batch. Matrix scope follows membership, regardless of row homes, and does not extend through attachments or child nodes into unrelated matrixes. Normal writes to other plugins' managed stores remain guarded. All writes remain transactional and logged.
    - Durable application linkage lives in a narrow system table for input bindings and helper associations. There is at most one application per plugin–pivot pair; multiple plugins may apply to the same pivot. Each application instance has its own identity; reapplication gets a new identity, and writes targeting removed identities are discarded. Plugin business data and business-logic settings live in matrixes. Global helper associations also remain durable without a synthetic pivot; exact schema encoding is deferred.
    - Value interpretation is configured per application. For statuses, offer existing populated values for selection; if there are none, suggest useful defaults compatible with the column. If changed inputs become ineligible, report invalid configuration until the user manually repairs it; do not silently rebind or remove the application. Compatibility rules and suspension behavior still need definition.
    - A plugin may create visible, plugin-managed matrixes associated with each pivot, or workspace-wide matrixes for global state. Pivot helpers use `own`, giving each one home beneath its pivot. Global stores are root-homed. This placement is accepted in the exploration; visual clutter is deferred until a concrete case requires refinement. Normal writes to helper matrixes pass a central managing-plugin guard. The user's pivot data stays editable. Core deletion cascades operate above this guard: authorize the initiating deletion normally, then apply its lifecycle consequences without per-helper writer checks. Core undo/restore treatment remains part of the recovery discussion.
    - Removing an application deletes its system record, bindings/associations, and dedicated helper matrixes; reapplication starts fresh. Pivot deletion also clears its applications and cascades through helpers. Uninstall/removal clears all of the plugin's application records and managed stores, including global ones. User-managed data remains user data regardless of creator; cleanup does not remove another plugin's independent applications/helpers on that pivot or reverse earlier authorized user-data changes.
    - A global plugin such as the second-brain plugin is enabled/disabled with one on/off setting and can read broadly across user-managed workspace data. Off preserves global stores; reset fully clears their managed state, and removal deletes them. Lifecycle cleanup uses core operations and does not require the plugin to execute. Writes require authorization, a transaction, and operation-log recording; structural invariants and the guard for ordinary helper mutations still apply; genuine core deletion cascades follow the higher-order lifecycle rule. Each global user-data operation needs authorization; no standing global grant. Own managed-store updates use the normal manager authority without per-write user approval. Recurrence and unattended ingest fit matrix applications, which provide ongoing authorization to use their pivots.
    - Reads of plugin-managed matrixes are unrestricted, but second-brain and similar global discovery plugins should scan user-managed matrixes only. Managed stores contain plugin business logic and need deliberate, informed interpretation; this discovery policy is separate from read access.
    - Independent review and dismissal events have distinct IDs and survive sync; replay retains the same event ID. SRS scheduling idempotently recomputes from the combined review state and updates in place, consistently with processing both reviews on one client. Generated scores/schedules do not replace durable events. Defining a new content generation and how it affects dismissals is second-brain business logic, not sync reconciliation.
    - The earlier proposal also allowed passive enrollment based on column roles or types, with an empty requirement set implying global scope. Passive enrollment remains an alternative under review; it is not how explicit matrix applications or global activation are inferred.
    - See the [worked scenarios and questions](Revamp%20plugin%20semantics%20and%20storage.md). Helper placement and the narrower matrix-child rule are accepted. Designation eligibility follows user management rather than creation provenance; managed helpers cannot be default/aspect matrixes. Task attachment context and core recovery/replication enforcement remain follow-throughs. Basic SRS reads front/back rich-text fields directly from each card row; it needs no attachment or host-source mechanism.
  - Systems
    - Functions that run on schema updates, row updates, or timed schedules. They can read data, make authorized data changes, and trigger actions through managed operations, subject to structural and managing-plugin guards. Display defaults remain open. Plugin creation alone does not imply collapse, particularly for user-editable aspect matrixes. Defer special display defaults until a concrete clutter case needs them.
  - Widgets
    - Plugins can provide new widgets of several kinds:
      - Field-sized, for display in a table cell or a field strip slot, replacing the default view there.
      - Block-sized, for display in a full panel region somewhere in the UI
        - These can contain 0 or more paged views that read from queries
        - Examples:
          - Kanban board
          - Large visualizations
          - SRS review screen
      - Modals that can be triggered by an action or shown by a system
      - Notifications that can be shown by a system
    - Plugins take part in a status + navigation strip somewhere near any associated matrixes (like in their focus panel)
      - Entry point for getting to block widgets, managing notifications
      - Another entry point for viewing and managing plugin's own matrixes
  - Ergonomics
    - Plugins should be very easy to write and modify, and very hard to get wrong (i.e. corrupting state or impairing performance)

- Core use cases

  - Rich-text outlining (Workflowy inspiration)
    - Hierarchical bullets
    - Quick and ergonomic outline affordances
      - Keyboard editing of the prose and the outline structure together, seamlessly
      - Expand / collapse
      - Quickly select and move groups of bullets with drag-and-drop or keyboard gestures
    - 'Zoom in' and focus on bullets as a visual root
  - Linked notes and documents (Obsidian inspiration)
    - Longer rich-text prose documents with wiki-links
  - Personal database (Grist / Sheets inspiration)
    - Record and manipulate tabular data, integrated seamlessly with outline and documents
  - Second brain
    - Automation-assisted manipulation and comprehension of personal ideas, projects, and data, for higher efficiency, easier organization and pruning, and deeper insights and connection-making than what traditional note-taking can offer
      - 'Automation' can be AI agents or more traditional tools like vector embeddings
    - Detecting and adapting to emergent patterns in all core data (outline, documents, and tabular)
      - Making those patterns available as information to plugins and AI agents
      - Natural, in-flow prompts to user, for reinforcing those patterns, better organizing them, and improving cleanliness and information hierarchy. e.g.:
        - consolidate similar structures (notes, outline subtrees) together that are spread out and disconnected
        - split structures that are tightly grouped but mix too many unrelated things together
        - remove clutter that isn't serving much purpose
        - apply an aspect tag to several similar items
        - create a matrix out of adjacent items that seem to be encoding tabular data

- Extended use cases

  - Task management
    - All the basics: Status, priority, due dates, reminders, recurring tasks, projects, inline completion, filtered task lists
    - Time tracking
      - Coarse check-in increments that round to hours or days, for low-impact personal tracking
      - Granular, to-the-minute tracking, as for billables
    - Enough power and flexibility to provide organization tools and focus-tracking systems like:
      - GTD
      - Kanban boards
      - Eisenhower quadrants for daily triaging
    - Tagging items as tasks from anywhere in the outline (to make it easy to make tasks ad-hoc, and to support a variety of daily-note type patterns)
  - Media log and reviews
    - Three-part logging: Star rating, prose notes, and automatic timestamp
    - Look up and associate with real-world info (year released, poster image, etc.)
    - Tagging items as review from anywhere in the outline, same as tasks
  - Spaced-repetition studying
    - Apply SRS directly to a matrix with front/back rich-text columns, optionally overlapping label/content roles. Each row is a card; files may supplement its content later. No row attachment is required.
    - Scheduled SRS review of any due cards
    - Visualizations for number of due cards and progress

- Personal use cases

  - Microjournaling
    - Quick-input form modal actively prompted on a regular schedule
    - Categorical field for mood, quantitative field for energy level, rich text input for current activity and any other notes
    - Automatically bumps a streak number field for consecutive on-time check-ins
    - Visualizations for mood, energy level, streak
  - Working-memory / default-mode-network system
    - Keeping track of open 'loops' that need closing, and guiding focus throughout the day
    - Inbox for spontaneous ideas, organizational thoughts, and priority shifts that come from daydreaming
    - Automatically tracks total context load of the subtree (total length, accounting for density of individual items), as well as the context load delta (items entering vs items leaving), and the staleness of each item
    - Automatic review prompts (gentle, inline, to be engaged with at any time) that stochastically surface items more likely to be triage candidates (more stale + less related to other items)
  - Daydream system
    - Automatically collects notes on a recently relevant topic, and guides creative session exploring new conceptual edges
  - Meal planning, grocery list
    - Recipe tracking and automatic ingest from webpages or clips
    - Agent-assisted grocery list creator
      - Takes meals selected and ad-hoc input of fridge contents, groups and sorts ingredients by store section
  - Personal stuff-tracking
    - Wishlist of stuff to get, with URLs + prices + preview images
    - Inventories of stuff owned (furniture, electronics, software)
  - Fitness tracking
    - Point-in-time personal measurements
    - Ingest workout, health, calorie data from other apps
  - Cleaning and pruning system
    - Part of 'second brain' core use case - actively engaged surface to explore a queue of patterns that could represent clutter and lack of organization, and clean them up with guided automation or direct manual work

- Other core principles
  - All interactive gestures should be immediately accessible, quick, intuitive to understand the fundamentals of, and natural to progressively master. In particular:
    - It should be very easy and quick to _find_ specific items, and possible to build queries nearly as powerful as full SQLite itself in the same gesture (with enough mastery)
    - It should likely be easy and quick to insert new items in the most appropriate place (this could just be a natural consequence of finding that place being easy and quick)
  - All views should be made to maximize focus, contextual awareness, and natural comprehension of relationships and interactions between objects (while still being economical with space and affordances, not cluttered and overly dense)
