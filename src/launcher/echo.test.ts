import { describe, expect, test } from 'vitest'

import { createLauncherEchoBoxes, launcherEchoProgress } from './echo'

describe('launcher echoes', () => {
  test('interpolates all axes through the five approved progress points', () => {
    const boxes = createLauncherEchoBoxes(
      { left: 10, top: 20, width: 30, height: 40 },
      { left: 0, top: 0, width: 100, height: 200 },
    )

    expect(boxes.map(({ progress }) => progress)).toEqual(launcherEchoProgress)
    expect(boxes[1]).toEqual({
      left: 8.2,
      top: 16.4,
      width: 42.6,
      height: 68.8,
      progress: 0.18,
    })
    expect(boxes.at(-1)).toEqual({ left: 0, top: 0, width: 100, height: 200, progress: 1 })
  })
})
