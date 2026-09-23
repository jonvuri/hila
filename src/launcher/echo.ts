export const launcherEchoProgress = [0, 0.18, 0.4, 0.67, 1] as const

export type LauncherEchoRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export type LauncherEchoBox = LauncherEchoRect & { readonly progress: number }

const interpolate = (start: number, end: number, progress: number): number =>
  start + (end - start) * progress

export const createLauncherEchoBoxes = (
  start: LauncherEchoRect,
  end: LauncherEchoRect,
): readonly LauncherEchoBox[] =>
  launcherEchoProgress.map((progress) => ({
    left: interpolate(start.left, end.left, progress),
    top: interpolate(start.top, end.top, progress),
    width: interpolate(start.width, end.width, progress),
    height: interpolate(start.height, end.height, progress),
    progress,
  }))
