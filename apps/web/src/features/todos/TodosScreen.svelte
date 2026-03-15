<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import {
		getPageInitialSessionData,
		hasAuthenticatedSession,
		isSessionPending,
		resolveSessionData,
	} from "$lib/auth-session";
	import { orpc } from "$lib/orpc";
	import type { OrpcOutputs } from "$lib/orpc-types";

	type TodoList = OrpcOutputs["todo"]["getAll"];

	let newTodoText = $state("");
	const sessionQuery = authClient.useSession();
	const initialSession = $derived(getPageInitialSessionData(page.data));
	const sessionData = $derived(
		resolveSessionData($sessionQuery, initialSession)
	);
	const sessionPending = $derived(
		isSessionPending($sessionQuery, initialSession)
	);
	const queryClient = useQueryClient();

	const todosQueryKey = orpc.todo.getAll.queryKey({});
	const todosQuery = createQuery(() => orpc.todo.getAll.queryOptions());

	$effect(() => {
		if (sessionPending) return;
		if (!hasAuthenticatedSession(sessionData)) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	const addMutation = createMutation(() =>
		orpc.todo.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.todo.key() });
				newTodoText = "";
			},
			onError: (error) => {
				console.error("Failed to create todo:", error?.message ?? error);
			},
		})
	);

	const toggleMutation = createMutation(() =>
		orpc.todo.toggle.mutationOptions({
			onMutate: async (input) => {
				await queryClient.cancelQueries({ queryKey: todosQueryKey });
				const previous = queryClient.getQueryData<TodoList>(todosQueryKey);
				queryClient.setQueryData<TodoList>(todosQueryKey, (old) =>
					old?.map((todo) =>
						todo.id === input.id
							? { ...todo, completed: input.completed }
							: todo
					)
				);
				return { previous };
			},
			onError: (error, _input, context) => {
				if (context?.previous) {
					queryClient.setQueryData<TodoList>(todosQueryKey, context.previous);
				}
				console.error("Failed to toggle todo:", error?.message ?? error);
			},
			onSettled: () => {
				queryClient.invalidateQueries({ queryKey: orpc.todo.key() });
			},
		})
	);

	const deleteMutation = createMutation(() =>
		orpc.todo.delete.mutationOptions({
			onMutate: async (input) => {
				await queryClient.cancelQueries({ queryKey: todosQueryKey });
				const previous = queryClient.getQueryData<TodoList>(todosQueryKey);
				queryClient.setQueryData<TodoList>(todosQueryKey, (old) =>
					old?.filter((todo) => todo.id !== input.id)
				);
				return { previous };
			},
			onError: (error, _input, context) => {
				if (context?.previous) {
					queryClient.setQueryData<TodoList>(todosQueryKey, context.previous);
				}
				console.error("Failed to delete todo:", error?.message ?? error);
			},
			onSettled: () => {
				queryClient.invalidateQueries({ queryKey: orpc.todo.key() });
			},
		})
	);

	function handleAddTodo(event: SubmitEvent) {
		event.preventDefault();
		const text = newTodoText.trim();
		if (text) {
			addMutation.mutate({ text });
		}
	}

	function handleToggleTodo(id: number, completed: boolean) {
		toggleMutation.mutate({ id, completed: !completed });
	}

	function handleDeleteTodo(id: number) {
		deleteMutation.mutate({ id });
	}

	const isAdding = $derived(addMutation.isPending);
	const canAdd = $derived(!isAdding && newTodoText.trim().length > 0);
	const isLoadingTodos = $derived(todosQuery.isLoading);
	const todos = $derived(todosQuery.data ?? []);
	const hasTodos = $derived(todos.length > 0);
</script>

{#if sessionPending}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Loading...</p>
	</div>
{:else if !hasAuthenticatedSession(sessionData)}
	<div class="flex min-h-[50vh] items-center justify-center">
		<p class="text-muted-foreground">Redirecting to login...</p>
	</div>
{:else}
	<div class="mx-auto max-w-2xl space-y-6 p-6">
		<h1 class="text-3xl font-bold">Todos</h1>

		<Card.Root>
			<Card.Header>
				<Card.Title>Add Todo</Card.Title>
				<Card.Description>
					Create a new task using the oRPC API
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form onsubmit={handleAddTodo} class="flex gap-2">
					<Input
						type="text"
						bind:value={newTodoText}
						placeholder="New task..."
						disabled={isAdding}
						class="flex-grow"
					/>
					<Button type="submit" disabled={!canAdd}>
						{isAdding ? "Adding..." : "Add"}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header> <Card.Title>Your Tasks</Card.Title> </Card.Header>
			<Card.Content>
				{#if isLoadingTodos}
					<p class="text-muted-foreground">Loading...</p>
				{:else if !hasTodos}
					<p class="text-muted-foreground">No todos yet.</p>
				{:else}
					<ul class="space-y-2">
						{#each todos as todo (todo.id)}
							{@const isToggling = toggleMutation.isPending && toggleMutation.variables?.id === todo.id}
							{@const isDeleting = deleteMutation.isPending && deleteMutation.variables?.id === todo.id}
							{@const isDisabled = isToggling || isDeleting}
							<li
								class="flex items-center justify-between rounded-md border p-3"
								class:opacity-50={isDisabled}
							>
								<div class="flex items-center gap-3">
									<input
										type="checkbox"
										id={`todo-${todo.id}`}
										checked={todo.completed}
										onchange={() => handleToggleTodo(todo.id, todo.completed)}
										disabled={isDisabled}
										class="h-4 w-4 rounded border-input"
									>
									<label
										for={`todo-${todo.id}`}
										class:line-through={todo.completed}
										class:text-muted-foreground={todo.completed}
									>
										{todo.text}
									</label>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => handleDeleteTodo(todo.id)}
									disabled={isDisabled}
									class="text-destructive hover:text-destructive"
								>
									{isDeleting ? "..." : "Delete"}
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if todosQuery.isError || addMutation.isError || toggleMutation.isError || deleteMutation.isError}
			<Card.Root class="border-destructive">
				<Card.Content class="pt-6">
					{#if todosQuery.isError}
						<p class="text-destructive">
							Error loading: {todosQuery.error?.message ?? "Unknown error"}
						</p>
					{/if}
					{#if addMutation.isError}
						<p class="text-destructive">
							Error adding: {addMutation.error?.message ?? "Unknown error"}
						</p>
					{/if}
					{#if toggleMutation.isError}
						<p class="text-destructive">
							Error updating:
							{toggleMutation.error?.message ?? "Unknown error"}
						</p>
					{/if}
					{#if deleteMutation.isError}
						<p class="text-destructive">
							Error deleting:
							{deleteMutation.error?.message ?? "Unknown error"}
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
{/if}
