import { BehaviorSubject, Observable } from 'rxjs'
import { shareReplay } from 'rxjs/operators'

export type SubjectState<Result> = {
  result: Result | null
  error: Error | null
}

export const createQuerySubject = <Result>(
  setup: (emitResult: (value: Result) => void, emitError: (error: Error) => void) => () => void,
): Observable<SubjectState<Result>> => {
  const subject = new BehaviorSubject<SubjectState<Result>>({
    result: null,
    error: null,
  })
  let cleanup: (() => void) | null = null
  let subscriberCount = 0

  const source$ = new Observable<SubjectState<Result>>((subscriber) => {
    if (subscriberCount === 0) {
      cleanup = setup(
        (result: Result) => {
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
