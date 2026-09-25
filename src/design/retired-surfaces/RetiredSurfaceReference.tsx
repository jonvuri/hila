import { For, Show } from 'solid-js'

import {
  retiredTableColumns,
  retiredTableRows,
  retiredTagInstances,
  retiredTagTypes,
} from './fixtures'
import styles from './RetiredSurfaceReference.module.css'

export type RetiredTableState = 'schema' | 'cells' | 'sorted' | 'editing'
export type RetiredTagsState = 'list' | 'instances' | 'create' | 'context'

const TableReference = (props: { state: RetiredTableState }) => (
  <section class={styles.surface} aria-label={`Retired Table reference: ${props.state}`}>
    <header class={styles.header}>
      <div>
        <small>Retired top-level surface</small>
        <h2>Table</h2>
      </div>
      <div class={styles.actions}>
        <button type="button">+ Filter</button>
        <button type="button" aria-label="Add column">
          + Column
        </button>
      </div>
    </header>

    <Show when={props.state === 'schema'}>
      <div class={styles.schema} data-testid="retired-table-schema">
        <For each={retiredTableColumns}>
          {(column) => (
            <div class={styles.schemaRow}>
              <strong>{column.label}</strong>
              <span>{column.type}</span>
              <span>{column.role ?? 'field'}</span>
            </div>
          )}
        </For>
      </div>
    </Show>

    <Show when={props.state === 'sorted'}>
      <div class={styles.filterBar} data-testid="retired-table-sort">
        Sorted by Due <strong>↑</strong>
      </div>
    </Show>

    <div class={styles.tableScroll}>
      <table class={styles.table}>
        <thead>
          <tr>
            <For each={retiredTableColumns}>
              {(column) => (
                <th scope="col">
                  {column.label}
                  <Show when={props.state === 'sorted' && column.key === 'due'}> ↑</Show>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={retiredTableRows}>
            {(row, rowIndex) => (
              <tr>
                <For each={retiredTableColumns}>
                  {(column) => {
                    const editing = () =>
                      props.state === 'editing' && rowIndex() === 0 && column.key === 'status'
                    const selected = () =>
                      props.state === 'cells' && rowIndex() === 1 && column.key === 'score'
                    return (
                      <td classList={{ [styles.selected!]: selected() }}>
                        <Show when={editing()} fallback={row.cells[column.key]}>
                          <input
                            aria-label="Edit Status"
                            value={row.cells[column.key]}
                            readOnly
                          />
                        </Show>
                      </td>
                    )
                  }}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
    <button class={styles.addRow} type="button">
      + New Row
    </button>
  </section>
)

const TagBadge = (props: { name: string }) => <span class={styles.tagBadge}>#{props.name}</span>

const TagsReference = (props: { state: RetiredTagsState }) => {
  const showingInstances = () => props.state === 'instances'

  return (
    <section class={styles.surface} aria-label={`Retired Tags reference: ${props.state}`}>
      <header class={styles.header}>
        <div>
          <small>Retired top-level surface</small>
          <Show when={showingInstances()} fallback={<h2>Tags</h2>}>
            <div class={styles.breadcrumb}>
              <button type="button">← Tags</button>
              <TagBadge name="task" />
            </div>
          </Show>
        </div>
        <Show
          when={!showingInstances()}
          fallback={<button type="button">View all in table</button>}
        >
          <button type="button">+ New Tag Type</button>
        </Show>
      </header>

      <Show when={props.state === 'create'}>
        <form class={styles.createForm} data-testid="retired-tags-create">
          <label for="retired-tag-name">Tag type name</label>
          <div>
            <input id="retired-tag-name" name="tag-name" value="priority" readOnly />
            <button type="button">Create</button>
          </div>
        </form>
      </Show>

      <Show
        when={showingInstances()}
        fallback={
          <div class={styles.tagList} data-testid="retired-tags-list">
            <For each={retiredTagTypes}>
              {(tag) => (
                <button class={styles.tagRow} type="button">
                  <TagBadge name={tag.name} />
                  <span>
                    {tag.count} {tag.count === 1 ? 'instance' : 'instances'}
                  </span>
                </button>
              )}
            </For>
          </div>
        }
      >
        <div class={styles.instances} data-testid="retired-tag-instances">
          <h3>Workspace and owned matrix instances</h3>
          <For each={retiredTagInstances}>
            {(instance) => (
              <button type="button">
                <strong>{instance.snippet}</strong>
                <span>{instance.source}</span>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.state === 'context'}>
        <div class={styles.contextStage}>
          <div class={styles.contextMenu} role="menu" aria-label="Tag type actions">
            <button role="menuitem" type="button">
              Rename
            </button>
            <button role="menuitem" type="button">
              Open identity face
            </button>
            <button role="menuitem" type="button">
              Delete tag type
            </button>
          </div>
        </div>
      </Show>
    </section>
  )
}

export type RetiredSurfaceReferenceProps =
  | { readonly surface: 'table'; readonly state: RetiredTableState }
  | { readonly surface: 'tags'; readonly state: RetiredTagsState }

const RetiredSurfaceReference = (props: RetiredSurfaceReferenceProps) => (
  <div class={styles.frame} data-retired-surface={props.surface}>
    <Show
      when={props.surface === 'table'}
      fallback={<TagsReference state={(props as { state: RetiredTagsState }).state} />}
    >
      <TableReference state={(props as { state: RetiredTableState }).state} />
    </Show>
  </div>
)

export default RetiredSurfaceReference
