import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import { resolveFaceAffinity, SUBSTRATE_FACE_AFFINITY } from './face-affinity'
import type { FaceRecipe, FaceSubject } from './face-types'
import {
  clearFaceRenderings,
  createFaceRenderingRegistry,
  EMPTY_FACE_HOST_SERVICES,
  FaceFidelityRoot,
  FaceHostSlot,
  getFaceRendering,
  registerFaceRenderings,
  useFaceFidelity,
} from './face-runtime'

const recipe: FaceRecipe = {
  faceTypeId: 'test.face',
  slotBindings: {},
  settings: {},
}

const subject: FaceSubject = {
  mode: 'view',
  matrixId: 10,
  rowId: 20,
  sql: 'SELECT 1',
}

afterEach(() => {
  clearFaceRenderings()
  document.body.replaceChildren()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.visualTheme
  delete document.documentElement.dataset.density
  delete document.documentElement.dataset.navigationOutline
  delete document.documentElement.dataset.shellPresentation
})

describe('forward face runtime', () => {
  test('registers line and collection interiors independently', () => {
    const Line = () => <span>line</span>
    const Collection = () => <span>collection</span>
    registerFaceRenderings(recipe.faceTypeId, { line: Line, collection: Collection })

    expect(getFaceRendering(recipe.faceTypeId, 'line')).toBe(Line)
    expect(getFaceRendering(recipe.faceTypeId, 'collection')).toBe(Collection)
  })

  test('replaces an owner completely and ignores stale disposers', () => {
    const registry = createFaceRenderingRegistry()
    const OldLine = () => <span>old line</span>
    const OldCollection = () => <span>old collection</span>
    const NewCollection = () => <span>new collection</span>

    const staleDispose = registry.replaceOwner('plugin', [
      { faceTypeId: recipe.faceTypeId, line: OldLine, collection: OldCollection },
    ])
    const dispose = registry.replaceOwner('plugin', [
      { faceTypeId: recipe.faceTypeId, collection: NewCollection },
    ])

    staleDispose()
    expect(registry.get(recipe.faceTypeId, 'line')).toBeUndefined()
    expect(registry.get(recipe.faceTypeId, 'collection')).toBe(NewCollection)

    dispose()
    expect(registry.get(recipe.faceTypeId, 'collection')).toBeUndefined()
  })

  test('invalidates stale disposers when the registry is cleared', () => {
    const registry = createFaceRenderingRegistry()
    const OldLine = () => <span>old line</span>
    const NewLine = () => <span>new line</span>
    const staleDispose = registry.replaceOwner('plugin', [
      { faceTypeId: recipe.faceTypeId, line: OldLine },
    ])

    registry.clear()
    registry.replaceOwner('plugin', [{ faceTypeId: recipe.faceTypeId, line: NewLine }])
    staleDispose()

    expect(registry.get(recipe.faceTypeId, 'line')).toBe(NewLine)
  })

  test('reserves rendering keys and preserves committed owners after a conflict', () => {
    const registry = createFaceRenderingRegistry()
    const Line = () => <span>line</span>
    registry.replaceOwner('one', [{ faceTypeId: recipe.faceTypeId, line: Line }])

    expect(() =>
      registry.prepareOwner('two', [{ faceTypeId: recipe.faceTypeId, line: Line }]),
    ).toThrow('already registered')
    expect(registry.get(recipe.faceTypeId, 'line')).toBe(Line)
  })

  test('lets the host choose rendering kind and supply semantic services', () => {
    const requestNavigation = vi.fn()
    const yieldSubject = vi.fn()
    registerFaceRenderings(recipe.faceTypeId, {
      collection: (props) => (
        <button
          data-testid="face-interior"
          onClick={() => {
            props.services.requestNavigation?.({ matrixId: 30, rowId: 40 })
            props.services.yieldSubject?.({
              mode: 'container',
              matrixId: 30,
              rowId: 40,
              extentMatrixId: 50,
            })
          }}
        >
          {props.subject.mode}:{props.rootMatrixId}
        </button>
      ),
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(
      () => (
        <FaceHostSlot
          host="focus-panel"
          kind="collection"
          subject={subject}
          affinity={resolveFaceAffinity(recipe)}
          rootMatrixId={1}
          fidelity="substrate"
          services={{ requestNavigation, yieldSubject }}
          substrate={<span data-testid="substrate">substrate</span>}
        />
      ),
      container,
    )

    const slot = container.querySelector<HTMLElement>('[data-testid="face-host-slot"]')!
    expect(slot.dataset.host).toBe('focus-panel')
    expect(slot.dataset.faceRendering).toBe('collection')
    expect(slot.dataset.faceSource).toBe('intentional')
    expect(slot.dataset.fidelity).toBe('substrate')
    expect(slot.dataset.subjectMode).toBe('view')
    const interior = container.querySelector<HTMLButtonElement>(
      '[data-testid="face-interior"]',
    )!
    expect(interior.textContent).toBe('view:1')
    interior.click()
    expect(requestNavigation).toHaveBeenCalledWith({ matrixId: 30, rowId: 40 })
    expect(yieldSubject).toHaveBeenCalledWith({
      mode: 'container',
      matrixId: 30,
      rowId: 40,
      extentMatrixId: 50,
    })
    dispose()
  })

  test('uses the implicit substrate floor without a persisted recipe', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(
      () => (
        <FaceHostSlot
          host="row"
          kind="line"
          subject={subject}
          affinity={SUBSTRATE_FACE_AFFINITY}
          rootMatrixId={1}
          fidelity="composed"
          services={{}}
          substrate={<span data-testid="substrate">substrate fallback</span>}
        />
      ),
      container,
    )

    expect(container.querySelector('[data-testid="substrate"]')?.textContent).toBe(
      'substrate fallback',
    )
    expect(
      container.querySelector<HTMLElement>('[data-testid="face-host-slot"]')?.dataset
        .faceSource,
    ).toBe('substrate')
    dispose()
  })

  test('uses the host substrate when an intentional rendering is unavailable', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(
      () => (
        <FaceHostSlot
          host="row"
          kind="line"
          subject={subject}
          affinity={resolveFaceAffinity(recipe)}
          rootMatrixId={1}
          fidelity="composed"
          services={{}}
          substrate={<span data-testid="substrate">host substrate</span>}
        />
      ),
      container,
    )

    expect(container.querySelector('[data-testid="substrate"]')?.textContent).toBe(
      'host substrate',
    )
    dispose()
  })

  test('updates a mounted slot across registration, replacement, and teardown', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const disposeSlot = render(
      () => (
        <FaceHostSlot
          host="row"
          kind="line"
          subject={subject}
          affinity={resolveFaceAffinity(recipe)}
          rootMatrixId={1}
          fidelity="composed"
          services={{}}
          substrate={<span data-testid="substrate">substrate</span>}
        />
      ),
      container,
    )

    expect(container.querySelector('[data-testid="substrate"]')).not.toBeNull()
    const disposeFirst = registerFaceRenderings(recipe.faceTypeId, {
      line: () => <span data-testid="first">first</span>,
    })
    expect(container.querySelector('[data-testid="first"]')).not.toBeNull()

    const disposeSecond = registerFaceRenderings(recipe.faceTypeId, {
      line: () => <span data-testid="second">second</span>,
    })
    disposeFirst()
    expect(container.querySelector('[data-testid="second"]')).not.toBeNull()

    disposeSecond()
    expect(container.querySelector('[data-testid="substrate"]')).not.toBeNull()
    disposeSlot()
  })

  test('inherits fidelity recursively and exposes a local override to interiors', () => {
    const nestedRecipe: FaceRecipe = {
      faceTypeId: 'test.nested',
      slotBindings: {},
      settings: {},
    }
    registerFaceRenderings(recipe.faceTypeId, {
      collection: (props) => (
        <span data-testid="outer-interior" data-fidelity={props.fidelity} />
      ),
    })
    registerFaceRenderings(nestedRecipe.faceTypeId, {
      line: (props) => <span data-testid="nested-interior" data-fidelity={props.fidelity} />,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(
      () => (
        <FaceFidelityRoot fidelity="substrate">
          <FaceHostSlot
            host="interior"
            kind="collection"
            subject={subject}
            affinity={resolveFaceAffinity(recipe)}
            rootMatrixId={1}
            services={EMPTY_FACE_HOST_SERVICES}
            substrate={<span>root substrate</span>}
          />
          <FaceHostSlot
            host="parent"
            kind="collection"
            subject={subject}
            affinity={SUBSTRATE_FACE_AFFINITY}
            rootMatrixId={1}
            services={EMPTY_FACE_HOST_SERVICES}
            substrate={
              <FaceHostSlot
                host="nested"
                kind="line"
                subject={subject}
                affinity={resolveFaceAffinity(nestedRecipe)}
                rootMatrixId={1}
                fidelity="composed"
                services={EMPTY_FACE_HOST_SERVICES}
                substrate={<span>nested substrate</span>}
              />
            }
          />
        </FaceFidelityRoot>
      ),
      container,
    )

    const hosts = container.querySelectorAll<HTMLElement>('[data-testid="face-host-slot"]')
    expect([...hosts].map((host) => host.dataset.fidelity)).toEqual([
      'substrate',
      'substrate',
      'composed',
    ])
    expect(
      container.querySelector<HTMLElement>('[data-testid="outer-interior"]')?.dataset.fidelity,
    ).toBe('substrate')
    expect(
      container.querySelector<HTMLElement>('[data-testid="nested-interior"]')?.dataset.fidelity,
    ).toBe('composed')
    dispose()
  })

  test('gives transient x-ray priority through nested hosts without changing other axes', () => {
    const nestedRecipe: FaceRecipe = {
      faceTypeId: 'test.xray-nested',
      slotBindings: {},
      settings: {},
    }
    registerFaceRenderings(nestedRecipe.faceTypeId, {
      line: (props) => <span data-testid="nested-interior" data-fidelity={props.fidelity} />,
    })

    const Workspace = () => {
      const fidelity = useFaceFidelity()
      return (
        <section
          data-testid="workspace"
          data-fidelity={fidelity.fidelity()}
          data-x-ray={fidelity.xray() ? 'true' : undefined}
        >
          <button type="button" onClick={() => fidelity.setXray((active) => !active)}>
            Toggle x-ray
          </button>
          <FaceHostSlot
            host="root"
            kind="collection"
            subject={subject}
            affinity={SUBSTRATE_FACE_AFFINITY}
            rootMatrixId={1}
            fidelity="composed"
            services={EMPTY_FACE_HOST_SERVICES}
            substrate={
              <FaceHostSlot
                host="nested"
                kind="line"
                subject={subject}
                affinity={resolveFaceAffinity(nestedRecipe)}
                rootMatrixId={1}
                fidelity="composed"
                services={EMPTY_FACE_HOST_SERVICES}
                substrate={<span>nested substrate</span>}
              />
            }
          />
        </section>
      )
    }

    document.documentElement.dataset.theme = 'light'
    document.documentElement.dataset.visualTheme = 'wipeout'
    document.documentElement.dataset.density = 'narrow'
    document.documentElement.dataset.navigationOutline = 'guides'
    document.documentElement.dataset.shellPresentation = 'single-panel'

    const container = document.createElement('div')
    document.body.appendChild(container)
    let dispose = render(
      () => (
        <FaceFidelityRoot>
          <Workspace />
        </FaceFidelityRoot>
      ),
      container,
    )

    const workspace = () => container.querySelector<HTMLElement>('[data-testid="workspace"]')!
    expect(workspace().dataset.fidelity).toBe('composed')
    expect(workspace().dataset.xRay).toBeUndefined()

    container.querySelector<HTMLButtonElement>('button')!.click()
    expect(workspace().dataset.fidelity).toBe('substrate')
    expect(workspace().dataset.xRay).toBe('true')
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid="face-host-slot"]')].map(
        (host) => host.dataset.fidelity,
      ),
    ).toEqual(['substrate', 'substrate'])
    expect(
      container.querySelector<HTMLElement>('[data-testid="nested-interior"]')?.dataset.fidelity,
    ).toBe('substrate')
    expect(document.documentElement.dataset).toMatchObject({
      theme: 'light',
      visualTheme: 'wipeout',
      density: 'narrow',
      navigationOutline: 'guides',
      shellPresentation: 'single-panel',
    })

    container.querySelector<HTMLButtonElement>('button')!.click()
    expect(workspace().dataset.fidelity).toBe('composed')
    expect(workspace().dataset.xRay).toBeUndefined()
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid="face-host-slot"]')].map(
        (host) => host.dataset.fidelity,
      ),
    ).toEqual(['composed', 'composed'])

    dispose()
    container.replaceChildren()
    dispose = render(
      () => (
        <FaceFidelityRoot>
          <Workspace />
        </FaceFidelityRoot>
      ),
      container,
    )
    expect(workspace().dataset.fidelity).toBe('composed')
    expect(workspace().dataset.xRay).toBeUndefined()
    dispose()
  })
})
