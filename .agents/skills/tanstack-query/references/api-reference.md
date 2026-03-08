# TanStack Query v6 — API Reference

Official docs: https://tanstack.com/query/latest/docs/framework/svelte/overview

## createQuery options

```ts
createQuery(() => ({
  queryKey: QueryKey,              // required — cache address
  queryFn: () => Promise<T>,       // required (or inherited from defaults)
  enabled: boolean,                // default: true — set false to block
  staleTime: number,               // ms before data is considered stale (default: 0)
  gcTime: number,                  // ms to keep unused data in cache (default: 5min)
  retry: number | boolean | (n, err) => boolean,  // default: 3
  retryDelay: number | (n) => number,
  placeholderData: T | ((prev) => T),  // keepPreviousData helper available
  initialData: T | (() => T),      // data to use before first fetch
  select: (data: T) => U,          // transform/pick data before exposing to component
  refetchInterval: number | false, // poll interval in ms
  refetchIntervalInBackground: boolean,
  refetchOnWindowFocus: boolean | 'always',
  refetchOnMount: boolean | 'always',
  refetchOnReconnect: boolean | 'always',
  notifyOnChangeProps: string[],   // performance — only re-render on specific fields
  throwOnError: boolean,           // throw to error boundary instead of query.isError
  networkMode: 'online' | 'always' | 'offlineFirst',
}))
```

## createQuery result properties

```ts
query.data           // T | undefined
query.error          // Error | null
query.status         // 'pending' | 'error' | 'success'
query.isPending      // true when no data yet
query.isLoading      // true when fetching AND no data (isPending && isFetching)
query.isFetching     // true on any background fetch (first, refetch, background)
query.isSuccess
query.isError
query.isStale
query.isPlaceholderData
query.dataUpdatedAt  // timestamp of last successful fetch
query.refetch()      // manually trigger refetch for this instance (prefer invalidateQueries)
query.fetchStatus    // 'fetching' | 'paused' | 'idle'
```

## createMutation options

```ts
createMutation(() => ({
  mutationFn: (variables) => Promise<T>,  // required
  onMutate: async (variables) => context, // runs before mutationFn, return context for rollback
  onSuccess: (data, variables, context) => void,
  onError: (error, variables, context) => void,
  onSettled: (data, error, variables, context) => void,
  retry: number,
  retryDelay: number,
  networkMode: 'online' | 'always' | 'offlineFirst',
  throwOnError: boolean,
  gcTime: number,  // ms to keep mutation state (for useMutationState)
  mutationKey: QueryKey,  // needed for useMutationState / deduplication
}))
```

## createMutation result

```ts
mutation.mutate(variables, callbacks?)      // fire-and-forget
mutation.mutateAsync(variables, callbacks?) // returns Promise<T>
mutation.isPending
mutation.isSuccess
mutation.isError
mutation.isIdle
mutation.data           // last success result
mutation.error          // last error
mutation.variables      // last input variables
mutation.reset()        // clear state
mutation.status         // 'idle' | 'pending' | 'success' | 'error'
```

## QueryClient methods

```ts
const qc = useQueryClient();

// Read cache (synchronous)
qc.getQueryData<T>(queryKey)            // undefined if not cached
qc.getQueryState(queryKey)              // { data, error, status, dataUpdatedAt }
qc.getQueriesData<T>(filters)           // [queryKey, data][] for all matching

// Write cache
qc.setQueryData<T>(queryKey, updater)   // updater: T | ((old) => T)
qc.setQueriesData<T>(filters, updater)

// Invalidate / trigger refetch
qc.invalidateQueries(filters, options)  // marks stale + refetches active
qc.refetchQueries(filters, options)     // force refetch regardless of stale
qc.resetQueries(filters, options)       // reset to initialData/undefined + refetch

// Prefetch
qc.prefetchQuery(queryOptions)          // populate cache without throwing
qc.prefetchInfiniteQuery(options)

// Cancel / remove
qc.cancelQueries(filters)              // cancel in-flight requests
qc.removeQueries(filters)              // delete from cache entirely
qc.clear()                             // nuke all cache

// Global state
qc.isFetching(filters)                 // number of active fetches
qc.isMutating(filters)                 // number of active mutations
```

## Filter objects

```ts
// Used by invalidateQueries, refetchQueries, cancelQueries, etc.
{
  queryKey: ['todos'],         // matches prefix (hierarchical)
  exact: true,                 // exact key match only
  type: 'active' | 'inactive' | 'all',  // 'active' = mounted components
  stale: boolean,
  predicate: (query) => boolean,

  // For invalidateQueries specifically:
  refetchType: 'active' | 'inactive' | 'all' | 'none',
}
```

## createInfiniteQuery

```ts
createInfiniteQuery(() => ({
  queryKey: ['posts', 'infinite'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
  getPreviousPageParam: (firstPage) => firstPage.prevCursor,
  maxPages: 5,  // limit pages in memory (oldest removed)
}))

// result
query.data.pages         // T[][]
query.data.pageParams    // unknown[]
query.hasNextPage
query.hasPreviousPage
query.isFetchingNextPage
query.fetchNextPage()
query.fetchPreviousPage()
```

## createQueries (parallel)

```ts
createQueries(() => ({
  queries: ids.map(id => ({
    queryKey: ['item', id],
    queryFn: () => fetchItem(id),
  })),
  combine: (results) => ({  // optional — transform array of results
    data: results.map(r => r.data),
    isLoading: results.some(r => r.isLoading),
  }),
}))
```

## useIsFetching / useIsMutating

```ts
const isFetching = useIsFetching()              // reactive count of all fetches
const isFetching = useIsFetching({ queryKey })  // scoped to key

const isMutating = useIsMutating()              // reactive count of all mutations
const isMutating = useIsMutating({ mutationKey })

// Access: isFetching.data (number)
const isActive = $derived(isFetching.data > 0 || isMutating.data > 0);
```

## keepPreviousData

```ts
import { keepPreviousData } from '@tanstack/svelte-query';

createQuery(() => ({
  queryKey: ['search', { page, term }],
  queryFn: search,
  placeholderData: keepPreviousData,  // show old data while fetching new page
}));
```

---

## oRPC-Specific API (`@orpc/tanstack-query`)

This project uses `orpc = createTanstackQueryUtils(client)` from `$lib/orpc`.

### Option builders

```ts
orpc.resource.action.queryOptions({ input })       // → QueryOptions (for createQuery)
orpc.resource.action.mutationOptions(callbacks?)   // → MutationOptions (for createMutation)
orpc.resource.action.infiniteOptions({ input, initialPageParam, getNextPageParam })
orpc.resource.action.streamedOptions({ input })    // event-iterator → data[] stream
orpc.resource.action.liveOptions({ input })        // event-iterator → latest value
```

### Key helpers

| Method | Matching | Use case |
|--------|----------|----------|
| `orpc.resource.key()` | Partial — all queries for resource | Invalidate whole resource after mutation |
| `orpc.resource.key({ type: 'query' })` | Partial — only query type | Invalidate only queries (not mutations) |
| `orpc.resource.action.key({ input? })` | Partial — action ± input | Invalidate specific procedure |
| `orpc.resource.action.queryKey({ input })` | Exact — full key | `setQueryData` for precise update |
| `orpc.resource.action.infiniteKey({ input })` | Exact — infinite variant | `setQueryData` for infinite cache |
| `orpc.resource.action.streamedKey({ input })` | Exact — streamed variant | `setQueryData` for streamed cache |
| `orpc.resource.action.mutationKey()` | Exact — mutation | `useMutationState` lookup |

```ts
// Invalidate all queries for a resource (most common post-mutation pattern)
queryClient.invalidateQueries({ queryKey: orpc.todo.key() });

// Invalidate only query-type entries (not mutations)
queryClient.invalidateQueries({ queryKey: orpc.todo.key({ type: 'query' }) });

// Precise cache write after optimistic update
queryClient.setQueryData(
  orpc.todo.getById.queryKey({ input: { id } }),
  updated
);
```

### `skipToken` — type-safe conditional queries

```ts
import { skipToken } from '@tanstack/svelte-query';

// Blocks the query when userId is null — type-safe, no `enabled: false` needed
createQuery(() => orpc.user.getById.queryOptions({
  input: userId ? { id: userId } : skipToken,
}));
```

### `experimental_defaults` — per-procedure defaults

```ts
import { createTanstackQueryUtils } from '@orpc/tanstack-query';

const orpc = createTanstackQueryUtils(client, {
  experimental_defaults: {
    todo: {
      list: {
        queryOptions: { staleTime: 60_000 },
      },
    },
  },
});
```

### Direct procedure call (bypasses cache)

```ts
const result = await orpc.todo.getById.call({ id: 123 });
```

### Infinite queries

```ts
createInfiniteQuery(() => orpc.post.list.infiniteOptions({
  input: (pageParam: number | undefined) => ({ limit: 10, offset: pageParam }),
  initialPageParam: undefined,
  getNextPageParam: (lastPage) => lastPage.nextOffset,
}));
```

### Streamed / live queries (event iterators)

```ts
// streamedOptions — accumulates events into data[]
createQuery(() => orpc.ai.generate.streamedOptions({ input: { prompt } }));
// query.data → string[] (all chunks so far)

// liveOptions — replaces data with latest event value
createQuery(() => orpc.metrics.live.liveOptions({ input: { orgId } }));
// query.data → latest metric value
```

### Hydration (SvelteKit SSR)

```ts
// +layout.server.ts — prefetch on server
import { dehydrate } from '@tanstack/svelte-query';
import { createQueryClient } from '$lib/query-client';
import { StandardRPCJsonSerializer } from '@orpc/client/standard';

const qc = createQueryClient();
await qc.prefetchQuery(orpc.org.list.queryOptions({ input: {} }));

return { dehydratedState: dehydrate(qc, { serializeData: new StandardRPCJsonSerializer().serialize }) };
```
