<script lang="ts">
	import { Button } from "@full-stack-cf-app/ui/components/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
</script>

<div
	class="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-background to-muted/40"
>
	<div class="mx-auto max-w-5xl px-6 py-16">
		<div class="text-center">
			<h1 class="text-4xl font-bold tracking-tight text-balance">
				Full Stack Cloudflare App
			</h1>
			<p class="mt-4 text-lg text-muted-foreground text-balance">
				A minimal monorepo starter with Better Auth, oRPC, Drizzle, and
				shadcn-svelte.
			</p>
		</div>

		<div class="mt-12 grid gap-6 md:grid-cols-2">
			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Authentication</CardTitle>
					<CardDescription>Secure login with Better Auth</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Email/password auth with session management, protected routes, and
						Polar integration for payments.
					</p>
				</CardContent>
				<CardFooter>
					<Button href="/login" variant="default">Sign In</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Boat Pages</CardTitle>
					<CardDescription>Public page generation</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Generate shareable boat pages from real-time availability, pricing,
						and slot data.
					</p>
				</CardContent>
				<CardFooter>
					<Button href="/boats" variant="outline">Browse Boats</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Dashboard</CardTitle>
					<CardDescription>Protected user area</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Access the dashboard to see your session data and subscription
						status.
					</p>
				</CardContent>
				<CardFooter>
					<Button href="/dashboard" variant="outline">Go to Dashboard</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>Todos (oRPC)</CardTitle>
					<CardDescription>Database + API example</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Full CRUD operations using oRPC, TanStack Query, and Drizzle with D1
						database.
					</p>
				</CardContent>
				<CardFooter>
					<Button href="/todos" variant="secondary">Manage Todos</Button>
				</CardFooter>
			</Card>

			<Card class="transition-shadow hover:shadow-md">
				<CardHeader>
					<CardTitle>UI Components</CardTitle>
					<CardDescription>shadcn-svelte in monorepo</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Shared UI components from
						<code class="rounded bg-muted px-1">@full-stack-cf-app/ui</code>
						package.
					</p>
				</CardContent>
				<CardFooter>
					<div class="flex gap-2">
						<Button size="sm">Default</Button>
						<Button size="sm" variant="outline">Outline</Button>
						<Button size="sm" variant="ghost">Ghost</Button>
					</div>
				</CardFooter>
			</Card>
		</div>

		<div class="mt-12 text-center">
			<p class="text-sm text-muted-foreground">
				Built with SvelteKit, Hono, Cloudflare Workers, and D1.
			</p>
		</div>
	</div>
</div>
