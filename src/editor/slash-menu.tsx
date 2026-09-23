import { Show, createSignal } from 'solid-js'
import { render } from 'solid-js/web'

import { AnchoredOverlay, type OverlayAnchor } from '../design/overlay/Overlay'
import { SelectableList, type SelectableListItem } from '../design/overlay/SelectableList'

export type SlashMenuItem = SelectableListItem

export type SlashMenuModel = {
  open: boolean
  anchor: OverlayAnchor
  items: readonly SlashMenuItem[]
  selectedId: string | null
}

export type SlashMenu = {
  update: (model: SlashMenuModel) => void
  destroy: () => void
}

type SlashMenuCallbacks = {
  focusOwner: () => HTMLElement
  onSelectedIdChange: (id: string) => void
  onActivate: (id: string) => void
  onDismiss: () => void
}

let nextMenuId = 0

export const createSlashMenu = (callbacks: SlashMenuCallbacks): SlashMenu => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const listId = `slash-command-list-${++nextMenuId}`
  const [model, setModel] = createSignal<SlashMenuModel>({
    open: false,
    anchor: { left: 0, right: 0, top: 0, bottom: 0 },
    items: [],
    selectedId: null,
  })

  const dispose = render(
    () => (
      <Show when={model().open && model().items.length > 0}>
        <AnchoredOverlay
          anchor={model().anchor}
          restoreFocusTo={callbacks.focusOwner()}
          class="slash-autocomplete"
          testId="slash-autocomplete"
          onDismiss={callbacks.onDismiss}
        >
          <SelectableList
            id={listId}
            items={model().items}
            selectedId={model().selectedId}
            ariaLabel="Slash commands"
            focusable={false}
            focusOwner={callbacks.focusOwner()}
            onSelectedIdChange={(id) => callbacks.onSelectedIdChange(id)}
            onActivate={(item) => callbacks.onActivate(item.id)}
          />
        </AnchoredOverlay>
      </Show>
    ),
    host,
  )

  return {
    update: setModel,
    destroy: () => {
      dispose()
      host.remove()
    },
  }
}
