import { expect, test, type Locator, type Page } from '@playwright/test'

const DESCENDANT_COUNT = 420
const TEST_TIMEOUT = 180_000
const PARENT_LABEL =
  'Pinned parent with a deliberately long label that must stay inside the navigation viewport'
const SECTION_LABEL = 'Pinned section'

const openSidebar = async (page: Page) => {
  const sidebar = page.locator('.app-sidebar')
  if (!(await sidebar.isVisible())) {
    await page.getByRole('button', { name: 'Toggle dev tools' }).click()
    await expect(sidebar).toBeVisible({ timeout: 3000 })
  }
}

const openFreshDatabase = async (page: Page) => {
  await page.goto('/')
  await openSidebar(page)
  const resetButton = page.getByTestId('reset-db-btn')
  await expect(resetButton).toContainText('Reset DB', { timeout: 10_000 })
  await page.getByTestId('workspace-tab').click()
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 10_000 })
}

const seedDeepPagedBranch = (page: Page) =>
  page.evaluate(
    async ({ descendantCount, parentLabel, sectionLabel }) => {
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const matrix = await import('/src/core/client/matrix-client.ts')
      const doc = (text: string) =>
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })
      const longDoc = JSON.stringify({
        type: 'doc',
        content: Array.from({ length: 48 }, (_, index) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `Outer focus content ${index + 1}` }],
        })),
      })
      const matrixRows = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const matrixId = (matrixRows[0] as { id: number }).id
      const parent = await matrix.insertRow(matrixId, {
        values: { label: doc(parentLabel), content: longDoc },
      })
      const section = await matrix.insertRow(matrixId, {
        parentKey: parent.key,
        values: { label: doc(sectionLabel), content: null },
      })
      for (let index = 0; index < descendantCount; index += 1) {
        await matrix.insertRow(matrixId, {
          parentKey: section.key,
          values: {
            label: doc(`Paged child ${String(index + 1).padStart(3, '0')}`),
            content:
              index % 40 === 0 ?
                doc('Variable source content verifies measured row geometry.')
              : null,
          },
        })
      }
      await matrix.insertRow(matrixId, {
        parentKey: parent.key,
        values: { label: doc('Parent tail'), content: null },
      })
      await matrix.insertRow(matrixId, {
        values: { label: doc('After paged branch'), content: null },
      })
      for (let index = 0; index < 40; index += 1) {
        await matrix.insertRow(matrixId, {
          values: { label: doc(`Trailing root ${index + 1}`), content: null },
        })
      }
      return { parentId: parent.rowId as number }
    },
    {
      descendantCount: DESCENDANT_COUNT,
      parentLabel: PARENT_LABEL,
      sectionLabel: SECTION_LABEL,
    },
  )

const scrollToBottom = async (scrollport: Locator) => {
  await scrollport.evaluate(async (element) => {
    let unchangedFrames = 0
    for (let frame = 0; frame < 160 && unchangedFrames < 6; frame += 1) {
      const before = element.scrollTop
      element.scrollTop = Math.min(
        element.scrollHeight - element.clientHeight,
        before + Math.max(160, element.clientHeight * 0.75),
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      unchangedFrames = element.scrollTop === before ? unchangedFrames + 1 : 0
    }
  })
}

const metric = async (widget: Locator, name: string): Promise<number> =>
  Number((await widget.getAttribute(name)) ?? Number.NaN)

const waitForFrames = (locator: Locator, count = 6) =>
  locator.evaluate(async (_element, frameCount) => {
    for (let frame = 0; frame < frameCount; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  }, count)

const alignRowWithViewportOffset = (row: Locator, offset: number) =>
  row.evaluate(async (element, targetOffset) => {
    const scrollport = element.closest('.production-navigation-scrollport')!
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const delta =
        element.getBoundingClientRect().top -
        scrollport.getBoundingClientRect().top -
        targetOffset
      if (Math.abs(delta) < 0.25) return
      scrollport.scrollTop += delta
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  }, offset)

const stepUntilFinalTransformChanges = (scrollport: Locator, direction: 1 | -1) =>
  scrollport.evaluate(async (element, stepDirection) => {
    const widget = element.querySelector<HTMLElement>('[data-sticky-widget="production"]')!
    const finalTransform = () =>
      Array.from(widget.querySelectorAll<HTMLElement>('.production-sticky-row')).at(-1)?.style
        .transform ?? ''
    const initialTransform = finalTransform()
    for (let step = 0; step < 8; step += 1) {
      element.scrollTop += stepDirection
      for (let frame = 0; frame < 4; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      if (finalTransform() !== initialTransform) break
    }
    return {
      nodeIds: widget.dataset.widgetNodeIds ?? '',
      positionUpdates: Number(widget.dataset.widgetPositionUpdates ?? Number.NaN),
      rebuilds: Number(widget.dataset.widgetRebuilds ?? Number.NaN),
      initialTransform,
      transform: finalTransform(),
    }
  }, direction)

test.describe('Production sticky navigation', () => {
  test('keeps paged ancestry stable in root and focused navigation', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT)
    await openFreshDatabase(page)
    const { parentId } = await seedDeepPagedBranch(page)

    const rootPanel = page.getByTestId('navigation-panel').first()
    const rootScrollport = rootPanel.locator('.production-navigation-scrollport')
    const rootWidget = rootPanel.locator('[data-sticky-widget="production"]')
    await expect(rootWidget).toBeAttached()

    await scrollToBottom(rootScrollport)
    await expect(page.locator('[data-window-index="4"]')).toBeAttached({ timeout: 30_000 })
    const parentTail = rootPanel.locator('.outline-row', { hasText: 'Parent tail' })
    await expect(parentTail).toBeVisible({ timeout: 30_000 })
    await alignRowWithViewportOffset(parentTail, 96)
    await waitForFrames(rootWidget)
    const parentStickyLabel = rootWidget.getByRole('button', {
      name: `Scroll to ${PARENT_LABEL}`,
    })
    const sectionStickyLabel = rootWidget.getByRole('button', {
      name: `Scroll to ${SECTION_LABEL}`,
    })
    await expect(parentStickyLabel).toBeVisible({ timeout: 30_000 })
    await expect(sectionStickyLabel).toBeVisible({ timeout: 30_000 })

    // The first page has left the rendered range. The pinned rows now come from
    // the bounded metadata plane, not mounted source DOM.
    await expect(page.locator(`.outline-row[data-row-id="${parentId}"]`)).toHaveCount(0)
    expect(await metric(rootWidget, 'data-widget-ancestry-count')).toBeLessThanOrEqual(7)
    expect(await metric(rootWidget, 'data-widget-post-window-count')).toBeLessThanOrEqual(1)
    expect(await metric(rootWidget, 'data-widget-drill-count')).toBeLessThanOrEqual(1)
    expect(await metric(rootWidget, 'data-widget-retained-count')).toBeLessThanOrEqual(400)
    expect(await metric(rootWidget, 'data-widget-geometry-row-count')).toBeLessThanOrEqual(400)
    const mountedRowCount = await rootPanel.locator('.outline-row').count()
    expect(mountedRowCount).toBeGreaterThan(100)
    expect(mountedRowCount).toBeLessThanOrEqual(400)

    const [scrollportBox, widgetBox, titleBox] = await Promise.all([
      rootScrollport.boundingBox(),
      rootWidget.boundingBox(),
      rootPanel.getByTestId('workspace-title').boundingBox(),
    ])
    expect(scrollportBox).toBeTruthy()
    expect(widgetBox).toBeTruthy()
    expect(titleBox).toBeTruthy()
    const contentWidth = await rootScrollport.evaluate((element) => element.clientWidth)
    expect(widgetBox!.x + widgetBox!.width).toBeLessThanOrEqual(
      scrollportBox!.x + contentWidth + 1,
    )
    const parentStickyBox = await parentStickyLabel.boundingBox()
    expect(parentStickyBox).toBeTruthy()
    expect(parentStickyBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 1)

    const nodeIdsBefore = await rootWidget.getAttribute('data-widget-node-ids')
    const rebuildsBefore = await metric(rootWidget, 'data-widget-rebuilds')
    const positionUpdatesBefore = await metric(rootWidget, 'data-widget-position-updates')
    const forwardPush = await stepUntilFinalTransformChanges(rootScrollport, 1)
    expect(forwardPush.nodeIds).toBe(nodeIdsBefore)
    expect(forwardPush.rebuilds).toBe(rebuildsBefore)
    expect(forwardPush.transform).not.toBe(forwardPush.initialTransform)
    expect(forwardPush.positionUpdates).toBeGreaterThan(positionUpdatesBefore)

    const reversePush = await stepUntilFinalTransformChanges(rootScrollport, -1)
    expect(reversePush.nodeIds).toBe(nodeIdsBefore)
    expect(reversePush.rebuilds).toBe(rebuildsBefore)
    expect(reversePush.transform).not.toBe(reversePush.initialTransform)
    expect(reversePush.positionUpdates).toBeGreaterThan(forwardPush.positionUpdates)

    await parentStickyLabel.click()
    const parentSource = rootPanel.locator(`.outline-row[data-row-id="${parentId}"]`)
    await expect(parentSource).toBeVisible({ timeout: 30_000 })
    await expect(parentSource.locator('.ProseMirror')).toBeFocused({ timeout: 10_000 })

    await scrollToBottom(rootScrollport)
    await expect(parentTail).toBeVisible({ timeout: 30_000 })
    await alignRowWithViewportOffset(parentTail, 96)
    await waitForFrames(rootWidget)
    const openParent = rootWidget.getByRole('button', {
      name: `Open ${PARENT_LABEL} from pinned navigation`,
    })
    await expect(openParent).toBeVisible({ timeout: 30_000 })
    await openParent.click()

    const focusChildren = page.getByTestId('focus-panel-children')
    await expect(focusChildren).toBeVisible({ timeout: 10_000 })
    const focusContentScrollport = focusChildren.locator('xpath=..')
    await expect
      .poll(() =>
        focusContentScrollport.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeGreaterThan(0)
    await focusContentScrollport.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const outerBottom = await focusContentScrollport.evaluate((element) => element.scrollTop)
    expect(outerBottom).toBeGreaterThan(0)

    const focusPanel = focusChildren.getByTestId('navigation-panel')
    const focusScrollport = focusPanel.locator('.production-navigation-scrollport')
    const focusWidget = focusPanel.locator('[data-sticky-widget="production"]')
    await scrollToBottom(focusScrollport)
    const focusScrollportBox = await focusScrollport.boundingBox()
    expect(focusScrollportBox).toBeTruthy()
    await page.mouse.move(
      focusScrollportBox!.x + focusScrollportBox!.width / 2,
      focusScrollportBox!.y + focusScrollportBox!.height / 2,
    )
    await page.mouse.wheel(0, 400)
    await expect
      .poll(() => focusContentScrollport.evaluate((element) => element.scrollTop))
      .toBe(outerBottom)
    const focusParentTail = focusPanel.locator('.outline-row', { hasText: 'Parent tail' })
    await expect(focusParentTail).toBeVisible({ timeout: 30_000 })
    await alignRowWithViewportOffset(focusParentTail, 64)
    await waitForFrames(focusWidget)
    await expect(
      focusWidget.getByRole('button', { name: `Scroll to ${SECTION_LABEL}` }),
    ).toBeVisible({ timeout: 30_000 })
    expect(await metric(focusWidget, 'data-widget-ancestry-count')).toBeLessThanOrEqual(7)
    expect(await focusPanel.locator('.outline-row').count()).toBeLessThanOrEqual(400)
  })
})
