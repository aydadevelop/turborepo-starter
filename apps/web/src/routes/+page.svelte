<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "@my-app/ui/components/card";
	import { resolve } from "$app/paths";
</script>

<div
	class="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-background to-muted/40"
>
	<div class="mx-auto max-w-5xl px-6 py-16">
		<div class="text-center">
			<h1
				class="text-4xl font-bold tracking-tight text-balance"
				data-testid="landing-hero-title"
			>
				Cloudflare SaaS Starter
			</h1>
			<p class="mt-4 text-lg text-muted-foreground text-balance">
				SvelteKit + Hono + Better Auth + oRPC + Drizzle + Alchemy.
			</p>
		</div>

		<div class="mt-12 grid gap-6 md:grid-cols-2">
			<Card
				class="transition-shadow hover:shadow-md"
				data-testid="landing-auth-card"
			>
				<CardHeader>
					<CardTitle>Authentication</CardTitle>
					<CardDescription>
						Login, orgs, and admin impersonation
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Includes email/password, passkeys, organization memberships, and
						admin impersonation flows.
					</p>
				</CardContent>
				<CardFooter>
					<Button href={resolve("/login")} data-testid="landing-auth-signin">
						Sign In
					</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Dashboard</CardTitle>
					<CardDescription>Profile and SaaS starter actions</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Trigger mock payment notifications, schedule recurring reminders,
						and validate protected API wiring.
					</p>
				</CardContent>
				<CardFooter>
					<Button href={resolve("/dashboard")} variant="outline">
						Go to Dashboard
					</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Assistant</CardTitle>
					<CardDescription>Tool-enabled AI workspace</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Chat UI connected to tool calls for identity, todo actions, and
						queue-backed recurring reminders.
					</p>
				</CardContent>
				<CardFooter>
					<Button href={resolve("/chat")} variant="outline">
						Open Assistant
					</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Todo Demo</CardTitle>
					<CardDescription>Minimal oRPC + DB example</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Reference CRUD flow with TanStack Query and shared API contracts.
					</p>
				</CardContent>
				<CardFooter>
					<Button href={resolve("/todos")} variant="secondary">
						Manage Todos
					</Button>
				</CardFooter>
			</Card>
		</div>
	</div>
</div>
