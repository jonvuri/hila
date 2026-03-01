type ShortcutHandler = () => boolean | void

type ShortcutBinding = {
  key: string
  handler: ShortcutHandler
  context?: string
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const normalizeKeyEvent = (e: KeyboardEvent): string => {
  const parts: string[] = []
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod) parts.push('Mod')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  let key = e.key
  if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('-')
}

const createShortcutManager = () => {
  const bindings = new Map<string, ShortcutBinding[]>()
  let activeContext = 'global'
  let installed = false

  const register = (binding: ShortcutBinding): (() => void) => {
    const list = bindings.get(binding.key) ?? []
    list.push(binding)
    bindings.set(binding.key, list)

    return () => {
      const list = bindings.get(binding.key)
      if (list) {
        const idx = list.indexOf(binding)
        if (idx !== -1) list.splice(idx, 1)
        if (list.length === 0) bindings.delete(binding.key)
      }
    }
  }

  const setContext = (context: string) => {
    activeContext = context
  }

  const getContext = () => activeContext

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return

    const key = normalizeKeyEvent(e)
    const list = bindings.get(key)
    if (!list) return

    for (const binding of list) {
      const ctx = binding.context ?? 'global'
      if (ctx === 'global' || ctx === activeContext) {
        const result = binding.handler()
        if (result !== false) {
          e.preventDefault()
          return
        }
      }
    }
  }

  const install = () => {
    if (installed) return
    document.addEventListener('keydown', handleKeydown)
    installed = true
  }

  const uninstall = () => {
    if (!installed) return
    document.removeEventListener('keydown', handleKeydown)
    installed = false
  }

  return { register, setContext, getContext, install, uninstall }
}

export const shortcuts = createShortcutManager()
export type { ShortcutBinding }
