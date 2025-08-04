import { BehaviorSubject, Observable } from 'rxjs'
import { shareReplay } from 'rxjs/operators'

import type { SqlResult, QuerySubjectState } from './types'

export function createQuerySubject(
  setup: (
    emitResult: (value: SqlResult) => void,
    emitError: (error: Error) => void,
  ) => () => void,
): Observable<QuerySubjectState> {
  const subject = new BehaviorSubject<QuerySubjectState>({
    result: null,
    error: null,
  })
  let cleanup: (() => void) | null = null
  let subscriberCount = 0

  const source$ = new Observable<QuerySubjectState>((subscriber) => {
    if (subscriberCount === 0) {
      cleanup = setup(
        (result: SqlResult) => {
          subject.next({ result, error: null })
        },
        (error: Error) => {
          subject.next({ result: null, error })
        },
      )
    }

    const sub = subject.subscribe(subscriber)
    subscriberCount += 1

    return () => {
      sub.unsubscribe()
      subscriberCount -= 1

      if (subscriberCount === 0 && cleanup) {
        cleanup()
        cleanup = null
      }
    }
  })

  return source$.pipe(shareReplay({ bufferSize: 1, refCount: true }))
}
