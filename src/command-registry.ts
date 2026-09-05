import type { NodeRef } from './core/tree'

export type CommandSurface = 'slash' | 'launcher'

export type CommandInvocationCapabilities = {
  focusCreatedTable?: (matrixId: number) => void
  openTypePicker?: (subject: NodeRef) => void
}

export type CommandInvocationContext = {
  surface: CommandSurface
  subject?: NodeRef
  capabilities: CommandInvocationCapabilities
}

// If a future descriptor adds another nested property, make that value readonly here and copy and
// freeze it in `freezeCommandDescriptor` below.
export type CommandDescriptor = {
  readonly id: `${string}.${string}`
  readonly label: string
  readonly keywords: readonly string[]
  readonly surfaces: readonly CommandSurface[]
  readonly subject: 'required' | 'none'
  readonly unavailableReason?: (context: CommandInvocationContext) => string | null
  readonly run: (context: CommandInvocationContext) => void | Promise<void>
}

export type CommandEntry = {
  readonly command: CommandDescriptor
  readonly unavailableReason: string | null
}

export class CommandUnavailableError extends Error {
  constructor(
    readonly commandId: string,
    message: string,
  ) {
    super(message)
    this.name = 'CommandUnavailableError'
  }
}

const subjectUnavailableReason = 'This command requires a node.'

const reasonFor = (
  command: CommandDescriptor,
  context: CommandInvocationContext,
): string | null => {
  if (command.subject === 'required' && !context.subject) return subjectUnavailableReason
  return command.unavailableReason?.(context) ?? null
}

const matches = (command: CommandDescriptor, query: string): boolean => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  const localId = command.id.slice(command.id.lastIndexOf('.') + 1)
  return (
    command.id.toLowerCase().startsWith(normalized) ||
    localId.toLowerCase().startsWith(normalized) ||
    command.keywords.some((keyword) => keyword.toLowerCase().startsWith(normalized)) ||
    command.label.toLowerCase().includes(normalized)
  )
}

// Keep this targeted immutable copy in sync with any nested properties added to
// `CommandDescriptor`; the scalar and callable properties are covered by the frozen outer object.
const freezeCommandDescriptor = (descriptor: CommandDescriptor): CommandDescriptor =>
  Object.freeze({
    ...descriptor,
    keywords: Object.freeze([...descriptor.keywords]),
    surfaces: Object.freeze([...descriptor.surfaces]),
  })

export const createCommandRegistry = () => {
  const commandsById = new Map<string, CommandDescriptor>()
  const commandsByOwner = new Map<string, readonly CommandDescriptor[]>()
  const pendingOwners = new Map<
    string,
    { readonly token: symbol; readonly descriptors: readonly CommandDescriptor[] }
  >()
  const ownerVersions = new Map<string, number>()

  const rebuildCommandIndex = (): void => {
    commandsById.clear()
    for (const descriptors of commandsByOwner.values()) {
      for (const descriptor of descriptors) commandsById.set(descriptor.id, descriptor)
    }
  }

  const list = (): readonly CommandDescriptor[] => Object.freeze([...commandsById.values()])

  const entries = (context: CommandInvocationContext): readonly CommandEntry[] =>
    Object.freeze(
      list()
        .filter((command) => command.surfaces.includes(context.surface))
        .map((command) =>
          Object.freeze({ command, unavailableReason: reasonFor(command, context) }),
        ),
    )

  const match = (query: string, context: CommandInvocationContext): readonly CommandEntry[] =>
    Object.freeze(entries(context).filter(({ command }) => matches(command, query)))

  const unregisterOwner = (ownerId: string): void => {
    pendingOwners.delete(ownerId)
    commandsByOwner.delete(ownerId)
    rebuildCommandIndex()
    ownerVersions.set(ownerId, (ownerVersions.get(ownerId) ?? 0) + 1)
  }

  const prepareOwner = (ownerId: string, descriptors: readonly CommandDescriptor[]) => {
    // A newer preparation supersedes any pending work for the same owner, even if validation fails.
    pendingOwners.delete(ownerId)

    const nextIds = new Set<string>()
    const previousIds = new Set(
      (commandsByOwner.get(ownerId) ?? []).map((descriptor) => descriptor.id),
    )

    for (const descriptor of descriptors) {
      if (nextIds.has(descriptor.id)) {
        throw new Error(`Duplicate command ID "${descriptor.id}" in owner "${ownerId}"`)
      }
      nextIds.add(descriptor.id)

      if (commandsById.has(descriptor.id) && !previousIds.has(descriptor.id)) {
        throw new Error(`Command ID "${descriptor.id}" is already registered`)
      }

      for (const [pendingOwnerId, pending] of pendingOwners) {
        if (
          pendingOwnerId !== ownerId &&
          pending.descriptors.some(({ id }) => id === descriptor.id)
        ) {
          throw new Error(`Command ID "${descriptor.id}" is already registered`)
        }
      }
    }

    const token = Symbol(ownerId)
    const frozenDescriptors = Object.freeze(descriptors.map(freezeCommandDescriptor))
    pendingOwners.set(ownerId, { token, descriptors: frozenDescriptors })

    const cancel = (): void => {
      if (pendingOwners.get(ownerId)?.token === token) pendingOwners.delete(ownerId)
    }

    const commit = (): (() => void) | null => {
      const pending = pendingOwners.get(ownerId)
      if (pending?.token !== token) return null

      pendingOwners.delete(ownerId)
      commandsByOwner.set(ownerId, pending.descriptors)
      rebuildCommandIndex()

      const version = (ownerVersions.get(ownerId) ?? 0) + 1
      ownerVersions.set(ownerId, version)

      return () => {
        if (ownerVersions.get(ownerId) === version) unregisterOwner(ownerId)
      }
    }

    return { cancel, commit }
  }

  const replaceOwner = (
    ownerId: string,
    descriptors: readonly CommandDescriptor[],
  ): (() => void) => {
    const dispose = prepareOwner(ownerId, descriptors).commit()
    if (!dispose) throw new Error(`Command registration for owner "${ownerId}" was superseded`)

    return dispose
  }

  const invoke = async (id: string, context: CommandInvocationContext): Promise<void> => {
    const command = commandsById.get(id)
    if (!command) throw new Error(`Unknown command "${id}"`)
    if (!command.surfaces.includes(context.surface)) {
      throw new CommandUnavailableError(id, `Command "${id}" is unavailable on this surface.`)
    }

    const unavailableReason = reasonFor(command, context)
    if (unavailableReason) throw new CommandUnavailableError(id, unavailableReason)
    await command.run(context)
  }

  return { list, entries, match, prepareOwner, replaceOwner, unregisterOwner, invoke }
}

export const commandRegistry = createCommandRegistry()
