# Contaktly Shortlist Audit

Reviewed on `2026-03-05`.

This file captures:

- live route screenshots from the current client app
- the two conversation-flow issues worth highlighting in the proposal
- a concrete scaffold for building the Phase 1 demo in this monorepo
- a pragmatic reuse vs rebuild recommendation
- a rough time and cost estimate

## Artifacts

Primary screenshots saved from the live app:

- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/dashboard.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/conversations.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/chat-test.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/chat-test-after-message.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/chat-test-compound-question.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/knowledge-base.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/meetings.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/analytics.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/widget-setup.png`
- `/Users/d/Documents/Projects/turborepo-alchemy/output/playwright/contaktly/settings.png`

Observed live routes:

| Route | Purpose | Screenshot |
| --- | --- | --- |
| `/client/dashboard` | KPI dashboard and recent activity | `dashboard.png` |
| `/client/conversations` | CRM-style conversation list/detail | `conversations.png` |
| `/client/chat` | Internal assistant QA page | `chat-test.png` |
| `/client/knowledge` | Knowledge document management | `knowledge-base.png` |
| `/client/meetings` | Booked meetings view | `meetings.png` |
| `/client/analytics` | Trend charts and funnel breakdowns | `analytics.png` |
| `/client/widget` | Widget, prompt, AI, and calendar config | `widget-setup.png` |
| `/client/settings` | Profile, password, organization settings | `settings.png` |

## Route Notes

### Dashboard

- Shared sidebar shell with date filter.
- Four KPI cards: widget loads, chat sessions, meetings booked, conversion rate.
- Charts: performance overview and visitor intent.
- Summary cards link into conversations and knowledge.

### Conversations

- Search and two filters: status and intent.
- Split-pane layout, but during review it repeatedly rendered a zero-state while console errors were firing.
- This page is a good candidate for the demo CRM because the layout is already familiar to buyers.

### Chat Test

- Greeting, suggestion cards, message timeline, and composer.
- The assistant response after one prompt contained multiple asks in a single message.
- One user turn triggered four sequential `POST /api/chat` requests during instrumentation.

### Knowledge Base

- Search, status filter, list/grid toggle, add-from-link, upload document.
- This can be copied almost directly into the demo, with retrieval remaining optional in Phase 1.

### Meetings

- Empty-state heavy right now.
- Good place to show native booking history once calendar integration exists.

### Analytics

- Simple charts only, which is fine for Phase 1.
- Demo can use seeded aggregates and keep this intentionally thin.

### Widget Setup

- This is the densest configuration page and the best source for the initial admin schema.
- Sections visible in the current app:
  - widget embed code
  - appearance
  - bot customization
  - conversation starters
  - AI configuration
  - calendar integration
  - API keys
  - current configuration

### Settings

- Profile, password, and organization settings on one page.
- This page threw repeated React runtime or hydration errors while being inspected.

## Two Conversation Flow Issues

### 1. One assistant message is asking more than one qualification question

Observed on the live `Chat Test` page after sending:

- `Need a demo for our sales chatbot`

The assistant replied with one message that effectively asks for:

- the current setup
- the specific features required

That is already two open asks in one turn. Even if the transport were perfect, the reply is ambiguous because the user can answer one, both, or neither in any order.

How I would fix it:

- Enforce a `one-open-question` invariant in the orchestrator.
- Model each guided step as a typed prompt with exactly one target slot or one tightly coupled slot group.
- Reject or rewrite assistant output if it contains multiple unresolved asks.
- Persist the active prompt as first-class state, not just text in the transcript.

Minimum shape:

```ts
type ActivePrompt = {
  promptId: string;
  flowId: string;
  nodeId: string;
  slotKeys: string[];
  status: "awaiting_user" | "answered" | "abandoned";
  askedAt: string;
  answeredByMessageId: string | null;
};
```

Rule:

- there can be only one `awaiting_user` prompt per conversation

### 2. One user turn is producing multiple backend chat executions

Observed on the live `Chat Test` page during fetch instrumentation:

- one user message generated four sequential `POST /api/chat` calls
- earlier in the session the same endpoint also returned a `500` while the UI still rendered a reply

That is exactly the class of failure that creates duplicate assistant turns, parallel questions, or state drift after retries.

How I would fix it:

- Generate a client-side `turnId` for every user submission.
- Persist a `conversation_turn` row before any model call starts.
- Put a server-side lock on `conversationId + turnId`.
- Make retries idempotent: return the same run or resume the same stream instead of starting a new generation.
- Store a `stateVersion` on the conversation and require optimistic concurrency on writes.

Minimum shape:

```ts
type ConversationTurn = {
  id: string;
  conversationId: string;
  turnId: string;
  userMessageId: string;
  status: "processing" | "completed" | "failed";
  stateVersionBefore: number;
  stateVersionAfter: number | null;
  runId: string | null;
  createdAt: string;
  completedAt: string | null;
};
```

Rule:

- one user turn can produce at most one committed assistant turn

## Additional Product Improvements

- The widget and contact flow should share the same conversation engine, but not the same layout. The widget should stay compact and contextual; the contact flow should become a full-screen, Typeform-like guided experience.
- Native booking should happen inside the conversation with inline date and time cards. Redirecting to a generic scheduling page is where intent usually leaks.
- The current widget configuration page is too dense for non-technical users. Split it into `Appearance`, `Behavior`, `Qualification`, and `Booking`.
- The chat should visibly show progress through qualification, for example `1 of 3`, so the user feels the path is guided rather than vague.
- Add an eval queue for prompt regressions and flow regressions before adding broad knowledge retrieval. It will pay back faster than more prompt complexity.
- The dashboard does not need to be more complex in Phase 1. It needs to feel trustworthy and connected to booking outcomes.

## Build vs Rebuild

I would build on the existing system, but I would rebuild the conversation orchestration layer and the chat surfaces that sit on top of it.

Keep and extend:

- `packages/auth`
  - Better Auth already supports anonymous users and organizations, which is exactly the right base for web widget plus later identity linking.
- `packages/db/src/schema/auth.ts`
  - user, session, organization, membership, invitation are reusable as-is.
- `apps/web/src/routes/(app)/org/create/+page.svelte`
  - already covers the organization onboarding pattern we need.
- `apps/web/src/routes/(app)/dashboard/settings/+page.svelte`
  - already proves the account and settings area exists.
- `packages/e2e-web`
  - there is already an end-to-end harness and an anonymous-session test.
- `packages/queue`
  - good place for enrichment, delayed follow-up, and eval jobs.

Rebuild or replace:

- `packages/assistant/src/router.ts`
  - useful as a transport example, but too free-form for deterministic qualification and booking.
- the public chat UI
  - needs a purpose-built conversion-focused experience, not a generic assistant shell.
- conversation persistence
  - current `assistant_chat` and `assistant_message` tables are too thin for guided flow state, cross-channel continuation, and booking orchestration.
- calendar integration model
  - this needs dedicated tables and OAuth handling, not an ad hoc token field.

Bottom line:

- not a rewrite of the whole product
- yes to reusing auth, org, app shell, tests, queue, and infra
- yes to rebuilding the conversation engine and the booking-oriented UX

## Demo Scaffold For This Repo

### Reuse map

| Area | Reuse | New work |
| --- | --- | --- |
| Auth and anonymous users | `packages/auth`, `packages/db/src/schema/auth.ts` | add Google provider scopes and token storage policy |
| Organization creation | existing org routes | add Contaktly-specific setup wizard |
| Chat transport | `packages/assistant`, `packages/ai-chat` patterns | replace free-form run loop with flow runner |
| Data access | `packages/api`, `packages/api-contract` | add conversation, widget, calendar, booking, enrichment routers |
| Queueing | `packages/queue` | add enrichment and eval jobs |
| E2E | `packages/e2e-web` | add widget reload, booking, and knowledge specs |

### Proposed demo routes

Public demo surfaces:

- `/demo/site-a`
  - example marketing page with embedded widget
- `/demo/site-b`
  - second page with the same widget to prove shared conversation state
- `/demo/contact`
  - full-page Typeform-like lead capture flow
- `/demo/try-agent`
  - lead magnet flow with email capture and test conversation

Workspace surfaces:

- `/org/create`
  - reuse existing onboarding route
- `/dashboard/settings`
  - reuse existing account route as the entry point after onboarding
- `/dashboard/contaktly/widget`
  - split widget config from the current single giant settings page
- `/dashboard/contaktly/conversations`
  - conversation CRM
- `/dashboard/contaktly/meetings`
  - booking list and meeting details
- `/dashboard/contaktly/analytics`
  - basic seeded dashboard
- `/dashboard/contaktly/integrations/google`
  - OAuth connection state and event-type setup

### Core schema additions

Suggested new schema files under `packages/db/src/schema/`:

```ts
type ConversationChannel = "web_widget" | "web_contact" | "whatsapp";
type ConversationStatus = "active" | "qualified" | "booked" | "closed";
type PromptStatus = "awaiting_user" | "answered" | "skipped" | "abandoned";
type CalendarProvider = "google" | "microsoft" | "calendly";

type Conversation = {
  id: string;
  organizationId: string;
  anonymousUserId: string | null;
  personId: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  stateVersion: number;
  activeFlowId: string | null;
  activeNodeId: string | null;
  activePromptId: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationChannelLink = {
  id: string;
  conversationId: string;
  channel: ConversationChannel;
  externalThreadId: string | null;
  externalUserId: string | null;
  createdAt: string;
};

type ConversationMessage = {
  id: string;
  conversationId: string;
  turnId: string;
  promptId: string | null;
  role: "assistant" | "user" | "system";
  content: unknown[];
  channelMessageId: string | null;
  createdAt: string;
};

type ConversationPrompt = {
  id: string;
  conversationId: string;
  flowId: string;
  nodeId: string;
  slotKeys: string[];
  status: PromptStatus;
  askedMessageId: string;
  answeredMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

type LeadProfile = {
  id: string;
  conversationId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  company: string | null;
  companySize: string | null;
  geography: string | null;
  industry: string | null;
  businessModel: "b2b" | "b2c" | "hybrid" | null;
  qualificationStatus: "unknown" | "qualified" | "unqualified";
  enrichedJson: Record<string, unknown>;
  updatedAt: string;
};

type WidgetConfig = {
  id: string;
  organizationId: string;
  displayMode: "inline" | "bubble";
  allowedDomains: string[];
  openingMessage: string;
  starterCards: string[];
  botName: string;
  botAvatarUrl: string | null;
  customInstructions: string;
  qualifiedLeadDefinition: string;
  themeJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type CalendarConnection = {
  id: string;
  organizationId: string;
  provider: CalendarProvider;
  accountEmail: string;
  scopes: string[];
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Booking = {
  id: string;
  organizationId: string;
  conversationId: string;
  leadProfileId: string;
  calendarConnectionId: string;
  providerEventId: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  meetingUrl: string | null;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

type KnowledgeDocument = {
  id: string;
  organizationId: string;
  sourceUrl: string | null;
  fileName: string | null;
  status: "processing" | "ready" | "failed";
  extractedText: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type EvalJob = {
  id: string;
  organizationId: string;
  conversationId: string | null;
  kind: "flow_regression" | "knowledge_regression" | "lead_quality";
  payloadJson: Record<string, unknown>;
  status: "queued" | "running" | "passed" | "failed";
  createdAt: string;
  updatedAt: string;
};
```

### Conversation engine shape

This should live inside `packages/assistant` or in a new `packages/conversations` package if we want to keep the assistant package clean.

Key invariants:

- exactly one active prompt per conversation
- exactly one active turn per user submission
- channel-agnostic state so web and WhatsApp both write into the same `conversation`
- all model output passes through a post-processor before commit

Recommended flow loop:

1. Load `conversation`, `activePrompt`, `leadProfile`, and recent messages.
2. Validate whether the incoming user message answers the active prompt.
3. Update slots and qualification state.
4. Decide the next node with deterministic rules.
5. Ask one question or present one booking action.
6. Persist state and stream the already-approved assistant turn.

### Calendar integration

Use Better Auth for Google sign-in, but keep calendar authorization and calendar usage as a separate concern.

Recommended approach:

- authenticate account identity with Better Auth
- request Google Calendar scopes only when the user connects calendar
- persist refresh tokens in `CalendarConnection`
- create an internal `Booking` record first
- then create or update the provider event

MVP Phase 1 scopes:

- `openid`
- `email`
- `profile`
- Google Calendar read/write scopes only on the integration screen

### Skill-flow generation

Admin flow:

1. User enters a company URL optionally.
2. Scraper job extracts homepage copy and service pages.
3. Prompt generator returns:
   - conversation starters
   - opening message
   - custom instructions
   - qualified lead definition
4. User edits and saves.

This belongs naturally in:

- `packages/queue` for scraping and generation jobs
- `packages/api` for orchestration endpoints
- `apps/web` for the wizard UI

### E2E plan

Add package-level specs in `packages/e2e-web/e2e/`:

- `widget-anonymous-shared-session.spec.ts`
  - open `/demo/site-a`
  - start anonymous chat
  - reload
  - verify history
  - open `/demo/site-b`
  - verify same conversation resumes
- `client-config-and-google-calendar.spec.ts`
  - sign in
  - create org
  - save widget config
  - connect Google calendar via stubbed OAuth callback
  - create a meeting type
- `booking-flow.spec.ts`
  - lead starts widget flow
  - qualifies
  - books a time
  - booking appears in workspace
- `knowledge-retrieval.spec.ts`
  - add one document
  - ask a grounded question
  - verify retrieval-backed answer
- `flow-regression.spec.ts`
  - assert there is never more than one awaiting prompt
  - assert duplicate turn submission does not create duplicate assistant turns

### Delivery order

Week 1:

- schema, contracts, conversation engine skeleton
- shared anonymous web widget session
- `site-a`, `site-b`, and `contact` demo routes
- first E2E test for reload and history

Week 2:

- admin configuration pages
- Google calendar integration
- booking flow
- CRM conversation list and meetings view

Week 3:

- skill-generation wizard
- optional knowledge retrieval
- eval queue
- analytics polish
- full E2E sweep and demo stabilization

## Rough Estimate

If the goal is Phase 1 in three weeks and a working base already exists, the realistic estimate is:

- `90-120` hours total
- `3` weeks elapsed time

Cost depends on the rate used in the proposal. Example conversions:

- at `$50/hour`: `$4,500-$6,000`
- at `$65/hour`: `$5,850-$7,800`
- at `$75/hour`: `$6,750-$9,000`

## Loom Walkthrough Outline

I cannot record a Loom from this environment, but this is the order I would use for a short walkthrough:

1. Show the dashboard and sidebar to establish the current product shell.
2. Show `Chat Test`, then call out the compound assistant question and the duplicate `/api/chat` executions.
3. Show `Widget Setup` and explain how this splits into cleaner admin sections.
4. Show the proposed demo route map and schema additions in this document.
5. Close with the rebuild recommendation: keep auth, org, tests, and infra; rebuild the conversation engine and booking UX.
