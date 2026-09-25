import { createMemo, createSignal, Show, type Component, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import type { NodeRef } from './tree'
import type { FaceAffinity } from './face-affinity'
import type { FaceRecipe, FaceSubject } from './face-types'

export type FaceRenderingKind = 'line' | 'collection'

export type FaceInsertionRequest = {
  readonly values?: Readonly<Record<string, unknown>>
  readonly after?: NodeRef
}

/**
 * Capabilities supplied by the host to an interior rendering.
 *
 * The host owns navigation, insertion policy, and recursive placement. Faces can request those
 * operations or yield a nested subject, but they never receive shell DOM or mount another face.
 */
export type FaceHostServices = Readonly<{
  requestNavigation?: (target: NodeRef) => void
  requestInsert?: (request: FaceInsertionRequest) => Promise<NodeRef>
  yieldSubject?: (subject: FaceSubject) => void
}>

export const EMPTY_FACE_HOST_SERVICES: FaceHostServices = Object.freeze({})

export type FaceRenderingProps = {
  subject: FaceSubject
  recipe: FaceRecipe
  rootMatrixId: number
  services: FaceHostServices
}

export type FaceRenderRegistration = Partial<
  Record<FaceRenderingKind, Component<FaceRenderingProps>>
>

export type FaceRenderingContribution = FaceRenderRegistration & {
  readonly faceTypeId: string
}

const renderingKey = (faceTypeId: string, kind: FaceRenderingKind): string =>
  `${faceTypeId}:${kind}`

const copyContribution = (contribution: FaceRenderingContribution): FaceRenderingContribution =>
  Object.freeze({
    faceTypeId: contribution.faceTypeId,
    ...(contribution.line ? { line: contribution.line } : {}),
    ...(contribution.collection ? { collection: contribution.collection } : {}),
  })

export const createFaceRenderingRegistry = () => {
  const renderingsByKey = new Map<string, Component<FaceRenderingProps>>()
  const contributionsByOwner = new Map<string, readonly FaceRenderingContribution[]>()
  const pendingOwners = new Map<
    string,
    { readonly token: symbol; readonly contributions: readonly FaceRenderingContribution[] }
  >()
  const ownerVersions = new Map<string, number>()
  const [revision, setRevision] = createSignal(0)

  const rebuildIndex = (): void => {
    renderingsByKey.clear()
    for (const contributions of contributionsByOwner.values()) {
      for (const contribution of contributions) {
        if (contribution.line) {
          renderingsByKey.set(renderingKey(contribution.faceTypeId, 'line'), contribution.line)
        }
        if (contribution.collection) {
          renderingsByKey.set(
            renderingKey(contribution.faceTypeId, 'collection'),
            contribution.collection,
          )
        }
      }
    }
    setRevision((current) => current + 1)
  }

  const get = (
    faceTypeId: string,
    kind: FaceRenderingKind,
  ): Component<FaceRenderingProps> | undefined => {
    revision()
    return renderingsByKey.get(renderingKey(faceTypeId, kind))
  }

  const unregisterOwner = (ownerId: string): void => {
    pendingOwners.delete(ownerId)
    contributionsByOwner.delete(ownerId)
    rebuildIndex()
    ownerVersions.set(ownerId, (ownerVersions.get(ownerId) ?? 0) + 1)
  }

  const prepareOwner = (
    ownerId: string,
    contributions: readonly FaceRenderingContribution[],
  ) => {
    pendingOwners.delete(ownerId)

    const nextKeys = new Set<string>()
    const previousKeys = new Set<string>()
    for (const contribution of contributionsByOwner.get(ownerId) ?? []) {
      if (contribution.line) previousKeys.add(renderingKey(contribution.faceTypeId, 'line'))
      if (contribution.collection) {
        previousKeys.add(renderingKey(contribution.faceTypeId, 'collection'))
      }
    }

    for (const contribution of contributions) {
      const kinds: FaceRenderingKind[] = [
        ...(contribution.line ? (['line'] as const) : []),
        ...(contribution.collection ? (['collection'] as const) : []),
      ]
      if (kinds.length === 0) {
        throw new Error(`Face rendering "${contribution.faceTypeId}" has no interiors`)
      }

      for (const kind of kinds) {
        const key = renderingKey(contribution.faceTypeId, kind)
        if (nextKeys.has(key)) {
          throw new Error(`Duplicate ${kind} rendering for "${contribution.faceTypeId}"`)
        }
        nextKeys.add(key)

        if (renderingsByKey.has(key) && !previousKeys.has(key)) {
          throw new Error(
            `${kind} rendering for "${contribution.faceTypeId}" is already registered`,
          )
        }

        for (const [pendingOwnerId, pending] of pendingOwners) {
          if (pendingOwnerId === ownerId) continue
          const reserved = pending.contributions.some(
            (candidate) =>
              candidate.faceTypeId === contribution.faceTypeId && Boolean(candidate[kind]),
          )
          if (reserved) {
            throw new Error(
              `${kind} rendering for "${contribution.faceTypeId}" is already registered`,
            )
          }
        }
      }
    }

    const token = Symbol(ownerId)
    const frozenContributions = Object.freeze(contributions.map(copyContribution))
    pendingOwners.set(ownerId, { token, contributions: frozenContributions })

    const cancel = (): void => {
      if (pendingOwners.get(ownerId)?.token === token) pendingOwners.delete(ownerId)
    }

    const commit = (): (() => void) | null => {
      const pending = pendingOwners.get(ownerId)
      if (pending?.token !== token) return null

      pendingOwners.delete(ownerId)
      contributionsByOwner.set(ownerId, pending.contributions)
      rebuildIndex()

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
    contributions: readonly FaceRenderingContribution[],
  ): (() => void) => {
    const dispose = prepareOwner(ownerId, contributions).commit()
    if (!dispose) {
      throw new Error(`Face rendering registration for owner "${ownerId}" was superseded`)
    }
    return dispose
  }

  const clear = (): void => {
    const owners = new Set([
      ...ownerVersions.keys(),
      ...contributionsByOwner.keys(),
      ...pendingOwners.keys(),
    ])
    for (const ownerId of owners) {
      ownerVersions.set(ownerId, (ownerVersions.get(ownerId) ?? 0) + 1)
    }
    renderingsByKey.clear()
    contributionsByOwner.clear()
    pendingOwners.clear()
    setRevision((current) => current + 1)
  }

  return { get, prepareOwner, replaceOwner, unregisterOwner, clear }
}

export const faceRenderingRegistry = createFaceRenderingRegistry()

/** Register one directly-owned face rendering. Plugin renderings use their plugin ID as owner. */
export const registerFaceRenderings = (
  faceTypeId: string,
  registration: FaceRenderRegistration,
): (() => void) =>
  faceRenderingRegistry.replaceOwner(`core:${faceTypeId}`, [{ faceTypeId, ...registration }])

export const getFaceRendering = (
  faceTypeId: string,
  kind: FaceRenderingKind,
): Component<FaceRenderingProps> | undefined => faceRenderingRegistry.get(faceTypeId, kind)

/** Clear all registered face interiors. Intended for tests only. */
export const clearFaceRenderings = (): void => {
  faceRenderingRegistry.clear()
}

/**
 * A host-owned slot requests one face interior. The host keeps the wrapper,
 * fidelity, sizing, recursion, navigation, and insertion policy.
 */
export const FaceHostSlot: Component<{
  host: string
  kind: FaceRenderingKind
  subject: FaceSubject
  affinity: FaceAffinity
  rootMatrixId: number
  fidelity: 'composed' | 'substrate' | 'x-ray'
  services: FaceHostServices
  substrate: JSX.Element
}> = (props) => {
  const Rendering = createMemo(() =>
    props.affinity.source === 'intentional' ?
      getFaceRendering(props.affinity.recipe.faceTypeId, props.kind)
    : undefined,
  )

  return (
    <div
      data-testid="face-host-slot"
      data-face-rendering={props.kind}
      data-face-source={props.affinity.source}
      data-fidelity={props.fidelity}
      data-host={props.host}
      data-subject-mode={props.subject.mode}
    >
      <Show when={Rendering()} fallback={props.substrate}>
        {(rendering) => (
          <Dynamic
            component={rendering()}
            subject={props.subject}
            recipe={props.affinity.recipe!}
            rootMatrixId={props.rootMatrixId}
            services={props.services}
          />
        )}
      </Show>
    </div>
  )
}
