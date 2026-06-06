// Scaling-ratio guards.
//
// Run an op at sizes N and kN against seeded fixtures and assert the *work
// counter* (not wall-clock) grows at the expected order: roughly constant per
// op, or linear -- never super-linear. This catches accidental O(n^2) without
// any timing dependence. Assertions are on counts with a fractional tolerance.

export type ScalingOrder = 'constant' | 'linear'

export type ScalingMeasurement = {
  size: number
  work: number
}

export type AssertScalingOptions = {
  /**
   * Run the op at the given fixture size and return the measured work (e.g.
   * `counters.rowsWritten` for the op under test). Must set up its own fixture
   * and reset counters internally.
   */
  run: (size: number) => number
  /** Fixture sizes to measure, in ascending order (at least two). */
  sizes: number[]
  /** Expected growth of work vs size. */
  order: ScalingOrder
  /** Allowed fractional deviation from the expected ratio (default 0.5). */
  tolerance?: number
  /**
   * Work values at or below this are treated as noise-free zero and skipped in
   * ratio checks (default 0). Useful when the op legitimately does no tracked
   * work at small sizes.
   */
  floor?: number
}

/** Measure work at each size without asserting. */
export const measureScaling = (
  run: (size: number) => number,
  sizes: number[],
): ScalingMeasurement[] => sizes.map((size) => ({ size, work: run(size) }))

/**
 * Assert the measured work follows the expected order across sizes. Throws
 * with the full measurement table on violation.
 */
export const assertScaling = (options: AssertScalingOptions): ScalingMeasurement[] => {
  const { run, sizes, order, tolerance = 0.5, floor = 0 } = options
  if (sizes.length < 2) {
    throw new Error('assertScaling requires at least two sizes')
  }

  const measurements = measureScaling(run, sizes)
  const table = measurements.map((m) => `  size=${m.size} work=${m.work}`).join('\n')
  const fail = (reason: string): never => {
    throw new Error(`Scaling guard failed (${order}): ${reason}\nMeasurements:\n${table}`)
  }

  const base = measurements[0]!
  if (base.work <= floor) {
    // Base does no tracked work; only meaningful if larger sizes also don't.
    for (const m of measurements) {
      if (m.work > floor) {
        fail(`base size ${base.size} did no work but size ${m.size} did (work=${m.work})`)
      }
    }
    return measurements
  }

  for (let i = 1; i < measurements.length; i++) {
    const m = measurements[i]!
    const sizeRatio = m.size / base.size
    const workRatio = m.work / base.work
    const expected = order === 'constant' ? 1 : sizeRatio
    const deviation = Math.abs(workRatio - expected) / expected
    if (deviation > tolerance) {
      fail(
        `at size ${m.size}: workRatio=${workRatio.toFixed(2)} expected≈${expected.toFixed(2)} ` +
          `(deviation ${(deviation * 100).toFixed(0)}% > ${(tolerance * 100).toFixed(0)}%)`,
      )
    }
  }

  return measurements
}
