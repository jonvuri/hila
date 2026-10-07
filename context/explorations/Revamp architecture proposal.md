---
title: Revamp architecture proposal
kind: working-artifact
state: proposed
updated: 2026-10-07
---

# Revamp architecture proposal

Working architectural patch for the [full revamp exploration](Revamp%20exploration%20guide.md).
Explicit changes override the baseline context. Unspecified fundamentals provisionally carry
forward only where consistent with this proposal. These are exploration decisions, not shipped
contracts. See the [research questions](Revamp%20research%20questions.md) for unresolved questions.

- **Three node types: View, matrix, matrix row**
  - Promote matrixes and views to be nodes (and stream items) in their own right, with their own label / title that shares the same discovery mechanisms as label-role columns for matrix rows. All node handling and text-based discovery is extended to understand nodes of all three types: matrix rows, matrixes, and views.
  - All nodes (including matrixes and views) have a home position somewhere in the outline forest - this gives them lifecycle, context, navigation, and scope shared with related nodes in the workspace.
  - Each node type has different rules for node edges:
    - View nodes are leaves - they have no positional children, only inline results, which act somewhat like position-locked portals. Results can be written to if recognized, but not directly reordered. (The results' subtrees can be interacted with normally.)
    - Matrix nodes can only have their own members as positional edges. They do not need to have any of their members as edges - all a matrix's rows can be homed at positions elsewhere.
    - Matrix nodes provisionally have a collapsed-by-default static view at the bottom listing all matrix members that are homed elsewhere - that is, _not_ direct positional children of `own` or `portal` type. These act like view inline results. Collapse behavior and placement remain open alongside matrix display settings.
    - Matrix row nodes can have edges of any kind.
- **Node labels**
  - Matrixes and views have plain text labels that must be valid SQLite aliases.
  - Matrix row node labels come from their label-role column if any. This column does not need to exist; but without one, matrix row nodes are not eligible for quick text-based discovery. Matrix row nodes with no label are displayed as just a field strip of their previewable fields, in the stream.
- **Matrix designations**
  - Default item matrix
    - There is always one, and only one, matrix assigned to this designation. The matrix must have at least label- and content-role columns. It can have other columns, too. The designation can be reassigned to another matrix, as long as it is eligible.
    - This matrix is the source of new matrix rows for a 'switch to default items' gesture (might also be named 'switch to notes', 'switch to bullets', etc.), that modifies the current insertion in place when it is not the default item type.
  - Aspect matrix
    - There can be 0 or more matrixes with this designation. These matrixes are eligible for 'quick-attach' or 'aspect' gestures (like using the `#` sigil in prose), using their label.
    - Matrixes created at the root level become these by default unless they are the default item matrix. The default item matrix is not eligible to be an aspect matrix.
- **Matrix display settings (provisional)**
  - Collapse is a display setting, not a matrix designation. Keep role terminology for columns.
  - The current proposal collapses and de-emphasizes selected matrixes by default and places them at the bottom of their home's navigation view. Plugin data-store matrixes motivate this behavior, but it could apply to any matrix.
  - Revisit this behavior together with collapsed inline results, the elsewhere-homed member view, and the homes and discoverability of plugin-created matrixes. Setting scope, defaults, placement, and persistence remain open; the current proposal is not a settled presentation contract.
- **Node insertion**
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
    - The attached node is considered a subordinate 'part' of the parent node, conceptually giving it an additional type and more fields.
    - A node can have any number of attached child nodes. A node can be attached to at most one parent node.
    - Attachments should be considered for 'is-a' queries such as "tasks under Project X". In other words, attachments impart their type and fields onto the parent node.
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
  - Scope
    - Passive - plugin declares a desired set of column roles or column types that a matrix must have to be eligible. If a matrix is eligible, it is automatically in scope.
      - Plugins can leave the desired set empty - in this case, they are effectively global.
    - Active - plugin declares a desired set of column roles or column types that a matrix must have to be eligible. The user must also actively mark the matrix as being in scope for the plugin.
  - Systems
    - Functions that run on schema updates, row updates, or timed schedules. They can make data changes, trigger actions - in general, do anything the user can do. The provisional display default for plugin-created matrixes is collapsed, with a plugin override. Revisit this default together with matrix display settings and plugin-created matrix homes.
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
    - Turn bullets with two prose and/or file-attachment parts into flashcards
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
