import { createSignal, type Component } from 'solid-js'
import { firstValueFrom } from 'rxjs'
import { filter } from 'rxjs/operators'

import { observeSql } from './sql/query'
import type { SqlResult } from './sql/types'

const SqlRunner: Component = () => {
  const [sql, setSql] = createSignal('')
  const [results, setResults] = createSignal<SqlResult[]>([])
  const [errors, setErrors] = createSignal<string[]>([])

  const runSql = async () => {
    console.log(sql())
    try {
      const observer = observeSql(sql())

      // Filter out the initial null state to wait for actual results
      const result = await firstValueFrom(
        observer.pipe(filter((state) => state.result !== null || state.error !== null)),
      )

      if (result.result) {
        setResults([...results(), result.result])
      }
      if (result.error) {
        setErrors([...errors(), result.error.message])
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrors([...errors(), error.message])
      } else {
        setErrors([...errors(), `Unknown error: ${error}`])
      }
    }
  }

  return (
    <>
      <textarea value={sql()} onInput={(e) => setSql(e.currentTarget.value)} rows={10} />
      <button onClick={runSql}>Run</button>
      <pre>{JSON.stringify(results(), null, 2)}</pre>
      <pre>{JSON.stringify(errors(), null, 2)}</pre>
    </>
  )
}

export default SqlRunner
