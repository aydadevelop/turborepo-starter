---
name: tanstack-query
description: TanStack Query v6 for Svelte 5 — server-state caching, reactive queries, cache invalidation, mutations, and SvelteKit SSR prefetch. Use when fetching data, invalidating cache after mutations, coordinating reactive queries with $state/$derived, optimistic updates, or prefetching in SvelteKit load functions. Triggers on: createQuery, createMutation, useQueryClient, invalidateQueries, queryOptions, prefetchQuery, dependent queries, optimistic updates, infinite scroll.
---

# TanStack Query v6 — Svelte 5

## References

- [`references/api-reference.md`](references/api-reference.md) — full createQuery/createMutation options, QueryClient methods, filter syntax, oRPC API
- [`references/patterns.md`](references/patterns.md) — dependent queries, infinite queries, optimistic updates, pagination, SSR patterns, global loading indicator
- Official docs: https://tanstack.com/query/latest/docs/framework/svelte/overview
- SSR guide: https://tanstack.com/query/latest/docs/framework/svelte/ssr
- Migration v5→v6: https://tanstack.com/query/latest/docs/framework/svelte/migrate-from-v5-to-v6

---

## Mental Model

TanStack Query manages **server state** — remote data that must be fetched asynchronously. The cache is the single source of truth; components observe it rather than fetching independently.

```
Server ──fetch──▶ Cache ──observe──▶ Components
                   ▲
           invalidate/setQueryData (after mutations)
```

- **Don't** store server data in `$state` — derive from `query.data` instead
- **Don't** call `.refetch()` after mutations — use `invalidateQueries` so *all* subscribers update
- **Don't** create `QueryClient` inside a component — singleton at module scope only
- Use `$state` for UI state (modal open, tabs, form drafts); TanStack Query for anything from the server

---

## Setup

```bash
bun add @tanstack/svelte-query @tanstack/svelte-query-devtools
```

**`src/lib/query-client.ts`** — singleton QueryClient:

```ts
import { QueryCache, QueryClient } from '@tanstack/svelte-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // treat data as fresh for 30s
      refetchOnWindowFocus: false, // invalidate explicitly after mutations instead
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => console.error(`[QueryCache] ${error.message}`),
  }),
});
```

**`src/routes/+layout.svelte`** — wrap app, lazy-load devtools:

```svelte
<script lang="ts">
  import { QueryClientProvider } from '@tanstack/svelte-query';
  import { dev } from '$app/environment';
  import { queryClient } from '$lib/query-client';

  const { children } = $props();

  let QueryDevtools = $state<null | typeof import('@tanstack/svelte-query-devtools').SvelteQueryDevtools>(null);
  $effect(() => {
    if (!dev || typeof window === 'undefined') return;
    import('@tanstack/svelte-query-devtools').then(m => { QueryDevtools = m.SvelteQueryDevtools; });
  });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
  {#if dev && QueryDevtools}
    <QueryDevtools />
  {/if}
</QueryClientProvider>
```

---

## v6 Critical Difference: Function Wrapper

**Always wrap options in a function** — required for reactivity in v6:

```svelte
<script lang="ts">
  // ✅ Function — reactive to $state reads inside
  const query = createQuery(() => ({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  }));

  // ❌ Plain object — static, won't react to changes
  const query = createQuery({ queryKey: ['todos'], queryFn: fetchTodos });
</script>
```

Access result fields directly (no `$` prefix needed):

```svelte
{#if query.isPending}Loading...{/if}
{#if query.isError}<p>{query.error.message}</p>{/if}
{#each query.data ?? [] as item}{item.title}{/each}
```

Reactive inputs just work — reference `$state` inside the function:

```svelte
<script lang="ts">
  let userId = $state<number | null>(null);

  const userQuery = createQuery(() => ({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId!),
    enabled: userId !== null,   // disabled until we have an id
  }));
</script>
```

---

## Query Keys

Hierarchical cache addresses. Design for scoped invalidation:

```ts
['todos']                        // all todos
['todos', { status: 'done' }]   // filtered subset
['todos', 42]                    // single item
['todos', 42, 'comments']        // nested resource
```

### queryOptions factory — define once, use everywhere

```ts
// src/lib/queries/todos.ts
import { queryOptions } from '@tanstack/svelte-query';

export const todosQuery = queryOptions({
  queryKey: ['todos'],
  queryFn: fetchTodos,
  staleTime: 60_000,
});

export const todoQuery = (id: number) => queryOptions({
  queryKey: ['todos', id],
  queryFn: () => fetchTodo(id),
});
```

Same object used in component, prefetch, and invalidate — keys never drift:

```ts
createQuery(() => todosQuery);
queryClient.prefetchQuery(todoQuery(5));
queryClient.invalidateQueries({ queryKey: todoQuery(5).queryKey });
```

---

## oRPC Integration (this project)

`orpc` auto-generates options from the contract and provides key helpers for scoped invalidation:

```ts
import { orpc } from '$lib/orpc'; // createTanstackQueryUtils(client)

// Query / mutation options
orpc.todo.getAll.queryOptions()             // → { queryKey, queryFn }
orpc.todo.getById.queryOptions({ input: { id } }) // → { queryKey, queryFn }
orpc.todo.create.mutationOptions({ onSuccess })

// Key helpers — use for invalidation, NOT hand-coded strings
orpc.todo.key()                             // partial — all todo queries (any procedure)
orpc.todo.getAll.key({ type: 'query' })     // partial — all getAll queries
orpc.todo.getById.queryKey({ input: { id } }) // exact — specific item query key

// Direct call
await orpc.todo.getAll.call({})             // alias for the procedure client
```

```svelte
<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { orpc } from '$lib/orpc';

  const todos = createQuery(() => orpc.todo.getAll.queryOptions());
  const queryClient = useQueryClient();

  const create = createMutation(() =>
    orpc.todo.create.mutationOptions({
      onSuccess: () => {
        // ✅ orpc.todo.key() invalidates ALL todo queries (getAll, getById, etc.)
        // ❌ Never use hand-coded ["todos"] — it won't match oRPC's key structure
        queryClient.invalidateQueries({ queryKey: orpc.todo.key() });
      },
    })
  );
</script>
```

### skipToken — type-safe conditional queries

Use `skipToken` instead of `enabled: false` when the input itself determines whether to fetch:

```svelte
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { skipToken } from '@tanstack/svelte-query';
  import { orpc } from '$lib/orpc';

  let search = $state('');

  // ✅ skipToken: typescript knows data is undefined when search is empty
  const results = createQuery(() =>
    orpc.item.search.queryOptions({
      input: search ? { search } : skipToken,
    })
  );

  // vs enabled: false — less type-safe, data type includes undefined regardless
</script>
```

---

## Basic Query

```svelte
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';

  const query = createQuery(() => ({
    queryKey: ['posts'],
    queryFn: () => fetch('/api/posts').then(r => r.json()),
  }));
</script>

{#if query.isPending}
  <p>Loading...</p>
{:else if query.isError}
  <p>Error: {query.error.message}</p>
{:else}
  {#each query.data as post}
    <article>{post.title}</article>
  {/each}
{/if}
```

---

## Basic Mutation + Invalidation

```svelte
<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';

  const queryClient = useQueryClient();

  const create = createMutation(() => ({
    mutationFn: (data: { title: string }) =>
      fetch('/api/todos', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (error) => console.error(error.message),
  }));
</script>

<button onclick={() => create.mutate({ title: 'New todo' })} disabled={create.isPending}>
  {create.isPending ? 'Saving...' : 'Add'}
</button>
{#if create.isError}<p class="text-red-500">{create.error.message}</p>{/if}
```

**Mutation callbacks:** `createMutation` callbacks = shared logic (cache updates). `mutate(vars, callbacks)` second arg = component-specific UI (close dialog, show toast). Both run.

---

## Cache Operations Quick Reference

```ts
const qc = useQueryClient();

// After mutation — mark stale and refetch active subscribers
qc.invalidateQueries({ queryKey: ['todos'] });

// Only mark stale, don't refetch (user hasn't visited that screen)
qc.invalidateQueries({ queryKey: ['todos'], refetchType: 'none' });

// Instant cache update using mutation response (no extra round-trip)
qc.setQueryData(['todos', id], (old: Todo | undefined) => ({ ...old, ...patch }));
qc.setQueryData(['todos'], (old: Todo[] | undefined) =>
  old?.map(t => t.id === id ? { ...t, ...patch } : t)
);

// Read cache synchronously
qc.getQueryData<Todo[]>(['todos']);  // undefined if missing
```

For optimistic updates see [`references/patterns.md`](references/patterns.md#optimistic-updates).

---

## Anti-Patterns

| ❌ Anti-pattern | ✅ Fix |
|---|---|
| `todos.refetch()` after mutation | `queryClient.invalidateQueries({ queryKey: orpc.todo.key() })` |
| `let data = $state([]); $effect(() => data = query.data ?? [])` | `const data = $derived(query.data ?? [])` |
| `createQuery({ ... })` plain object | `createQuery(() => ({ ... }))` function wrapper |
| `new QueryClient()` inside component | Singleton at module scope, passed via `QueryClientProvider` |
| Skipping `enabled` on dependent query | Always set `enabled: !!prevQuery.data` or use `skipToken` |
| `queryClient.invalidateQueries({ queryKey: ["todos"] })` for oRPC queries | `queryClient.invalidateQueries({ queryKey: orpc.todo.key() })` |

---

## Key Patterns Summary

| Task | Pattern |
|------|---------|
| Fetch data | `createQuery(() => ({ queryKey, queryFn }))` |
| Reactive inputs | Reference `$state` variables inside the function |
| Disabled query (conditional input) | `input: condition ? value : skipToken` |
| Disabled query (boolean gate) | `enabled: conditionBoolean` |
| Dependent query | `enabled: !!previousQuery.data` |
| Invalidate all oRPC procedure queries | `queryClient.invalidateQueries({ queryKey: orpc.resource.key() })` |
| Invalidate specific oRPC query | `queryClient.invalidateQueries({ queryKey: orpc.resource.action.key({ input }) })` |
| Exact oRPC query key | `orpc.resource.action.queryKey({ input })` |
| Instant cache update | `queryClient.setQueryData(orpc.resource.action.queryKey({ input }), updater)` |
| Optimistic update | `onMutate` cancel+snapshot → `onError` rollback → `onSettled` invalidate |
| Pagination no-flicker | `placeholderData: keepPreviousData` |
| SSR pre-warm | `queryClient.prefetchQuery(orpc.resource.action.queryOptions())` in `+page.ts` load |
| Global loading bar | `useIsFetching()` + `useIsMutating()` |
| Non-oRPC key factory | `queryOptions({ queryKey, queryFn })` — reuse in component + prefetch + invalidate |
| oRPC options | `orpc.resource.action.queryOptions()` / `.mutationOptions(cfg)` |
| Don't use hand-coded strings for oRPC keys | `orpc.resource.key()` not `["resource"]` |
