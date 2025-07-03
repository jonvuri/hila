import { createSignal, type Component } from 'solid-js'

import { executeSql } from './sql/client'
import type { SqlResult } from './sql/types'

const SqlRunner: Component = () => {
  const [sql, setSql] = createSignal('')
  const [results, setResults] = createSignal<SqlResult[]>([])
  const [errors, setErrors] = createSignal<Error[]>([])

  const runSql = async () => {
    console.log(sql())
    try {
      const result = await executeSql(sql())
      setResults([...results(), result])
    } catch (error: unknown) {
      console.error(error)
      if (error instanceof Error) {
        setErrors([...errors(), error])
      } else {
        setErrors([...errors(), new Error(`Unknown error: ${error}`)])
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
