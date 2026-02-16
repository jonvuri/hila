# Architecture

## Objectives

- Create an app that combines the experiences of personal note taking / outlining and maintaining a personal database of spreadsheets into one unified experience.
- Focus on performance - the results of all interactions should take place in under 50ms, for a snappy and fluid feel.
- Focus on simplicity and composability - functionality that works completely and harmoniously together as a gestalt experience, rather than a disconnected suite of features.

## Development principles

### Incremental and intentional evolution

Only tackle complexity that is necessary right now. Don't build abstractions, frameworks, or systems ahead of proven need. At the same time, stay aware of high-level goals and potential future directions, and let that awareness inform today's decisions -- not by building for the future, but by not painting into corners.

Any aspect of the design or implementation may change as concrete outcomes reveal better approaches. Treat the architecture as a living document, not a fixed spec.

### Gestalt awareness

As the design and implementation evolve, every change should be considered in context of the whole. The architecture, code, and documentation should remain internally consistent, well-structured, and clean at all times -- not just locally correct but coherent as a unified whole.

This applies to documentation as much as code: when one part of the architecture changes, all related parts should be updated to reflect the change, so that the full picture is always accurate and navigable.

## Inspiration

- Obsidian
- Tana
- Linear
- Notion
- Airtable
- Google Sheets
- https://github.com/callumalpass/tasknotes/blob/main/docs/features/task-management.md

## Tech stack

### Local-first app

- The app is a Javascript app meant to run in a browser environment, but local-first and with no external dependencies - it runs as a local app once loaded and stores all of its data locally.
- In the future, asynchronous remote syncing of the database will be added, but syncing should occur in the background after optimistic local edits are made.

### Database (Local SQLite)

- All data is stored locally in SQLite, in the same browser environment (using the WASM SQLite build and web workers).

### Solid.js UI

- The app is built with Solid.js, a lightweight and super-performant reactive UI library, in order to serve the performance objectives.

## Layered architecture

The system is organized in four layers, from bottom to top:

```
┌───────────────────────────────────────────────┐
│  Plugins (user-facing)                        │
│  ┌──────────┐ ┌──────┐ ┌────────┐ ┌─────┐     │
│  │ Outline  │ │ Tags │ │ Kanban │ │ ... │     │
│  └──────────┘ └──────┘ └────────┘ └─────┘     │
├───────────────────────────────────────────────┤
│  Structural primitives (core building blocks) │
│  ┌──────────┐ ┌─────────┐ ┌──────┐            │
│  │  Rank    │ │ Closure │ │ Join │            │
│  └──────────┘ └─────────┘ └──────┘            │
├───────────────────────────────────────────────┤
│  Core                                         │
│  ┌──────────────────┐ ┌──────────────────┐    │
│  │ Matrix registry  │ │ Plugin system    │    │
│  │ + data tables    │ │ + face registry  │    │
│  └──────────────────┘ └──────────────────┘    │
├───────────────────────────────────────────────┤
│  SQLite (storage)                             │
└───────────────────────────────────────────────┘
```

### Core

The core provides the foundation: creating and managing **matrixes** (typed data tables), a **plugin system** for registering plugins and faces, and raw SQLite access.

### Structural primitives

The core provides a small set of well-optimized, well-tested structural building blocks that plugins can request for their matrixes. These are not plugins themselves -- they are capabilities that the core provisions and manages on behalf of plugins. See [Primitives](./Primitives.md) for detailed specs.

- **Rank** -- Lexorank-based entry ordering within a scope.
- **Closure** -- ancestor/descendant hierarchy tracking.
- **Join** -- cross-matrix row references.

### Plugins

Plugins compose core matrixes and structural primitives to provide user-facing functionality. Each plugin can create matrixes, request primitives for them, and register faces. See [Plugins](./Plugins.md) for the plugin model and concrete examples.

### Faces

Faces are the views and interaction surfaces that plugins provide. They update optimistically with user input and propagate updates to underlying data asynchronously. If updates fail, faces retry and get user input if intervention is needed.

Faces always interact with matrixes somehow but don't necessarily correspond to any fixed set of entries. They can represent:

- One or more matrix entries or parts of entries.
- Forms to insert new entries.
- Arbitrary SQLite queries over data tables.
- Composite views that span multiple plugins' data.

## Core concepts

### Matrix

- **Matrixes** are the elemental data container of the app. A matrix is a typed SQLite data table with a schema (columns and types).
- Matrixes exist independently. A matrix exists because it is registered in the matrix registry table and has a corresponding data table. Being placed in an outline or referenced from another matrix is **not** a requirement for existence -- it is one way to surface a matrix, provided by plugins.
- A matrix's data table is a normal, user-expandable SQLite rowid table. Columns use default settings (no extra constraints), but can otherwise contain any kind of data.
- Matrixes can be created by users, by plugins, or programmatically. The matrix registry may include metadata (such as a `source` or `plugin_id`) to track provenance.

### Entry

- **Entries** are the addressable units within a matrix. Each entry has a type (its `entry_kind`) and a locally unique ID within the matrix.
- Entry kinds include:
  - **Data row** (`entry_kind = 0`) -- a row in the matrix's data table.
  - **Child matrix reference** (`entry_kind = 1`) -- a reference to another matrix, anchoring it at this position.
  - Potentially more kinds in the future.

## UI concepts

- Performance is king - everything in a single frame.
- Simple, obvious keyboard shortcuts for everything.
- Outline is maximally easy to work with as an outline.
  - Drag-and-drop reordering with handles.
