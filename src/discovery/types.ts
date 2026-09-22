import type { CommandEntry } from '../command-registry'
import type {
  AppearanceProvenance,
  PlaceNavigationTarget,
  ResolvedPlaceNavigation,
} from '../core/place-navigation'
import type { NodeRef } from '../core/tree'

export type DiscoveryFamily = 'row' | 'view' | 'type' | 'container' | 'command'

export type DiscoveryFilter = 'all' | 'named' | 'types' | 'commands' | 'containers'

export type DiscoveryMatchTarget = 'label' | 'content' | 'command-label' | 'command-keyword'

export type DiscoveryMatchQuality = 'browse' | 'exact' | 'prefix' | 'word-prefix' | 'substring'

export type DiscoveryBreadcrumb = {
  readonly node?: NodeRef
  readonly label: string
}

export type DiscoveryNodeMatch = {
  readonly matchTarget: 'label' | 'content'
  readonly matchQuality: DiscoveryMatchQuality
  readonly score: number
}

export type DiscoveryCatalogEntry = DiscoveryNodeMatch & {
  readonly id: string
  readonly family: Exclude<DiscoveryFamily, 'command'>
  readonly target: PlaceNavigationTarget
  readonly subjectMatrixId?: number
  readonly label: string
  readonly content: string
  readonly breadcrumb: readonly DiscoveryBreadcrumb[]
  readonly navigation: ResolvedPlaceNavigation | null
  readonly ownedMatrixIds: readonly number[]
  readonly structuralDepth: number
  readonly structuralOrder: string
}

export type DiscoveryNodeResult = DiscoveryNodeMatch & {
  readonly id: string
  readonly family: Exclude<DiscoveryFamily, 'command'>
  readonly node?: NodeRef
  readonly rootMatrixId?: number
  readonly subjectMatrixId?: number
  readonly provenance?: AppearanceProvenance
  readonly label: string
  readonly detail: string
  readonly breadcrumb: readonly DiscoveryBreadcrumb[]
  readonly navigation: ResolvedPlaceNavigation | null
  readonly ownedMatrixIds: readonly number[]
  readonly structuralDepth: number
  readonly structuralOrder: string
}

export type DiscoveryCommandResult = {
  readonly id: string
  readonly family: 'command'
  readonly commandId: `${string}.${string}`
  readonly label: string
  readonly detail: string
  readonly breadcrumb: readonly []
  readonly commandEntry: CommandEntry
  readonly matchTarget: 'command-label' | 'command-keyword'
  readonly matchQuality: DiscoveryMatchQuality
  readonly score: number
  readonly structuralDepth: number
  readonly structuralOrder: string
}

export type DiscoveryResult = DiscoveryNodeResult | DiscoveryCommandResult

export type DiscoveryRequest = {
  readonly rootMatrixId: number
  readonly query: string
  readonly filter?: DiscoveryFilter
  readonly limit?: number
}

export type DiscoverySearchOutcome =
  | { readonly status: 'current'; readonly results: readonly DiscoveryResult[] }
  | { readonly status: 'stale' }
