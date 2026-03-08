# TanStack Query v6 — Advanced Patterns

Official docs:
- Overview: https://tanstack.com/query/latest/docs/framework/svelte/overview
- SSR / SvelteKit: https://tanstack.com/query/latest/docs/framework/svelte/ssr
- Migration v5→v6: https://tanstack.com/query/latest/docs/framework/svelte/migrate-from-v5-to-v6

---

## Dependent Queries (chained fetch)

```svelte
<script lang="ts">
  let { orgId } = $props<{ orgId: number | null }>();

  const org = createQuery(() => ({
    queryKey: ['org', orgId],
    queryFn: () => fetchOrg(orgId!),
    enabled: orgId !== null,
  }));

  const plan = createQuery(() => ({
    queryKey: ['plan', org.data?.planId],
    queryFn: () => fetchPlan(org.data!.planId),
    enabled: org.isSuccess && !!org.data?.planId,
  }));
</script>
```

---

## Parallel Queries (dynamic)

```svelte
<script lang="ts">
  let { userIds } = $props<{ userIds: number[] }>();

  const results = createQueries(() => ({
    queries: userIds.map(id => ({
      queryKey: ['user', id],
      queryFn: () => fetchUser(id),
    })),
  }));

  const allLoaded = $derived(results.every(r => r.isSuccess));
</script>
```

---

## Polling / Auto-refetch

```svelte
<script lang="ts">
  let intervalMs = $state(5000);

  const statusQuery = createQuery(() => ({
    queryKey: ['job-status'],
    queryFn: fetchJobStatus,
    refetchInterval: intervalMs,   // reactive — update without recreating query
    refetchIntervalInBackground: false,
  }));

  $effect(() => {
    if (statusQuery.data?.done) intervalMs = 0;  // stop polling
  });
</script>
```

---

## Infinite Queries (load more / cursor pagination)

```svelte
<script lang="ts">
  import { createInfiniteQuery } from '@tanstack/svelte-query';

  const query = createInfiniteQuery(() => ({
    queryKey: ['posts', 'infinite'],
    queryFn: ({ pageParam }) => fetchPosts({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    maxPages: 10,  // remove oldest pages beyond limit
  }));

  const posts = $derived(query.data?.pages.flatMap(p => p.items) ?? []);
</script>

{#each posts as post}
  <article>{post.title}</article>
{/each}

<button
  onclick={() => query.fetchNextPage()}
  disabled={!query.hasNextPage || query.isFetchingNextPage}
>
  {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
</button>
```

---

## Optimistic Updates

Full pattern: cancel in-flight → snapshot → apply optimistically → rollback on error → re-sync on settled.

```ts
const toggle = createMutation(() => ({
  mutationFn: (id: number) => orpc.todo.toggle.mutate({ id }),

  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });           // 1. cancel races
    const previous = queryClient.getQueryData<Todo[]>(['todos']);        // 2. snapshot
    queryClient.setQueryData<Todo[]>(['todos'], old =>                   // 3. apply
      old?.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    );
    return { previous };                                                 // 4. return context
  },

  onError: (_err, _id, context) => {
    if (context?.previous) queryClient.setQueryData(['todos'], context.previous); // 5. rollback
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });              // 6. re-sync
  },
}));
```

---

## SvelteKit SSR — Pattern 1: initialData (simple)

Good for top-level pages where you can pass data via props.

```ts
// +page.ts
export async function load() {
  const posts = await fetchPosts();
  return { posts };
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  let { data }: { data: PageData } = $props();

  const posts = createQuery(() => ({
    queryKey: ['posts'],
    queryFn: fetchPosts,
    initialData: data.posts,  // hydrated from server, no loading state shown
  }));
</script>
```

**Trade-off:** simple, but requires prop-drilling to nested components. `dataUpdatedAt` is inaccurate.

---

## SvelteKit SSR — Pattern 2: prefetchQuery (recommended)

No prop-drilling. Works for nested components. Accurate `dataUpdatedAt`.

```ts
// +layout.ts — create a per-request QueryClient
import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

export async function load() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: browser } },
  });
  return { queryClient };
}
```

```ts
// +page.ts — prefetch into per-request client
export async function load({ parent, fetch }) {
  const { queryClient } = await parent();
  await queryClient.prefetchQuery({
    ...todosQuery,
    queryFn: () => fetch('/api/todos').then(r => r.json()),  // use SvelteKit fetch for cookies
  });
}
```

```svelte
<!-- +layout.svelte — provide per-request client -->
<script lang="ts">
  import { QueryClientProvider } from '@tanstack/svelte-query';
  let { data, children } = $props<{ data: LayoutData }>();
</script>

<QueryClientProvider client={data.queryClient}>
  {@render children()}
</QueryClientProvider>
```

```svelte
<!-- +page.svelte — zero loading state, data already cached -->
<script lang="ts">
  const todos = createQuery(() => todosQuery);
</script>
```

**Note:** Only works with `+page.ts`, not `+page.server.ts` (server-side data can't be passed to the client-side cache directly without serialization).

---

## Pagination with keepPreviousData (no flicker)

```svelte
<script lang="ts">
  import { keepPreviousData } from '@tanstack/svelte-query';

  let page = $state(1);

  const results = createQuery(() => ({
    queryKey: ['posts', { page }],
    queryFn: () => fetchPosts({ page }),
    placeholderData: keepPreviousData,  // show current page while fetching next
  }));
</script>

<button onclick={() => page--} disabled={page === 1}>Prev</button>
<button onclick={() => page++} disabled={!results.data?.hasMore}>Next</button>

{#if results.isFetching && results.isPlaceholderData}
  <span class="opacity-50">Updating...</span>
{/if}
```

---

## select — Transform/Pick Data

```ts
// Only expose the count — component won't re-render when other fields change
const todoCount = createQuery(() => ({
  queryKey: ['todos'],
  queryFn: fetchTodos,
  select: (todos) => todos.length,
}));

// Pick nested field
const userEmail = createQuery(() => ({
  queryKey: ['user', userId],
  queryFn: fetchUser,
  select: (user) => user.email,
}));
```

---

## Global Loading / Mutation Indicator

```svelte
<!-- GlobalIndicator.svelte -->
<script lang="ts">
  import { useIsFetching, useIsMutating } from '@tanstack/svelte-query';

  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isActive = $derived(isFetching.data > 0 || isMutating.data > 0);
</script>

{#if isActive}
  <div class="fixed top-0 left-0 h-1 bg-blue-500 animate-pulse w-full" />
{/if}
```

---

## Cross-Query Cache Population (write to multiple keys on mutation success)

```ts
onSuccess: (newTodo) => {
  // Add new item to list cache
  queryClient.setQueryData<Todo[]>(['todos'], old => [...(old ?? []), newTodo]);
  // Pre-populate detail cache so navigating to detail is instant
  queryClient.setQueryData(['todos', newTodo.id], newTodo);
  // Invalidate to ensure server agrees
  queryClient.invalidateQueries({ queryKey: ['todos'] });
};
```

---

## Prefetch on Hover (performance)

```svelte
<script lang="ts">
  const queryClient = useQueryClient();

  function prefetch(id: number) {
    queryClient.prefetchQuery(todoQuery(id));  // no-op if already cached and fresh
  }
</script>

<a href="/todos/{todo.id}" onmouseenter={() => prefetch(todo.id)}>
  {todo.title}
</a>
```

---

## mutate vs mutateAsync

```ts
// mutate: fire-and-forget, callbacks run even after component unmount
create.mutate(data, {
  onSuccess: (result) => toast.success('Done!'),
  onError: (err) => toast.error(err.message),
});

// mutateAsync: returns Promise, handle errors yourself
try {
  const result = await create.mutateAsync(data);
  navigate(`/todos/${result.id}`);
} catch (err) {
  toast.error('Failed');
}
```

**Rule:** prefer `mutate` with callbacks — safer when component might unmount. Use `mutateAsync` only when you need the return value to drive further async logic (e.g. navigate to created resource).
