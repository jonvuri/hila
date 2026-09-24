import { For, Show, createEffect, createUniqueId, onCleanup, onMount } from 'solid-js'

import styles from './SelectableList.module.css'

export type SelectableListItemAppearance = 'default' | 'invalid' | 'opaque'

export type SelectableListItem = {
  id: string
  label: string
  description?: string
  meta?: string
  mark?: string
  markLabel?: string
  unavailableReason?: string
  appearance?: SelectableListItemAppearance
  group?: string
}

export type SelectableListGroup = {
  readonly id: string
  readonly label: string
  readonly emptyMessage?: string
}

export type SelectableListSelectionSource = 'keyboard' | 'pointer'

export type SelectableListAction =
  | { type: 'select'; id: string }
  | { type: 'activate'; id: string }

export type SelectableListProps<Item extends SelectableListItem = SelectableListItem> = {
  items: readonly Item[]
  selectedId: string | null
  onSelectedIdChange: (id: string, source: SelectableListSelectionSource) => void
  onActivate: (item: Item) => void
  onMarkActivate?: (item: Item) => void
  ariaLabel: string
  id?: string
  emptyMessage?: string
  invalid?: boolean
  focusable?: boolean
  focusOwner?: HTMLElement
  groups?: readonly SelectableListGroup[]
}

const optionId = (listId: string, itemId: string): string =>
  `${listId}-option-${encodeURIComponent(itemId)}`

const itemForId = <Item extends SelectableListItem>(
  items: readonly Item[],
  id: string | null,
): Item | undefined => (id === null ? undefined : items.find((item) => item.id === id))

export const getInitialSelectableListId = <Item extends SelectableListItem>(
  items: readonly Item[],
  selectedId: string | null = null,
): string | null => itemForId(items, selectedId)?.id ?? items[0]?.id ?? null

export const getSelectableListAction = <Item extends SelectableListItem>(
  items: readonly Item[],
  selectedId: string | null,
  key: string,
): SelectableListAction | null => {
  if (items.length === 0) return null

  const currentIndex = items.findIndex((item) => item.id === selectedId)
  switch (key) {
    case 'ArrowDown':
      return { type: 'select', id: items[(currentIndex + 1) % items.length]!.id }
    case 'ArrowUp': {
      const previousIndex = currentIndex < 0 ? items.length - 1 : currentIndex - 1
      return {
        type: 'select',
        id: items[(previousIndex + items.length) % items.length]!.id,
      }
    }
    case 'Home':
      return { type: 'select', id: items[0]!.id }
    case 'End':
      return { type: 'select', id: items[items.length - 1]!.id }
    case 'Enter':
      return selectedId === null || currentIndex < 0 ?
          null
        : { type: 'activate', id: selectedId }
    default:
      return null
  }
}

const attributeNames = [
  'aria-activedescendant',
  'aria-controls',
  'aria-expanded',
  'aria-haspopup',
  'aria-autocomplete',
] as const

export const SelectableList = <Item extends SelectableListItem>(
  props: SelectableListProps<Item>,
) => {
  const generatedId = createUniqueId()
  const listId = () => props.id ?? `selectable-list-${generatedId}`
  const selectedItem = () => itemForId(props.items, props.selectedId)
  const selectedAnnouncement = () => {
    const item = selectedItem()
    if (!item) return ''
    return item.unavailableReason ?
        `${item.label}. Unavailable: ${item.unavailableReason}`
      : `${item.label} selected`
  }
  let listElement: HTMLDivElement | undefined

  onMount(() => {
    const owner = props.focusOwner
    if (!owner) return

    const previousAttributes = new Map(
      attributeNames.map((name) => [name, owner.getAttribute(name)] as const),
    )

    createEffect(() => {
      owner.setAttribute('aria-controls', listId())
      owner.setAttribute('aria-expanded', 'true')
      owner.setAttribute('aria-haspopup', 'listbox')
      owner.setAttribute('aria-autocomplete', 'list')
      const activeId = selectedItem()?.id
      if (activeId) owner.setAttribute('aria-activedescendant', optionId(listId(), activeId))
      else owner.removeAttribute('aria-activedescendant')
    })

    onCleanup(() => {
      for (const [name, value] of previousAttributes) {
        if (value === null) owner.removeAttribute(name)
        else owner.setAttribute(name, value)
      }
    })
  })

  createEffect(() => {
    const activeId = selectedItem()?.id
    if (!activeId) return
    const activeOptionId = optionId(listId(), activeId)
    queueMicrotask(() => {
      const option = document.getElementById(activeOptionId)
      if (option && listElement?.contains(option)) option.scrollIntoView?.({ block: 'nearest' })
    })
  })

  const handleKeyDown = (event: KeyboardEvent) => {
    const action = getSelectableListAction(props.items, props.selectedId, event.key)
    if (!action) return
    event.preventDefault()
    if (action.type === 'select') {
      props.onSelectedIdChange(action.id, 'keyboard')
      return
    }
    const item = itemForId(props.items, action.id)
    if (item && !item.unavailableReason) props.onActivate(item)
  }

  const renderOption = (item: Item) => {
    const reasonId = () => `${optionId(listId(), item.id)}-reason`
    const selected = () => item.id === props.selectedId
    return (
      <div
        id={optionId(listId(), item.id)}
        class={styles.option}
        role="option"
        aria-selected={selected()}
        aria-disabled={item.unavailableReason ? 'true' : undefined}
        aria-describedby={item.unavailableReason ? reasonId() : undefined}
        data-selected={selected() || undefined}
        data-appearance={item.appearance ?? 'default'}
        onPointerMove={(event) => {
          if (event.pointerType === 'touch') return
          if (!selected()) props.onSelectedIdChange(item.id, 'pointer')
        }}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!selected()) props.onSelectedIdChange(item.id, 'pointer')
          if (!item.unavailableReason) props.onActivate(item)
        }}
      >
        <Show when={item.mark}>
          <span
            class={styles.mark}
            title={item.markLabel}
            aria-hidden="true"
            onPointerDown={(event) => {
              if (!props.onMarkActivate) return
              event.preventDefault()
              event.stopPropagation()
              props.onMarkActivate(item)
            }}
          >
            {item.mark}
          </span>
        </Show>
        <span class={styles.copy}>
          <span class={styles.label}>{item.label}</span>
          <Show when={item.description}>
            <span class={styles.description}>{item.description}</span>
          </Show>
          <Show when={item.unavailableReason}>
            <span id={reasonId()} class={styles.reason}>
              {item.unavailableReason}
            </span>
          </Show>
        </span>
        <Show when={item.meta}>
          <span class={styles.meta}>{item.meta}</span>
        </Show>
      </div>
    )
  }

  const ungroupedItems = () =>
    props.groups ? props.items.filter((item) => item.group == null) : []

  return (
    <div class={styles.root} data-invalid={props.invalid || undefined}>
      <div
        ref={listElement}
        id={listId()}
        class={styles.list}
        role="listbox"
        aria-label={props.ariaLabel}
        aria-activedescendant={
          !props.focusOwner && selectedItem() ?
            optionId(listId(), selectedItem()!.id)
          : undefined
        }
        aria-invalid={props.invalid || undefined}
        data-empty={props.items.length === 0 || undefined}
        tabindex={props.focusable === false ? -1 : 0}
        onKeyDown={handleKeyDown}
      >
        <Show when={props.groups} fallback={<For each={props.items}>{renderOption}</For>}>
          {(groups) => (
            <For each={groups()}>
              {(group) => {
                const items = () => props.items.filter((item) => item.group === group.id)
                return (
                  <div
                    class={styles.group}
                    role="group"
                    aria-label={group.label}
                    data-list-group={group.id}
                  >
                    <div class={styles.groupLabel} role="presentation">
                      {group.label}
                    </div>
                    <For each={items()}>{renderOption}</For>
                    <Show when={items().length === 0}>
                      <div class={styles.groupEmpty} role="presentation">
                        {group.emptyMessage ?? 'None yet'}
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          )}
        </Show>
        <For each={ungroupedItems()}>{renderOption}</For>
        <Show when={props.items.length === 0 && !props.groups}>
          <div class={styles.empty} role="presentation">
            {props.emptyMessage ?? 'No results'}
          </div>
        </Show>
      </div>
      <div class={styles.status} role="status" aria-live="polite" aria-atomic="true">
        {selectedAnnouncement()}
      </div>
    </div>
  )
}
