# AG-UI Chat Experiment

A fully custom chat UI in Angular that talks to an agent over the
[AG-UI protocol](https://docs.ag-ui.com), using the AG-UI SDK directly.
CopilotKit is not used anywhere: every component on the screen is plain Angular
code in this repository.

- `frontend/` — Angular 22 app, `@ag-ui/client` + `@ag-ui/core` 1.0.1
- `backend/` — Node + Express 5 server, `@ag-ui/core` + `@ag-ui/encoder` 1.0.1,
  with a scripted (no LLM) agent

## Contents

1. [Running it](#1-running-it)
2. [What you can try](#2-what-you-can-try)
3. [How AG-UI works](#3-how-ag-ui-works)
4. [One message, end to end](#4-one-message-end-to-end)
5. [Architecture](#5-architecture)
6. [Backend walkthrough](#6-backend-walkthrough)
7. [Frontend walkthrough](#7-frontend-walkthrough)
8. [Event sequences per scenario](#8-event-sequences-per-scenario)
9. [Extending the experiment](#9-extending-the-experiment)
10. [Things worth knowing](#10-things-worth-knowing)
11. [What is not covered](#11-what-is-not-covered)
12. [Event reference](#12-event-reference)

---

## 1. Running it

Requirements: Node 20+ (built and tested on Node 24) and npm.

Two terminals:

```bash
# terminal 1 — backend on http://localhost:8000
cd backend
npm install
npm run dev

# terminal 2 — frontend on http://localhost:4200
cd frontend
npm install
npm start
```

Open http://localhost:4200.

The frontend calls `/api/agent`. The Angular dev server proxies `/api/*` to
`http://localhost:8000/*` (`frontend/proxy.conf.json`), so there is no CORS
setup to think about in development.

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | `backend/` | Starts the server with reload on change (`tsx watch`) |
| `npm start` | `backend/` | Starts the server once |
| `npm run typecheck` | `backend/` | `tsc --noEmit` |
| `npm start` | `frontend/` | `ng serve` with the proxy |
| `npm run build` | `frontend/` | Production build into `frontend/dist/` |

Set `PORT` to move the backend to another port (and update `proxy.conf.json`).

## 2. What you can try

The backend agent is scripted. It picks a scenario from keywords in your
message, so each part of the protocol can be triggered on demand. The
**suggestion chips** above the message box send these prompts with one click:

| Chip | Prompt it sends | Protocol feature | What you see |
| --- | --- | --- | --- |
| Weather in Cairo / London | `What is the weather in Cairo?` | Backend tool call + generative UI | A weather card: current conditions, humidity, wind, 5-day forecast. The background follows the condition |
| Bar chart | `Show me a bar chart of revenue by product` | Backend tool call + generative UI | A column chart with a value on every bar |
| Line chart | `Show me a line chart of weekly active users` | same | A two-series line chart with a crosshair readout |
| Donut chart | `Show me a donut chart of traffic sources` | same | A donut with the total in the middle and a legend with values and shares |
| Activity | `Research the best laptops for developers` | Activity events | A checklist that updates in place: each step goes from pending to in progress to done, with a progress bar |
| Approval | `Send the newsletter to all customers` | Interrupt (human in the loop) | The agent pauses and shows an approval card. **Approve** sends, **Reject** does not, and sending any other message instead dismisses it |
| Theme color | `Change the theme color to teal` | Frontend tool call | The agent asks the browser to run a tool; the accent color changes; the agent confirms |
| Reasoning | `Explain how you think` | Reasoning | A collapsible "Reasoning" block, then the answer |
| Error | `Trigger an error` | `RUN_ERROR` | A partial message and an error banner |

You can also type. The agent matches keywords:

| Type this | Protocol feature | What you see |
| --- | --- | --- |
| anything else, e.g. `hello` | Text streaming | The reply appears word by word |
| `weather in <city>` | Backend tool call + steps | The weather card for that city. Cairo, Dubai, London, Paris, Berlin, Miami and Oslo have a fixed condition; other cities get one derived from the name |
| `chart`, `graph` or `plot`, with `line`/`trend` or `donut`/`pie` | Backend tool call + steps | The matching chart; a bar chart otherwise |
| `research <topic>` or `investigate <topic>` | Activity events | The checklist, titled with your topic |
| `send`, `email` or `newsletter` | Interrupt + resume | The approval card |
| `theme` or `color`, with a color name or hex | Frontend tool call | The accent color changes |
| `think`, `reason`, `why` or `explain` | Reasoning | The reasoning block |
| `error`, `fail` or `crash` | `RUN_ERROR` | The error banner |
| press **Stop** while it streams | Abort | The stream stops; the partial text stays |

The **Inspector** panel on the right shows the agent's shared state and every
raw event as it arrives. Click an event to expand its full JSON payload. **New chat** clears the conversation and starts a new
thread.

## 3. How AG-UI works

AG-UI is a protocol between a UI and an agent. It has one request shape and
one response shape.

**Request.** The UI sends a `RunAgentInput` with an HTTP POST:

```jsonc
{
  "threadId": "…",      // the conversation
  "runId": "…",         // this single run
  "messages": [ … ],    // full history: user, assistant, tool, reasoning…
  "tools": [ … ],       // tools the FRONTEND offers to the agent
  "state": { … },       // shared state as the UI last saw it
  "context": []         // extra context items
}
```

The agent is stateless as far as the protocol is concerned: the UI resends the
whole history on every run.

**Response.** The agent answers with a stream of typed events (Server-Sent
Events here; the SDK also supports a binary protobuf encoding). The events this
experiment uses:

| Group | Events | Meaning |
| --- | --- | --- |
| Lifecycle | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` | Every run starts with the first and ends with one of the other two |
| Steps | `STEP_STARTED`, `STEP_FINISHED` | Optional progress markers inside a run |
| Text | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` | One assistant message, streamed as `delta` chunks |
| Tool calls | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT` | A tool call with streamed JSON arguments, and its result when the backend ran it |
| State | `STATE_SNAPSHOT`, `STATE_DELTA` | Full state, or a JSON Patch (RFC 6902) against it |
| Reasoning | `REASONING_START`, `REASONING_MESSAGE_START/CONTENT/END`, `REASONING_END` | The model's thinking, as its own message |
| Activity | `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA` | Structured progress shown as its own widget, created once and then patched |

Protocol 1.0 also defines `MESSAGES_SNAPSHOT`, `SUBAGENT_*`, `CUSTOM`, `RAW`
and the `*_CHUNK` shortcuts. They are not used here. All 31
events and their fields are listed in [section 12](#12-event-reference).

**The client does the bookkeeping.** `@ag-ui/client` reads the stream and
maintains `agent.messages` and `agent.state` for you: text deltas are appended
to the right message, tool calls are attached to their assistant message, tool
results become `tool` messages, JSON patches are applied to the state. The UI
only has to render those two values.

## 4. One message, end to end

This follows one message, "What is the weather in Cairo?", from the click to
the weather card on screen. The request, events and messages are captured from
the running app.

### Step 1: the user sends the message (browser)

Clicking the chip or pressing Enter calls `ChatAgent.send()`
(`frontend/src/app/agent/chat-agent.ts`). It does two things:

1. Adds a user message to the agent's local history with `agent.addMessage()`:
   ```json
   { "id": "badb2d10-…", "role": "user", "content": "What is the weather in Cairo?" }
   ```
   The user bubble appears immediately, before any network call.
2. Calls `agent.runAgent({ tools })`. This starts a **run**.

### Step 2: the client sends the request

`HttpAgent` builds a `RunAgentInput` and POSTs it:

```
POST /api/agent
Content-Type: application/json
Accept: text/event-stream
```
```jsonc
{
  "threadId": "bfdf0ba6-…",
  "runId": "653a0b67-…",
  "protocolVersion": "1.0",
  "state": {},
  "messages": [
    { "id": "badb2d10-…", "role": "user", "content": "What is the weather in Cairo?" }
  ],
  "tools": [
    { "name": "set_theme_color", "description": "Changes the accent color of the chat UI.", "parameters": { /* JSON Schema */ } }
  ],
  "context": [],
  "forwardedProps": {}
}
```

| Field | Meaning |
| --- | --- |
| `threadId` | The conversation. Stays the same until **New chat** |
| `runId` | This one request/response. New on every run |
| `messages` | The **entire** history, every time. The server keeps nothing between runs |
| `state` | The shared state as the browser last saw it (empty on the first run) |
| `tools` | Tools the **browser** can execute, offered to the agent. `get_weather` is not here because the backend owns it |

The Angular dev server forwards `/api/agent` to `http://localhost:8000/agent`.

### Step 3: the server accepts and opens a stream

In `backend/src/server.ts`:

1. The body is validated against the SDK's `RunAgentInputSchema`. A bad body
   gets a `400`.
2. The response is opened as `text/event-stream` and kept open.
3. The server loops over the agent and writes each event as one frame: a
   `data:` line of JSON followed by a blank line.
   ```
   data: {"type":"RUN_STARTED","threadId":"…","runId":"…"}

   ```

### Step 4: the agent produces events

`runMockAgent` in `backend/src/agent.ts` sees the word "weather" and runs
`weatherScenario`. In order, it sends:

| # | Event | Key fields | What it means |
| --- | --- | --- | --- |
| 1 | `RUN_STARTED` | `threadId`, `runId` | The run began |
| 2 | `STATE_SNAPSHOT` | `snapshot: {runCount: 1, lastRole: "user"}` | The full shared state. Later runs send `STATE_DELTA` (a JSON Patch) instead |
| 3 | `TEXT_MESSAGE_START` | `messageId: A`, `role: "assistant"` | A new assistant message begins |
| 4 | `TEXT_MESSAGE_CONTENT` × 7 | `messageId: A`, `delta: "Let "`, `"me "`, … | One word each. Append `delta` to message A |
| 5 | `TEXT_MESSAGE_END` | `messageId: A` | Message A is complete: "Let me check the weather in Cairo." |
| 6 | `STEP_STARTED` | `stepName: "get_weather"` | Progress marker (the header shows `get_weather…`) |
| 7 | `TOOL_CALL_START` | `toolCallId: T`, `toolCallName: "get_weather"`, `parentMessageId: A` | The agent is calling a tool, attached to message A |
| 8 | `TOOL_CALL_ARGS` × 5 | `toolCallId: T`, `delta: "{\"city\":"`, … | The arguments JSON, streamed in pieces |
| 9 | `TOOL_CALL_END` | `toolCallId: T` | Arguments complete: `{"city":"Cairo","unit":"celsius"}` |
| 10 | `TOOL_CALL_RESULT` | `toolCallId: T`, `messageId: R`, `content: "{…}"` | The backend ran the tool; `content` is the weather report as a JSON string |
| 11 | `STEP_FINISHED` | `stepName: "get_weather"` | |
| 12 | `TEXT_MESSAGE_START` / `CONTENT` × 9 / `END` | `messageId: B` | A second assistant message: "It is 30°C and sunny in Cairo right now." |
| 13 | `RUN_FINISHED` | `threadId`, `runId` | The run is over; the server closes the stream |

The IDs tie the events together: every `CONTENT` names its message, every
`ARGS` names its tool call, and the result names the tool call it answers.

### Step 5: the client turns events into messages

The events are not handled by hand. `HttpAgent` reads the stream, updates
`agent.messages` and `agent.state`, and notifies its subscribers after each
change:

| Event arrives | What the library does | Messages after |
| --- | --- | --- |
| `STATE_SNAPSHOT` | replaces `agent.state` | 1 |
| `TEXT_MESSAGE_START` (A) | adds an empty assistant message | 2 |
| each `TEXT_MESSAGE_CONTENT` | appends `delta` to message A's `content` | 2 |
| `TOOL_CALL_START` | adds a `toolCalls` entry on message A | 2 |
| each `TOOL_CALL_ARGS` | appends to that tool call's `arguments` string | 2 |
| `TOOL_CALL_RESULT` | adds a new message with `role: "tool"` | 3 |
| `TEXT_MESSAGE_START` (B) | adds a second assistant message | 4 |

When the run ends, the history is these four messages:

```jsonc
[
  { "role": "user", "content": "What is the weather in Cairo?" },
  {
    "role": "assistant",
    "content": "Let me check the weather in Cairo.",
    "toolCalls": [
      {
        "id": "T",
        "type": "function",
        "function": { "name": "get_weather", "arguments": "{\"city\":\"Cairo\",\"unit\":\"celsius\"}" }
      }
    ]
  },
  { "role": "tool", "toolCallId": "T", "content": "{\"city\":\"Cairo\",\"condition\":\"sunny\",\"temperature\":30,…}" },
  { "role": "assistant", "content": "It is 30°C and sunny in Cairo right now." }
]
```

### Step 6: messages become signals (Angular)

`ChatAgent` subscribes to the agent in its constructor:

- `onMessagesChanged` copies the array into the `_messages` signal. It fires
  on every delta (25 times in this run), which is why the text appears word by
  word.
- `onStateChanged` sets the `state` signal (the Inspector's "Shared state").
- `onEvent` appends to the `events` signal (the Inspector's event list).
- `onStepStartedEvent` / `onStepFinishedEvent` drive the `get_weather…`
  label in the header.

### Step 7: signals become what you see

1. `toChatItems` (`agent/chat-item.ts`) reshapes the four messages into three
   rows. The `tool` message is not a row: its content is attached to tool call
   `T` as `result`.
2. `ChatMessage` looks at the tool name and picks `WeatherCard` for
   `get_weather`.
3. `WeatherCard` goes through two states:
   - **Before event 10**, `result` is `null`, so it shows "Checking the
     weather in Cairo…". The city comes from the arguments once they finish
     streaming.
   - **After event 10**, it parses the JSON and draws the card.
4. The second assistant message streams in below the card.

### Step 8: the run ends

`RUN_FINISHED` arrives, `runAgent()` resolves, and `running` goes back to
`false`: **Stop** becomes **Send** again and the chips are re-enabled.

The client also checks whether any tool call was left without a result
(`onRunFinishedEvent` → `pendingToolCallIds`). Here there is none, because the
backend answered `get_weather` itself. For "Change the theme color" there is
one: the browser runs the tool, adds a `tool` message, and starts a second run
automatically (see "Frontend tools — the run loop" in section 7).

### The next message

The next POST carries all four messages plus the new one, and
`state: {runCount: 1, lastRole: "user"}`. The agent replies with a
`STATE_DELTA` that sets `runCount` to 2 instead of a full snapshot.

To watch this live, open the Inspector, click **Weather in Cairo**, and expand
any event to see its exact JSON.

### Who defines a tool?

Either side can. Whoever executes the tool defines it.

| | Backend tool | Frontend tool |
| --- | --- | --- |
| Example here | `get_weather`, `show_chart` | `set_theme_color` |
| Defined in | the backend (`backend/src/agent.ts`) | the frontend (`agent/frontend-tools.ts`) |
| Sent in the request's `tools` array | no | yes, on every run |
| Who runs it | the server | the browser |
| How the result gets back | the server emits `TOOL_CALL_RESULT` in the same run | the browser adds a `tool` message and starts a second run |
| Use it for | data and secrets: databases, APIs, anything needing keys | things only the browser can do: change the UI, navigate, read a form, ask the user to confirm |

Backend tools never travel over the protocol as definitions: the backend
already knows them, and the frontend only sees the resulting `TOOL_CALL_*`
events. Frontend tools are advertised by the browser in `tools` (name,
description, JSON Schema for the parameters).

With a real LLM, the backend gives the model both lists. When the model picks
a tool, the backend checks where it came from: its own tool is run and
answered in the same run; a tool from `input.tools` is emitted as a call with
no result, and the run finishes so the browser can take over.

How a tool **looks** is a separate question and always the frontend's
decision. `get_weather` is defined and executed on the backend, but the
weather card is chosen in the frontend by matching the tool name.

## 5. Architecture

```
┌──────────────────────── frontend (Angular) ────────────────────────┐
│                                                                    │
│  Chat ── MessageList ── ChatMessage ─┬─ WeatherCard                │
│   │  └── Suggestions                 ├─ ChartCard ── Bar/Line/Donut│
│   │  └── Composer                    ├─ ApprovalCard               │
│   │                                  ├─ ChecklistActivity          │
│   │  └── Inspector                   └─ ToolCall (generic)         │
│   │            ▲ signals: items, state, events, running, error     │
│   ▼            │                                                   │
│  ChatAgent (service) ──────── FrontendTools ── Theme               │
│   │   wraps HttpAgent from @ag-ui/client                           │
└───┼────────────────────────────────────────────────────────────────┘
    │  POST /api/agent   body: RunAgentInput
    │  ◄── text/event-stream of AG-UI events
┌───▼──────────────────── backend (Express) ─────────────────────────┐
│  server.ts   validates the input, encodes events as SSE            │
│  agent.ts    async generator that yields AG-UI events              │
└────────────────────────────────────────────────────────────────────┘
```

### Files

```
backend/
  src/server.ts            HTTP endpoint, SSE encoding, abort handling
  src/agent.ts             the scripted agent (scenarios → events)
  src/demo-data.ts         fake weather reports and chart specs

frontend/
  proxy.conf.json          /api → http://localhost:8000
  src/styles.scss          design tokens (CSS variables), light + dark
  src/app/
    agent/                 everything that knows about AG-UI
      agent-url.ts         AGENT_URL injection token
      chat-agent.ts        HttpAgent ↔ signals bridge, frontend tool loop
      chat-item.ts         messages → rows the UI renders
      frontend-tools.ts    registry of tools the browser executes
      theme.ts             accent color, changed by a frontend tool
    chat/                  everything that is only UI
      chat.*               page layout, header, wiring
      message-list/        scrolling list, empty state, typing indicator
      chat-message/        one row: user bubble, assistant text, reasoning
      tool-call/           generic tool card with arguments and result
      approval-card/       send_newsletter: Approve / Reject while the agent is paused
      checklist-activity/  activity of type "checklist": steps with live status
      weather-card/        get_weather result as a weather card (+ icons)
      chart-card/          show_chart result: title, chart, table view
      charts/              bar-chart, line-chart, donut-chart, chart-spec
      suggestions/         one-click prompt chips
      composer/            textarea, Send / Stop
      inspector/           shared state + raw event log
```

The split matters for customization: the `chat/` components receive plain data
through signal inputs and know nothing about AG-UI. You can restyle or replace
any of them without touching the protocol code.

## 6. Backend walkthrough

### `server.ts`

One endpoint, `POST /agent`:

1. Validates the body with `RunAgentInputSchema` from `@ag-ui/core/schemas`
   (a zod schema shipped by the SDK). Invalid input gets a `400` with the
   issues.
2. Opens an SSE response. `EventEncoder` from `@ag-ui/encoder` provides the
   content type and turns each event into a `data: {...}\n\n` frame.
3. Iterates the agent generator and writes each event.
4. Listens for the connection closing. That is how **Stop** arrives on the
   server: the browser aborts the fetch, the socket closes, and an
   `AbortSignal` tells the agent to stop producing.
5. If the agent throws, a `RUN_ERROR` event is sent so the client always gets
   a clean end of run.

`GET /health` returns `{ "status": "ok" }`.

### `agent.ts`

`runMockAgent(input, signal)` is an async generator of AG-UI events. The shape
is what any real agent would produce:

```ts
yield { type: EventType.RUN_STARTED, threadId, runId };
// … state, text, tool calls …
yield { type: EventType.RUN_FINISHED, threadId, runId };
```

Helpers:

- `streamText(text)` — `TEXT_MESSAGE_START` → one `TEXT_MESSAGE_CONTENT` per
  word → `TEXT_MESSAGE_END`. Returns the message id.
- `streamToolCall(name, args, parentMessageId)` — `TOOL_CALL_START` → the JSON
  arguments in 8-character `TOOL_CALL_ARGS` chunks → `TOOL_CALL_END`. Returns
  the tool call id. `parentMessageId` attaches the call to the assistant
  message that announced it.
- `updateState(input)` — sends `STATE_SNAPSHOT` on the first run of a thread
  and a `STATE_DELTA` JSON Patch afterwards. The state is
  `{ runCount, lastRole }`; it is read from `input.state`, which the client
  sends back on every run.

The events are typed with `AGUIEvent` from `@ag-ui/core`, so a wrong or
missing field is a compile error.

## 7. Frontend walkthrough

### `ChatAgent` — the bridge (`agent/chat-agent.ts`)

It owns one `HttpAgent` and exposes read-only signals:

| Signal | Source |
| --- | --- |
| `items` | `computed` from the agent's messages via `toChatItems` |
| `state` | `onStateChanged` |
| `events` | `onEvent` (last 300, for the Inspector) |
| `step` | `onStepStartedEvent` / `onStepFinishedEvent` |
| `running` | set around `runAgent()` |
| `error` | `onRunErrorEvent` / `onRunFailed` |

The connection between the SDK and Angular is `agent.subscribe({...})`. The
subscriber callbacks fire as events arrive, and each one writes a signal. The
app is zoneless; signals are what trigger rendering.

Public methods:

- `send(text)` — adds a user message with `agent.addMessage()` and runs. If an
  interrupt is open, it is cancelled first (see "Interrupts" below).
- `answer(interruptId, approved)` — answers an approval interrupt and resumes.
- `stop()` — `agent.abortRun()`.
- `reset()` — clears messages and state and assigns a new `threadId`.

### Frontend tools — the run loop

A frontend tool is a tool the agent *calls* but the browser *executes*. The
flow has two runs:

```
run 1   UI ──► RunAgentInput { tools: [set_theme_color], messages }
        agent ──► TEXT_MESSAGE_*  TOOL_CALL_START/ARGS/END  RUN_FINISHED
                  (no TOOL_CALL_RESULT: the call is left pending)

        UI executes the tool, appends { role: 'tool', toolCallId, content }

run 2   UI ──► RunAgentInput { messages: […, tool message] }
        agent ──► TEXT_MESSAGE_*  RUN_FINISHED
```

In code (`ChatAgent.run`):

```ts
do {
  this.pendingToolCallIds = [];
  await this.agent.runAgent({ tools: this.tools.definitions });
} while (!this.aborted && (await this.executePendingToolCalls()));
```

`onRunFinishedEvent` receives `pendingToolCallIds` from the SDK: the tool calls
of that run that got no result. `executePendingToolCalls` looks each one up in
`FrontendTools`, runs it, and appends the tool message. If nothing was
executed, the loop ends.

Tools are declared in `agent/frontend-tools.ts` as a `definition` (name,
description, JSON Schema parameters — sent to the agent) plus an `execute`
function (runs in the browser, returns the result string).

### Interrupts — human in the loop

An interrupt is the agent stopping because it needs something from a person
before it can continue. The example is a newsletter the agent may not send
without approval. Like a frontend tool it takes two runs, but the answer comes
from the user and travels in a dedicated `resume` field.

**Run 1: the agent pauses.** It streams the tool call it wants to make, gives
no result, and ends the run with an `interrupt` outcome:

```jsonc
{
  "type": "RUN_FINISHED",
  "threadId": "…",
  "runId": "…",
  "outcome": {
    "type": "interrupt",
    "interrupts": [
      {
        "id": "approval:989dff89-…",
        "reason": "approval_required",
        "message": "Send \"October product update\" to 240 customers?",
        "toolCallId": "989dff89-…",
        "responseSchema": { "type": "object", "properties": { "approved": { "type": "boolean" } }, "required": ["approved"] }
      }
    ]
  }
}
```

The connection closes. Nothing is running on the server while the user
decides. The client keeps the open interrupts in `agent.pendingInterrupts`,
and `ChatAgent` mirrors them into a signal. `toChatItems` attaches each one to
its tool call (matched by `toolCallId`), so `ApprovalCard` shows the question
and the **Approve** / **Reject** buttons.

**Run 2: the UI resumes.** A new run on the same thread, with one `resume`
entry per open interrupt:

```jsonc
// in the RunAgentInput, next to messages / tools / state
"resume": [
  { "interruptId": "approval:989dff89-…", "status": "resolved", "payload": { "approved": true } }
]
```

The agent reads the answer, closes the tool call with a `TOOL_CALL_RESULT`,
and replies. There are three ways it can go:

| The user… | `resume` entry | The agent | Card |
| --- | --- | --- | --- |
| clicks **Approve** | `status: "resolved"`, `payload: { approved: true }` | runs the tool: result `{"status":"sent","recipients":240}` | Approved |
| clicks **Reject** | `status: "resolved"`, `payload: { approved: false }` | does not run it: result `{"status":"rejected"}` | Rejected |
| sends another message instead | `status: "cancelled"`, no payload | does not run it: result `{"status":"cancelled"}` | Dismissed |

`resolved` means the question was answered (yes or no are both answers).
`cancelled` means it was abandoned without an answer. In both non-approve
cases the task is not completed, and the card stays in the chat as a record.

The third row is two runs: `send()` first resumes with every open interrupt
cancelled, and only then adds the new message and runs again. The order
matters, because **the SDK refuses to run a thread that has open interrupts
not addressed by `resume`** ("Thread has 1 pending interrupt(s) not addressed
by resume").

In code, `ChatAgent.run(answers)` builds the array: each open interrupt gets
the matching answer, or `cancelled` if there is none.

How the stateless backend finds its place again: the interrupt id is
`approval:<toolCallId>`, so the resume run knows which tool call to close
without storing anything. A real agent framework would use its own
checkpointing instead. The backend also skips an entry whose tool call already
has a result, so a resume that is sent twice does not close it twice.

Interrupts versus the other ways a run stops:

| | Ends with | Who acts next | How the thread continues |
| --- | --- | --- | --- |
| Frontend tool | `outcome: success`, a tool call without result | browser code, automatically | a `tool` message in the history |
| Interrupt | `outcome: interrupt` + `interrupts` | a person | the `resume` field |
| **Stop** button | the HTTP request is aborted, no `RUN_FINISHED` | nobody | the next message is an ordinary run |
| `RUN_ERROR` | an error event | nobody | the next message is an ordinary run |

### Activities — progress as a widget

An activity is structured progress that is not conversation text. The agent
creates it once and then changes it in place, so the chat shows one widget
that updates instead of a stream of "now doing X" sentences.

**Create it** with `ACTIVITY_SNAPSHOT`. `activityType` is a free name the
frontend uses to pick a component, and `content` is any JSON object:

```jsonc
{
  "type": "ACTIVITY_SNAPSHOT",
  "messageId": "91ea64df-…",
  "activityType": "checklist",
  "content": {
    "title": "Research: the best laptops for developers",
    "steps": [
      { "label": "Search the web", "status": "pending" },
      { "label": "Read the sources", "status": "pending" },
      { "label": "Compare the candidates", "status": "pending" },
      { "label": "Write the summary", "status": "pending" }
    ]
  }
}
```

**Update it** with `ACTIVITY_DELTA`: a JSON Patch against that content,
addressed by the same `messageId`.

```jsonc
{ "type": "ACTIVITY_DELTA", "messageId": "91ea64df-…", "activityType": "checklist",
  "patch": [{ "op": "replace", "path": "/steps/0/status", "value": "running" }] }

{ "type": "ACTIVITY_DELTA", "messageId": "91ea64df-…", "activityType": "checklist",
  "patch": [
    { "op": "replace", "path": "/steps/0/status", "value": "done" },
    { "op": "add", "path": "/steps/0/detail", "value": "14 sources found" }
  ] }
```

The research scenario sends 1 snapshot and 8 deltas (two per step).

On the client, the snapshot becomes a message with `role: "activity"` in
`agent.messages`, and each delta is applied to its `content`. The same
`onMessagesChanged` callback fires, so nothing new is needed in `ChatAgent`.
`toChatItems` turns the message into a row with `activity: { type, content }`,
and `ChatMessage` picks the component by type, exactly like it does for tools:

```html
@switch (activity.type) {
  @case ('checklist') { <app-checklist-activity [content]="activity.content" [live]="live()" /> }
  @default            { <pre>{{ activity.content | json }}</pre> }
}
```

`ChecklistActivity` shows the title, an "n of m" count, a progress bar and the
steps. `live` is true only while the run is in progress and the row is the
last one: if you press **Stop** in the middle, the step that was running is
shown as "Stopped" instead of spinning forever.

How the three kinds of progress compare:

| | Carries | Stored as a message | Use for |
| --- | --- | --- | --- |
| Step (`STEP_STARTED` / `STEP_FINISHED`) | a name | no | a one-line "doing X…" label |
| Activity (`ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA`) | any JSON, patched over time | yes, role `activity` | a widget that updates: checklist, plan, search progress |
| Tool call | arguments and a result | yes | an action and its outcome |

Activity messages are part of the history, so they are sent back to the server
on the next run like any other message.

### `toChatItems` — the view model (`agent/chat-item.ts`)

AG-UI messages are not quite what a chat renders: a tool result is a separate
`tool` message, but on screen it belongs inside the card of the call it
answers. `toChatItems` flattens the message list into `ChatItem` rows
(`user`, `assistant`, `reasoning`, `activity`) and joins each tool call with its result by
`toolCallId`. An open interrupt that names a tool call is attached the same
way, as `ToolCallView.interrupt`. Components only ever see `ChatItem` and
`ToolCallView`.

### Components (`chat/`)

All are standalone, `OnPush`, with signal inputs (`input()`), outputs
(`output()`) and signal queries (`viewChild()`).

- **`Chat`** — the page. Injects `ChatAgent`, passes signals down, wires
  outputs back to `send` / `stop` / `reset`.
- **`MessageList`** — renders rows, the empty state, and
  a typing indicator while the run has produced nothing yet. It follows the
  stream with `afterRenderEffect`, and stops following if you scroll up more
  than 80px from the bottom.
- **`ChatMessage`** — a user bubble, assistant text plus tool cards, or a
  collapsible reasoning block. It picks the component for each tool call (see
  "Generative UI" below).
- **`Suggestions`** — the chips above the composer. Each has a short label
  and the full prompt it sends; they are disabled during a run.
- **`ToolCall`** — the generic `<details>` card: name, running/done status, arguments
  (shown raw while the JSON is still incomplete, pretty-printed once it
  parses) and the result.
- **`Composer`** — Enter sends, Shift+Enter adds a line; the button becomes
  **Stop** during a run.
- **`Inspector`** — shared state as JSON and the event log, newest first.
  Each row shows the event type and a one-line payload; clicking it expands
  the full event as formatted JSON, with a **Copy** button. **Expand all** /
  **Collapse all** act on every row.

### Generative UI — tool results as components

The agent does not send HTML. It calls a tool, and the chat decides how that
tool looks. `ChatMessage` switches on the tool name:

```html
@switch (call.name) {
  @case ('get_weather') { <app-weather-card [call]="call" /> }
  @case ('show_chart')  { <app-chart-card [call]="call" /> }
  @case ('send_newsletter') { <app-approval-card [call]="call" (answer)="answer.emit($event)" /> }
  @default              { <app-tool-call [call]="call" /> }
}
```

Each card receives the same `ToolCallView` (`name`, `args`, `result`) and
handles three states:

| State | Condition | Rendered |
| --- | --- | --- |
| Loading | `result === null` | A placeholder ("Checking the weather in Cairo…", chart skeleton) |
| Ready | the result parses into the expected shape | The card |
| Unknown | the result does not parse | The generic `ToolCall` card, so nothing is lost |

The result is validated before use (`parseWeatherReport`, `parseChartSpec`):
a tool result is data from outside the app.

**`WeatherCard`** shows city, condition, temperature, high/low, feels-like,
humidity, wind and a 5-day forecast. The gradient is chosen by
`data-condition` (sunny, partly-cloudy, cloudy, rain, storm, snow) and the
icons are inline SVG in `WeatherIcon`. The card keeps its own colors in light
and dark mode.

**`ChartCard`** shows the title and subtitle, a **Table** button that swaps
the chart for a table of the same numbers, and one of three chart components
chosen by `spec.type`.

### Charts (`chat/charts/`)

The charts are hand-written SVG with no chart library. All three take one
input, a `ChartSpec`:

```ts
interface ChartSpec {
  type: 'bar' | 'line' | 'donut';
  title: string;
  subtitle?: string;
  valuePrefix?: string;   // "$"
  valueSuffix?: string;   // "K"
  categories: string[];   // x-axis labels, or donut segment names
  series: { name: string; values: number[] }[];  // one value per category
}
```

| Component | Draws | Reading values |
| --- | --- | --- |
| `BarChart` | Columns, rounded at the top. One series: the value sits on every bar. Several series: grouped bars, a y-axis and a legend | Hover or Tab to a bar for a tooltip |
| `LineChart` | One line per series, a legend, the latest value at the end of each line | A crosshair snaps to the nearest date and lists every series; with keyboard focus, the left and right arrow keys move it |
| `DonutChart` | The first series as shares of a whole, total in the middle. More than 4 categories: the tail is merged into "Other" | The legend lists every value and percentage; hovering a segment or a row highlights it |

Chart colors are the `--series-1…4` variables in `styles.scss`, with separate
light and dark values. The order is fixed: series 1 is always blue, series 2
orange, and so on, and a fifth series is drawn gray rather than inventing a
color. The four colors were checked for color-blind separation against both
surfaces. On the light surface the green and yellow are below 3:1 contrast,
which is why every chart also has visible labels and the table view.

`chart-spec.ts` holds the shared helpers: `parseChartSpec`, `formatValue`,
`seriesColor` and `niceTicks` (round axis steps).

### Styling

`src/styles.scss` defines the design tokens as CSS variables (`--accent`,
`--surface`, `--border`, …) using `light-dark()`, so the UI follows the system
color scheme. Component styles only reference those tokens. `--accent` is the
variable the `set_theme_color` tool overwrites at runtime.

## 8. Event sequences per scenario

**Plain text**

```
RUN_STARTED
STATE_SNAPSHOT | STATE_DELTA
TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT × n → TEXT_MESSAGE_END
RUN_FINISHED
```

**Backend tool (`weather`, and `show_chart` with the same shape)**

```
RUN_STARTED
STATE_DELTA
TEXT_MESSAGE_START … TEXT_MESSAGE_END           "Let me check…"
STEP_STARTED        stepName: get_weather
TOOL_CALL_START     toolCallName: get_weather, parentMessageId
TOOL_CALL_ARGS × n  {"city":"Cairo","unit":"celsius"} in chunks
TOOL_CALL_END
TOOL_CALL_RESULT    content: {"city":"Cairo","condition":"sunny","temperature":30,…}
STEP_FINISHED
TEXT_MESSAGE_START … TEXT_MESSAGE_END           "It is 30°C…"
RUN_FINISHED
```

**Frontend tool (`theme`)** — two runs, see the loop above.

**Activity (`research`)**

```
RUN_STARTED
STATE_DELTA
TEXT_MESSAGE_START … TEXT_MESSAGE_END           "On it. I will work through these steps:"
ACTIVITY_SNAPSHOT   activityType: checklist, content: { title, steps: 4 × pending }
ACTIVITY_DELTA      /steps/0/status → running
ACTIVITY_DELTA      /steps/0/status → done, /steps/0/detail added
…                   the same pair for steps 1, 2 and 3
TEXT_MESSAGE_START … TEXT_MESSAGE_END           "I finished researching…"
RUN_FINISHED
```

**Interrupt (`newsletter`)** — two runs

```
run 1
RUN_STARTED
STATE_DELTA
TEXT_MESSAGE_START … TEXT_MESSAGE_END           "…needs your approval."
TOOL_CALL_START     toolCallName: send_newsletter
TOOL_CALL_ARGS × n  {"subject":"October product update","audience":"All customers","recipients":240}
TOOL_CALL_END
RUN_FINISHED        outcome: { type: "interrupt", interrupts: [ … ] }

run 2 (request carries "resume")
RUN_STARTED
STATE_DELTA
STEP_STARTED        only when approved
TOOL_CALL_RESULT    content: {"status":"sent","recipients":240}
STEP_FINISHED       only when approved
TEXT_MESSAGE_START … TEXT_MESSAGE_END           "Done. The newsletter was sent…"
RUN_FINISHED
```

**Reasoning**

```
RUN_STARTED
STATE_DELTA
REASONING_START
REASONING_MESSAGE_START → REASONING_MESSAGE_CONTENT × n → REASONING_MESSAGE_END
REASONING_END
TEXT_MESSAGE_START … TEXT_MESSAGE_END
RUN_FINISHED
```

**Error**

```
RUN_STARTED
TEXT_MESSAGE_START … TEXT_MESSAGE_END
RUN_ERROR           message: "Simulated agent failure", code: DEMO_ERROR
```

To watch the raw stream without the UI:

```bash
curl -N -X POST http://localhost:8000/agent \
  -H "Content-Type: application/json" \
  -d '{"threadId":"t1","runId":"r1","messages":[{"id":"m1","role":"user","content":"weather in Cairo"}],"tools":[],"context":[]}'
```

## 9. Extending the experiment

### Add a frontend tool

Add an entry to the `tools` array in `frontend/src/app/agent/frontend-tools.ts`:

```ts
{
  definition: {
    name: 'show_alert',
    description: 'Shows a browser alert.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  execute: ({ text }) => {
    alert(String(text));
    return 'Alert shown.';
  },
},
```

The definition is sent with every run. With a real LLM behind the agent that is
enough; with the scripted agent you also add a scenario that emits a tool call
named `show_alert`.

### Add a component for a tool

1. Make the backend emit a tool call with a JSON result (see the next
   section), for example `get_stock` → `{ "symbol": "ACME", "price": 42 }`.
2. Create a component with a `call = input.required<ToolCallView>()`, parse
   `call().result`, and handle the loading and unknown states like
   `WeatherCard` does.
3. Add a `@case ('get_stock')` in `chat-message.html` and the component to
   the `imports` of `ChatMessage`.
4. Optionally add a chip in `suggestions.ts`.

To show a chart from any tool, return a `ChartSpec` and reuse `ChartCard`.

### Add a backend scenario

In `backend/src/agent.ts`, add a branch in `runMockAgent` and write a generator
with the helpers:

```ts
async function* myScenario(signal: AbortSignal): Events {
  const messageId = yield* streamText('Working on it.', signal);
  const toolCallId = yield* streamToolCall('search', { query: 'ag-ui' }, messageId, signal);
  yield { type: EventType.TOOL_CALL_RESULT, messageId: randomUUID(), toolCallId, content: '3 results' };
  yield* streamText('Found 3 results.', signal);
}
```

### Plug in a real LLM

Keep `server.ts` as is and replace the scripted branches in `agent.ts`. The
mapping from a model's streaming API to AG-UI is mechanical:

| Model stream | AG-UI events |
| --- | --- |
| a text block starts / text delta / block ends | `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` |
| a tool-use block starts / argument JSON delta / block ends | `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` |
| a thinking block | `REASONING_*` |
| you executed a tool on the server | `TOOL_CALL_RESULT`, then call the model again |
| the model called a tool from `input.tools` | emit the call, **no** result, `RUN_FINISHED` — the frontend runs it |

Going the other way, convert `input.messages` into the provider's message
format and pass `input.tools` as the provider's tool definitions.

### Use another backend

Nothing in the frontend depends on Node. Any server that accepts a
`RunAgentInput` POST and streams AG-UI events as SSE works: point `AGENT_URL`
(`agent/agent-url.ts`) or the proxy target at it. AG-UI publishes a Python SDK
(`ag-ui-protocol`) and integrations for agent frameworks such as LangGraph,
CrewAI, Mastra and Pydantic AI.

### Change the look

- Colors, radius, fonts: the variables in `src/styles.scss`.
- A single part of the chat: its component folder under `chat/`.
- What a row is (e.g. grouping, timestamps, avatars): `ChatItem` and
  `toChatItems`.
- Markdown in assistant messages: render `message.text` through a markdown
  library in `ChatMessage`. Text is currently shown as plain text with
  `white-space: pre-wrap`.

## 10. Things worth knowing

Findings from building this against `@ag-ui/*` 1.0.1:

- **The agent mutates `agent.messages` in place.** Passing the same array to a
  signal would not trigger an update, so `ChatAgent` sets a copy
  (`[...messages]`) in `onMessagesChanged`. That callback fires for every
  content delta.
- **`RUN_ERROR` does not reject `runAgent()`.** The promise resolves; the error
  arrives through `onRunErrorEvent`. `onRunFailed` covers transport failures
  (for example the backend being down).
- **Aborting is reported as a run error** with the message "This operation was
  aborted". `ChatAgent` keeps an `aborted` flag so pressing Stop does not show
  an error banner.
- **Partial output survives an abort or an error.** Whatever was streamed stays
  in `agent.messages` and is sent back as history on the next run.
- **Open interrupts block the thread.** `runAgent()` throws if
  `agent.pendingInterrupts` is not empty and `resume` does not address every
  one of them. They are cleared only when a later run succeeds, so a failed or
  stopped resume can be retried.
- **`pendingToolCallIds` is computed by the SDK** from the stream (tool calls
  started in the run that received no result). The backend does not have to
  declare them.
- **Bundle size.** `@ag-ui/client` brings zod and the protobuf runtime; the
  production bundle is about 1.2 MB raw (≈204 kB transferred). The `initial`
  budget in `angular.json` was raised to 1.5 MB warning / 2 MB error for that
  reason.
- **`@ag-ui/core` needs zod** as a peer dependency; npm installs it
  automatically.
- **SSE through the dev proxy works** without extra configuration. The server
  sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` so reverse proxies
  do not buffer the stream.

## 11. What is not covered

- No real LLM: answers are scripted.
- No persistence: the conversation lives in memory in the browser tab and is
  lost on reload. The backend stores nothing.
- No authentication on the endpoint, and CORS is open (`cors()` with defaults).
- Interrupts are shown for one case only: approving a tool call. An interrupt
  without a `toolCallId` is not rendered, `responseSchema` is not used to build
  a form, and `expiresAt` is ignored.
- Activities are shown for one type only (`checklist`); any other type falls
  back to its raw JSON.
- Not exercised: subagents, multimodal input, `MESSAGES_SNAPSHOT`, the
  protobuf transport.
- The weather and chart data are fake (`backend/src/demo-data.ts`).
- The charts do not handle negative values, and the SVG scales with the card
  width, so text gets smaller on narrow screens.
- No markdown rendering and no automated tests. The app was verified by driving
  it in headless Chrome through every scenario in section 2, plus Stop and
  New chat, in light and dark mode.

## 12. Event reference

AG-UI 1.0 defines 31 events. This list is read from the type definitions of
`@ag-ui/core` 1.0.1; the last column shows which ones this project emits.

Every event has a `type` and accepts three optional fields: `timestamp`,
`rawEvent` and `metadata`. Most also accept `subagentRunId`.

### Run lifecycle

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `RUN_STARTED` | `threadId`, `runId`, `parentRunId?`, `input?` | A run began | yes |
| `RUN_FINISHED` | `threadId`, `runId`, `result?`, `outcome?`, `usage?` | The run ended without failing. `outcome` is `success`, `interrupt` or `cancelled` | yes |
| `RUN_ERROR` | `message`, `code?`, `usage?` | The run failed | yes |
| `STEP_STARTED` | `stepName` | A named step inside the run began | yes |
| `STEP_FINISHED` | `stepName` | That step ended | yes |

### Text messages

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `TEXT_MESSAGE_START` | `messageId`, `role?`, `name?` | A message begins | yes |
| `TEXT_MESSAGE_CONTENT` | `messageId`, `delta` | A piece of text to append | yes |
| `TEXT_MESSAGE_END` | `messageId` | The message is complete | yes |
| `TEXT_MESSAGE_CHUNK` | `messageId?`, `role?`, `delta?`, `name?` | Shortcut: one event type instead of start/content/end; the client expands it | no |

### Tool calls

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `TOOL_CALL_START` | `toolCallId`, `toolCallName`, `parentMessageId?` | The agent starts calling a tool | yes |
| `TOOL_CALL_ARGS` | `toolCallId`, `delta` | A piece of the arguments JSON | yes |
| `TOOL_CALL_END` | `toolCallId` | The arguments are complete | yes |
| `TOOL_CALL_RESULT` | `messageId`, `toolCallId`, `content` | The result of a tool the backend ran | yes |
| `TOOL_CALL_CHUNK` | `toolCallId?`, `toolCallName?`, `parentMessageId?`, `delta?` | Shortcut for start/args/end | no |

### State and history

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `STATE_SNAPSHOT` | `snapshot` | The full shared state | yes |
| `STATE_DELTA` | `delta` (JSON Patch) | Changes to apply to the state | yes |
| `MESSAGES_SNAPSHOT` | `messages` | The full message history, replacing the client's copy | no |

### Reasoning

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `REASONING_START` | `messageId` | A reasoning phase begins | yes |
| `REASONING_MESSAGE_START` | `messageId`, `role: "reasoning"` | A reasoning message begins | yes |
| `REASONING_MESSAGE_CONTENT` | `messageId`, `delta` | A piece of reasoning text | yes |
| `REASONING_MESSAGE_END` | `messageId` | The reasoning message is complete | yes |
| `REASONING_END` | `messageId` | The reasoning phase ended | yes |
| `REASONING_MESSAGE_CHUNK` | `messageId?`, `delta?` | Shortcut for start/content/end | no |
| `REASONING_ENCRYPTED_VALUE` | `subtype` (`message` or `tool-call`), `entityId`, `encryptedValue` | An opaque encrypted reasoning blob attached to a message or tool call, to be sent back unchanged | no |

### Activity

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `ACTIVITY_SNAPSHOT` | `messageId`, `activityType`, `content`, `replace?` | A structured progress item (for example a plan or a search in progress), stored as a message with role `activity` | yes |
| `ACTIVITY_DELTA` | `messageId`, `activityType`, `patch` (JSON Patch) | An update to that item | yes |

### Subagents

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `SUBAGENT_STARTED` | `subagentRunId`, `name`, `description?`, `parentToolCallId?`, `parentMessageId?` | The agent delegated work to a subagent | no |
| `SUBAGENT_FINISHED` | `subagentRunId`, `result?`, `outcome?` | The subagent finished | no |
| `SUBAGENT_ERROR` | `subagentRunId`, `message`, `code?` | The subagent failed | no |

Events produced by a subagent carry its `subagentRunId`, which is how the UI
tells them apart from the parent's.

### Escape hatches

| Event | Key fields | Meaning | Used here |
| --- | --- | --- | --- |
| `CUSTOM` | `name`, `value` | Anything application-specific that the protocol does not model | no |
| `RAW` | `event`, `source?` | An event from the underlying framework or provider, passed through untouched | no |

### Things that are not events

A few features travel a different way:

- **Interrupts** are the `outcome` of `RUN_FINISHED`, and the answer goes in
  the `resume` field of the next request (section 7, "Interrupts").
- **Frontend tool results** are a `tool` message the browser adds to the
  history before starting a new run.
- **Stop** has no event: the client closes the connection.
