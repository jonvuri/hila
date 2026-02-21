export const pendingRequests = new Map<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { resolve: (value: any) => void; reject: (error: unknown) => void }
>()
