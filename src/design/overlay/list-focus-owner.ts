const focusOwnerAttributeNames = [
  'aria-activedescendant',
  'aria-controls',
  'aria-expanded',
  'aria-haspopup',
  'aria-autocomplete',
] as const

let nextListboxId = 0

export const createListboxId = (prefix: string): string => `${prefix}-${++nextListboxId}`

export const listboxOptionId = (listId: string, itemId: string): string =>
  `${listId}-option-${encodeURIComponent(itemId)}`

export type ListFocusOwnerConnection = {
  setActiveDescendant: (optionId: string | null) => void
  restore: () => void
}

export const connectListFocusOwner = (
  owner: HTMLElement,
  listId: string,
): ListFocusOwnerConnection => {
  const previousAttributes = new Map(
    focusOwnerAttributeNames.map((name) => [name, owner.getAttribute(name)] as const),
  )
  let connected = true

  owner.setAttribute('aria-controls', listId)
  owner.setAttribute('aria-expanded', 'true')
  owner.setAttribute('aria-haspopup', 'listbox')
  owner.setAttribute('aria-autocomplete', 'list')

  return {
    setActiveDescendant(optionId) {
      if (!connected) return
      if (optionId) owner.setAttribute('aria-activedescendant', optionId)
      else owner.removeAttribute('aria-activedescendant')
    },
    restore() {
      if (!connected) return
      connected = false
      for (const [name, value] of previousAttributes) {
        if (value === null) owner.removeAttribute(name)
        else owner.setAttribute(name, value)
      }
    },
  }
}
