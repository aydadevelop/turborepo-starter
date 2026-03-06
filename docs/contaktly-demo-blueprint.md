# Contaktly Demo Blueprint

This document captures the visible product logic from the current client app so we can recreate it as a demo inside our own product.

Reviewed on `2026-03-05`.

## Scope Captured

Accessible client routes:

- `/client/dashboard`
- `/client/conversations`
- `/client/chat`
- `/client/knowledge`
- `/client/meetings`
- `/client/analytics`
- `/client/widget`
- `/client/settings`

Primary artifacts are in:

- [output/playwright](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright)

## Global App Shell

Every client page uses the same shell:

- Left sidebar with logo and nav
- Main content area with page title and subtitle
- Bottom-left account card with initials, name, role
- `Sign Out` button below the account card

### Sidebar items

- Dashboard
- Conversations
- Chat Test
- Knowledge Base
- Meetings
- Analytics
- Widget Setup
- Settings

### Core entities visible in the UI

- `organization`
- `widget_config`
- `conversation`
- `conversation_message`
- `lead`
- `knowledge_document`
- `meeting`
- `analytics_summary`
- `user_profile`

## Data Shapes To Mock

These are the minimum data objects the demo should have.

```ts
type Intent = "high" | "medium" | "low";
type ConversationStatus = "none" | "qualified_lead" | "meeting_booked" | "follow_up" | "info_sent";

type Conversation = {
  id: string;
  visitorName: string | null;
  company: string | null;
  intent: Intent;
  status: ConversationStatus;
  entryPoint: string;
  lastMessage: string;
  startedAt: string;
  messages: Array<{
    id: string;
    role: "assistant" | "user";
    text: string;
    time: string;
  }>;
};

type KnowledgeDocument = {
  id: string;
  title: string;
  sourceUrl: string;
  kind: "scraped_page" | "file";
  status: "active" | "inactive" | "processing" | "error";
  sizeLabel: string;
  uploadedAt: string;
  updatedAt: string;
  summary: string;
  tags: string[];
};

type WidgetConfig = {
  displayMode: "inline" | "bubble";
  authorizedDomains: string[];
  primaryColor: string;
  widgetBackground: string;
  fontSize: "small" | "medium" | "large";
  botMessageBackground: string;
  botMessageText: string;
  visitorMessageBackground: string;
  visitorMessageText: string;
  borderColor: string;
  borderThickness: string;
  borderRadius: string;
  shadowEnabled: boolean;
  botName: string;
  botAvatarUrl: string | null;
  openingMessage: string;
  suggestionCards: string[];
  llmProvider: "openai" | "gemini" | "claude" | "deepseek";
  vectorProvider: "openai_embeddings";
  customInstructions: string;
  qualifiedLeadDefinition: string;
  calendarProvider: "none" | "google" | "calendly";
  calendlyToken?: string;
  calendlyEventLink?: string;
};
```

## Page Logic

## 1. Dashboard

Route:

- `/client/dashboard`

Purpose:

- Summary view of funnel activity for the selected time range.

Visible logic:

- Date range filter in header:
  - Last 7 days
  - Last 30 days
  - Last 90 days
- KPI cards:
  - Widget Loads
  - Chat Sessions
  - Meetings Booked
  - Conversion Rate
- `Performance Overview` chart
  - Shows time-series activity over dates
  - Looks like widget loads and chat starts
- `Visitor Intent` donut
  - High / Medium / Low split
- `Recent Conversations`
  - Shows visitor label, company, entry topic, status, date
  - `View All` routes to conversations
- `Knowledge Base` summary card
  - Shows most recent active document
  - `Manage` routes to knowledge base
  - Also shows total and active document counts

Demo notes:

- Treat this page as a static summary dashboard backed by mock analytics aggregates.
- Make the date filter actually swap the KPI numbers and chart values in the demo.

## 2. Conversations

Route:

- `/client/conversations`

Purpose:

- CRM-style list/detail view for visitor chats.

Visible logic:

- Top summary bar:
  - Conversations
  - High Intent
  - Meetings
  - Conversion
  - `Last updated` timestamp
- Filters:
  - Search conversations
  - Status filter:
    - All Status
    - None
    - Qualified Lead
    - Meeting Booked
    - Follow Up
    - Info Sent
  - Intent filter:
    - All Intent
    - High Intent
    - Medium Intent
    - Low Intent
- Left pane:
  - Scrollable conversation list
  - Each row shows:
    - name
    - company
    - intent badge
    - last message or entry topic
    - date/time
- Right pane empty state:
  - `Select a Conversation`
- Right pane selected state:
  - avatar/initial
  - visitor name
  - company
  - intent badge
  - overflow menu
  - message timeline
  - footer status badge
  - conversation started timestamp

Observed action menu:

- `Delete Conversation`

Observed timeline pattern:

- Assistant greeting
- User reply
- Assistant qualification prompt
- User answer
- Assistant next qualification prompt
- Final booking CTA

Demo notes:

- Build this as a master-detail CRM view.
- Seed at least `10-15` mock conversations with varying intent and statuses so filters feel real.
- Include one “meeting booked” thread that shows a guided qualification sequence.

Important current-product issue:

- This page repeatedly throws React runtime or hydration errors and first renders an incorrect zero-state before hydrating real numbers.

## 3. Chat Test

Route:

- `/client/chat`

Purpose:

- Internal QA page for testing the assistant’s live chat behavior.

Visible logic:

- Page title: `Chat Test`
- Main chat panel with:
  - opening assistant message
  - quick reply suggestion cards
  - message timeline
  - bottom composer
- Composer:
  - placeholder `Ask a question...`
  - send icon
  - input is disabled while the assistant is generating

Observed starting quick replies:

- 3D Renderings
- Films & Animations
- Digital Marketing
- Virtual Walkthroughs
- Something Else

Observed flow:

- Load widget config
- Render opening message from widget settings
- Quick reply click sends user turn immediately
- Assistant responds with contextual follow-up
- Free-text response continues the flow
- Each turn posts to `/api/chat`

Observed content behavior:

- It is sales-oriented
- It tends to steer quickly toward discovery and a meeting CTA
- It does not visibly expose structured progress to the user

Demo notes:

- Mirror this as the “engine playground” page, not the production-facing widget.
- Preserve the loading behavior where input locks during generation, but in our demo show better progress affordances.

## 4. Knowledge Base

Route:

- `/client/knowledge`

Purpose:

- Manage the sources used by the assistant.

Visible logic:

- Header actions:
  - view toggle: `List` or `Grid`
  - `Add from Link`
  - `Upload Document`
- Stats row:
  - Total Docs
  - Active
  - Used Storage
  - Recent (7d)
- Search and status filter:
  - `Search documents or tags...`
  - status:
    - All Status
    - Active
    - Inactive
    - Processing
    - Error
- Split layout:
  - document list on left
  - detail panel on right

Observed document row contents:

- source URL
- status badge
- summary line
- size
- uploaded date
- per-row action: `Deactivate`

Observed detail panel contents:

- source URL
- summary
- status
- size
- uploaded
- last updated
- actions:
  - Deactivate
  - Download
  - Delete

Observed modal:

- `Add from Link`
  - Web Page URL
  - Tags (optional)
  - Cancel
  - Add Link

Demo notes:

- We should show both a `scraped URL` doc and an `uploaded file` doc in our demo, even though the current account only has one scraped source.
- Add clear states for processing, failed ingestion, and stale content, even if the current product does not surface them well.

## 5. Meetings

Route:

- `/client/meetings`

Purpose:

- Show meetings booked by the assistant.

Visible logic:

- Summary cards:
  - Total Meetings Booked
  - Upcoming Meetings
  - Past Meetings
- Main section title:
  - `Booked Meetings`
- Empty state:
  - `No Meetings Booked`
  - `Your AI assistant hasn't booked any meetings yet.`

Demo notes:

- The current account renders only the empty state.
- For our demo, this page should show a proper meeting list because the product narrative depends on “chat to booked meeting.”

Important current-product issue:

- Dashboard and Analytics show `8` booked meetings, but this page shows `0`. That inconsistency is worth fixing in our demo data model.

## 6. Analytics

Route:

- `/client/analytics`

Purpose:

- Deeper performance reporting than the dashboard.

Visible logic:

- Date range filter:
  - Last 7 days
  - Last 30 days
  - Last 90 days
- KPI cards:
  - Total Chat Sessions
  - Meetings Booked
  - Qualified Leads
  - Conversion Rate
- Charts:
  - `Conversation Trends`
    - chat sessions + meetings booked over time
  - `Visitor Intent Distribution`
    - High / Medium / Low
  - `Conversation Status Breakdown`
    - Meeting Booked
    - Qualified Lead
    - Follow Up
    - None

Demo notes:

- This should be a clean analytics page with believable funnel numbers.
- Use the same aggregate source as Dashboard and Meetings so numbers stay internally consistent.

## 7. Widget Setup

Route:

- `/client/widget`

Purpose:

- Configure embed code, branding, assistant behavior, and calendar integrations.

This is the richest page in the current product and the one we should mirror most carefully.

### Section A: Widget Embed Code

Visible logic:

- Widget style toggle:
  - Inline
  - Chat Bubble
- Code block changes by style
- `Copy` button
- Installation instructions

Observed inline code:

- container `div`
- `window.contaktlyConfig`
- `displayMode: 'inline'`
- `embed.js`

Observed bubble code:

- `window.contaktlyConfig`
- organization id only
- `embed.js`

### Section B: Authorized Domains

Visible logic:

- input `your-domain.com`
- `Add` button
- removable domain list below

Observed domains:

- `http://www.w3schools.com`
- `cdpn.io`

### Section C: Widget Appearance

Visible logic:

- Primary Color
- Widget Background
- Font Size
- Bot Message Background
- Bot Message Text
- Visitor Message Background
- Visitor Message Text

### Section D: Bot Customization

Visible logic:

- Bot Name
- Bot Avatar upload area
- avatar preview
- optional `Remove` button when avatar exists

Observed values:

- bot name: `Ava`
- greeting text references `Taras`

This mismatch is notable and can be cleaned up in our demo.

### Section E: Widget Border & Shadow

Visible logic:

- Border Color
- Border Thickness
- Border Radius
- Enable Widget Shadow

### Section F: Conversation Starters

Visible logic:

- Opening Message
- Suggestion Cards

Observed values:

- Opening Message:
  - `Hello there 👋 I’m Taras, the studio’s concierge. How can I help?`
- Suggestion Cards:
  - `3D Renderings`
  - `Films & Animations`
  - `Digital Marketing`
  - `Virtual Walkthroughs`
  - `Something Else`

### Section G: AI Configuration

Visible logic:

- Default LLM Provider
  - OpenAI GPT
  - Google Gemini
  - Anthropic Claude
  - DeepSeek
- Vector Database Provider
  - disabled
  - `OpenAI Embeddings`
- Custom LLM Instructions
- Qualified Lead Definition

Observed current config after hydration:

- Default LLM: `Google Gemini`
- Custom Instructions: long company capability description
- Qualified Lead Definition:
  - qualify once identity is enriched, meeting is booked, or work email + opt-in follow-up are captured

### Section H: Calendar Integration

Visible logic:

- Calendar Provider
  - None
  - Google Calendar
  - Calendly

Observed active provider after hydration:

- `Calendly`

Observed Calendly-specific fields:

- Calendly Personal Access Token
- Calendly Event Type Link

Observed event link:

- `https://calendly.com/salesboutique/intro-call`

### Section I: API Keys

Visible logic:

- Informational block only
- Says provider keys are managed by admin

### Section J: Current Configuration Summary

Visible logic:

- Appears after configuration hydration
- Summarizes:
  - Default LLM
  - Vector Provider
  - Custom Instructions set/not set
  - Qualified Lead Definition set/not set
  - Active Calendar
  - Bot Name
  - Bot Avatar
  - Widget Border
  - API Keys Configured

### Save behavior

- `Save Configuration` starts disabled
- becomes enabled after loaded values or changed state are present

Demo notes:

- This page is effectively the product setup wizard compressed into one long form.
- For our demo, consider splitting it into tabs:
  - Embed
  - Appearance
  - Conversation
  - AI
  - Calendar
- Keep the same underlying fields, but present them more clearly.

## 8. Settings

Route:

- `/client/settings`

Purpose:

- Manage profile and password.

Visible logic:

- `Profile Settings`
  - First Name
  - Last Name
  - Email Address
  - Save Profile
- Email is disabled and marked as uneditable
- `Change Password`
  - Current Password
  - New Password
  - Confirm New Password
  - show/hide eye toggles on password inputs
  - Update Password

Demo notes:

- This is a simple account settings page.
- If we need to save time in the demo, this page can be mostly static with basic form interactions.

## Product Behaviors Worth Preserving

- Sidebar-based client app shell
- CRM-like conversations split pane
- Internal Chat Test page separate from widget setup
- Knowledge Base split between list and document details
- Long-form widget configuration page with live operational settings
- Analytics tied to funnel outcomes, not just raw chats

## Product Behaviors Worth Improving In The Demo

- Replace hydration flicker and zero-state flashes with proper loading skeletons
- Keep metrics consistent across Dashboard, Analytics, and Meetings
- Make bot identity consistent across greeting, avatar, and configured bot name
- Show clearer structured progress in chat flows
- Make booking feel native rather than a plain text link handoff

## Demo Build Priority

If we are short on time, implement in this order:

1. Sidebar shell and route structure
2. Dashboard with believable funnel metrics
3. Conversations master-detail view
4. Chat Test with quick replies and a deterministic mock flow
5. Widget Setup with the real field set
6. Knowledge Base split view
7. Analytics charts
8. Meetings and Settings

## Screenshots To Reference

- [Dashboard](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-dashboard.png)
- [Conversations](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-conversations.png)
- [Conversation Detail](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-conversation-detail.png)
- [Chat Test Empty](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-chat-test-empty.png)
- [Chat Test Active](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-chat-test-conversation.png)
- [Knowledge Base](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-knowledge-base.png)
- [Knowledge Document Detail](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-knowledge-document-detail.png)
- [Meetings](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-meetings.png)
- [Analytics](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-analytics.png)
- [Widget Setup](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-widget-setup.png)
- [Widget Setup Chat Bubble State](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-widget-chat-bubble-config.png)
- [Settings](/Users/d/Documents/Projects/full-stack-cf-app/output/playwright/contaktly-settings.png)
