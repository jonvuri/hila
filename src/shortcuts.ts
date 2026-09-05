type ShortcutHandler = () => boolean | void

type ShortcutPlatform = 'mac' | 'other'

type ShortcutDescriptor = {
  id: string
  title: string
  key: string
  context?: string
}

type ShortcutBinding = ShortcutDescriptor & {
  handler: ShortcutHandler
}

const getShortcutPlatform = (platform?: string): ShortcutPlatform => {
  const value = platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform)
  return /Mac|iPod|iPhone|iPad/.test(value) ? 'mac' : 'other'
}

const normalizeShortcutKey = (key: string): string => {
  const parts = key.split('-')
  const finalPart = parts.at(-1)!
  if (finalPart.length === 1) parts[parts.length - 1] = finalPart.toUpperCase()
  return parts.join('-')
}

const normalizeKeyEvent = (
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string => {
  const parts: string[] = []
  const mod = platform === 'mac' ? event.metaKey : event.ctrlKey
  if (mod) parts.push('Mod')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  parts.push(event.key)
  return normalizeShortcutKey(parts.join('-'))
}

const displayShortcutKey = (key: string, platform: ShortcutPlatform): string => {
  const labels =
    platform === 'mac' ?
      {
        Mod: '⌘',
        Shift: '⇧',
        Alt: '⌥',
        Ctrl: '⌃',
        Enter: '↵',
        Backspace: '⌫',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
      }
    : {
        Mod: 'Ctrl',
        Shift: 'Shift',
        Alt: 'Alt',
        Ctrl: 'Ctrl',
        Enter: 'Enter',
        Backspace: 'Backspace',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
      }
  const separator = platform === 'mac' ? '' : '+'

  return normalizeShortcutKey(key)
    .split('-')
    .map((part) => labels[part as keyof typeof labels] ?? part)
    .join(separator)
}

const collectShortcutDescriptors = (
  ...groups: readonly (readonly ShortcutDescriptor[])[]
): readonly ShortcutDescriptor[] =>
  groups.flatMap((group) => group.map((descriptor) => ({ ...descriptor })))

const createShortcutManager = (platform: ShortcutPlatform = getShortcutPlatform()) => {
  const bindings = new Map<string, ShortcutBinding[]>()
  const registrations: ShortcutBinding[] = []
  const registeredIds = new Set<string>()
  let activeContext = 'global'
  let installed = false

  const register = (binding: ShortcutBinding): (() => void) => {
    if (registeredIds.has(binding.id)) {
      throw new Error(`Shortcut already registered: ${binding.id}`)
    }

    const registeredBinding = { ...binding }
    const normalizedKey = normalizeShortcutKey(registeredBinding.key)
    const list = bindings.get(normalizedKey) ?? []
    list.push(registeredBinding)
    bindings.set(normalizedKey, list)
    registrations.push(registeredBinding)
    registeredIds.add(registeredBinding.id)

    return () => {
      if (!registeredIds.delete(registeredBinding.id)) return

      const list = bindings.get(normalizedKey)
      if (list) {
        const index = list.indexOf(registeredBinding)
        if (index !== -1) list.splice(index, 1)
        if (list.length === 0) bindings.delete(normalizedKey)
      }

      const registrationIndex = registrations.indexOf(registeredBinding)
      if (registrationIndex !== -1) registrations.splice(registrationIndex, 1)
    }
  }

  const getDescriptors = (): readonly ShortcutDescriptor[] =>
    registrations.map(({ handler: _handler, ...descriptor }) => ({ ...descriptor }))

  const setContext = (context: string) => {
    activeContext = context
  }

  const getContext = () => activeContext

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return

    const key = normalizeKeyEvent(event, platform)
    const list = bindings.get(key)
    if (!list) return

    for (const binding of list) {
      const context = binding.context ?? 'global'
      if (context === 'global' || context === activeContext) {
        const result = binding.handler()
        if (result !== false) {
          event.preventDefault()
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

  return { register, getDescriptors, setContext, getContext, install, uninstall }
}

export const shortcuts = createShortcutManager()
export {
  collectShortcutDescriptors,
  createShortcutManager,
  displayShortcutKey,
  getShortcutPlatform,
  normalizeKeyEvent,
  normalizeShortcutKey,
}
export type { ShortcutBinding, ShortcutDescriptor, ShortcutPlatform }
