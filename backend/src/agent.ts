import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventType, contentToText } from '@ag-ui/core';
import type { AGUIEvent, Message, RunAgentInput, RunFinishedOutcome } from '@ag-ui/core';
import { chartFor, describeChart, weatherFor } from './demo-data';
import type { ChartType, WeatherCondition } from './demo-data';

/** Name of the tool the frontend registers and executes in the browser. */
const FRONTEND_THEME_TOOL = 'set_theme_color';

const TOKEN_DELAY_MS = 35;
/** Pretend latency of a backend tool, long enough to see the loading state. */
const TOOL_DELAY_MS = 900;

const COLORS = ['indigo', 'crimson', 'teal', 'orange', 'purple', 'green', 'pink', 'gold', 'blue', 'red'];

/** Time each research step pretends to take. */
const RESEARCH_STEP_MS = 1100;
const RESEARCH_STEPS = [
  { label: 'Search the web', detail: '14 sources found' },
  { label: 'Read the sources', detail: '9 kept, 5 discarded' },
  { label: 'Compare the candidates', detail: '3 shortlisted' },
  { label: 'Write the summary', detail: 'Draft ready' },
];

/** A backend tool that may only run after the user approved it. */
const APPROVAL_TOOL = 'send_newsletter';
const APPROVAL_PREFIX = 'approval:';
const NEWSLETTER = { subject: 'October product update', audience: 'All customers', recipients: 240 };

const RESUME_REPLIES = {
  sent: `Done. The newsletter was sent to ${NEWSLETTER.recipients} customers.`,
  rejected: 'Understood. I did not send the newsletter.',
  cancelled: 'I dropped the newsletter request, nothing was sent.',
};

const CONDITION_PHRASES: Record<WeatherCondition, string> = {
  sunny: 'sunny',
  'partly-cloudy': 'partly cloudy',
  cloudy: 'cloudy',
  rain: 'raining',
  storm: 'stormy',
  snow: 'snowing',
};

type Events = AsyncGenerator<AGUIEvent, void, void>;

/**
 * A scripted agent with no LLM behind it. It picks a scenario from the last
 * message so every part of the protocol can be exercised from the chat:
 * text streaming, reasoning, backend tool calls, frontend tool calls,
 * shared state and errors.
 *
 * To plug in a real model, keep the same event sequence and replace the
 * scripted text with the model's stream.
 */
export async function* runMockAgent(input: RunAgentInput, signal: AbortSignal): Events {
  const { threadId, runId } = input;
  const last = input.messages.at(-1);
  const lastText = last && last.role !== 'activity' ? contentToText(last.content) : '';
  const prompt = last?.role === 'user' ? lastText.toLowerCase() : '';

  yield { type: EventType.RUN_STARTED, threadId, runId };

  if (/\b(error|fail|crash)\b/.test(prompt)) {
    yield* streamText('Starting a task that is going to fail on purpose… ', signal);
    yield { type: EventType.RUN_ERROR, message: 'Simulated agent failure', code: 'DEMO_ERROR' };
    return;
  }

  yield* updateState(input, last);

  let outcome: RunFinishedOutcome | undefined;
  if (input.resume?.length) {
    yield* resumeScenario(input, signal);
  } else if (last?.role === 'tool') {
    yield* streamText(`Done — the frontend tool replied: ${lastText}`, signal);
  } else if (/\b(send|email|newsletter)\b/.test(prompt)) {
    outcome = yield* approvalScenario(signal);
  } else if (/\b(research|investigate)\b/.test(prompt)) {
    yield* researchScenario(prompt, signal);
  } else if (/\b(chart|graph|plot)\b/.test(prompt)) {
    yield* chartScenario(prompt, signal);
  } else if (/\bweather\b/.test(prompt)) {
    yield* weatherScenario(prompt, signal);
  } else if (/\b(theme|color|colour)\b/.test(prompt) && hasFrontendTool(input)) {
    yield* themeScenario(prompt, signal);
  } else if (/\b(think|reason|why|explain)\b/.test(prompt)) {
    yield* reasoningScenario(signal);
  } else {
    yield* streamText(
      `You said: "${lastText}".\n\n` +
        'I am a scripted AG-UI agent. Try one of these:\n' +
        '• "What is the weather in Cairo?" — backend tool call, rendered as a weather card\n' +
        '• "Show me a bar chart" (or line / donut) — backend tool call, rendered as a chart\n' +
        '• "Change the theme color to teal" — frontend tool call\n' +
        '• "Send the newsletter to all customers" — interrupt: waits for your approval\n' +
        '• "Research the best laptops for developers" — activity: a checklist that updates live\n' +
        '• "Explain how you think" — reasoning stream\n' +
        '• "Trigger an error" — RUN_ERROR',
      signal,
    );
  }

  if (signal.aborted) return;
  yield { type: EventType.RUN_FINISHED, threadId, runId, ...(outcome && { outcome }) };
}

/**
 * Human in the loop, first half: the agent prepares a tool call it is not
 * allowed to run on its own, and ends the run with an interrupt instead of a
 * result. Nothing stays running on the server while the user decides.
 */
async function* approvalScenario(signal: AbortSignal): AsyncGenerator<AGUIEvent, RunFinishedOutcome, void> {
  const messageId = yield* streamText('The October newsletter is ready. Sending it needs your approval.', signal);
  const toolCallId = yield* streamToolCall(APPROVAL_TOOL, NEWSLETTER, messageId, signal);

  return {
    type: 'interrupt',
    interrupts: [
      {
        // The id carries the tool call, so the resume run can find it without server-side storage.
        id: `${APPROVAL_PREFIX}${toolCallId}`,
        reason: 'approval_required',
        message: `Send "${NEWSLETTER.subject}" to ${NEWSLETTER.recipients} customers?`,
        toolCallId,
        responseSchema: {
          type: 'object',
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
        },
      },
    ],
  };
}

/**
 * Human in the loop, second half: a new run whose `resume` entries answer the
 * interrupts of the previous one. Each answer closes its tool call:
 * - resolved + approved  → the tool runs
 * - resolved + rejected  → the tool does not run, by the user's decision
 * - cancelled            → the user moved on without answering; the tool does not run
 */
async function* resumeScenario(input: RunAgentInput, signal: AbortSignal): Events {
  const answered = new Set(input.messages.flatMap((message) => (message.role === 'tool' ? [message.toolCallId] : [])));

  for (const entry of input.resume ?? []) {
    if (!entry.interruptId.startsWith(APPROVAL_PREFIX)) continue;
    const toolCallId = entry.interruptId.slice(APPROVAL_PREFIX.length);
    // A resume that was interrupted half-way may be sent again: never close a tool call twice.
    if (answered.has(toolCallId)) continue;
    const approved = entry.status === 'resolved' && entry.payload?.approved === true;
    const status = approved ? 'sent' : entry.status === 'cancelled' ? 'cancelled' : 'rejected';

    if (approved) {
      yield { type: EventType.STEP_STARTED, stepName: APPROVAL_TOOL };
      await sleep(TOOL_DELAY_MS);
    }
    yield {
      type: EventType.TOOL_CALL_RESULT,
      messageId: randomUUID(),
      toolCallId,
      content: JSON.stringify({ status, recipients: approved ? NEWSLETTER.recipients : 0 }),
    };
    if (approved) {
      yield { type: EventType.STEP_FINISHED, stepName: APPROVAL_TOOL };
    }

    yield* streamText(RESUME_REPLIES[status], signal);
  }
}

/** Shared state: a full snapshot on the first run, JSON Patch deltas afterwards. */
async function* updateState(input: RunAgentInput, last: Message | undefined): Events {
  const previous = (input.state ?? {}) as { runCount?: number };
  const lastRole = last?.role ?? 'none';

  if (typeof previous.runCount !== 'number') {
    yield { type: EventType.STATE_SNAPSHOT, snapshot: { runCount: 1, lastRole } };
    return;
  }
  yield {
    type: EventType.STATE_DELTA,
    delta: [
      { op: 'replace', path: '/runCount', value: previous.runCount + 1 },
      { op: 'replace', path: '/lastRole', value: lastRole },
    ],
  };
}

/** A tool executed by the backend: the result is streamed as TOOL_CALL_RESULT. */
async function* weatherScenario(prompt: string, signal: AbortSignal): Events {
  const city = capitalize(/weather (?:in|for|at) ([a-z\s]+?)(?:[?.!]|$)/.exec(prompt)?.[1]?.trim() ?? 'Cairo');
  const stepName = 'get_weather';

  const messageId = yield* streamText(`Let me check the weather in ${city}.`, signal);

  yield { type: EventType.STEP_STARTED, stepName };
  const toolCallId = yield* streamToolCall('get_weather', { city, unit: 'celsius' }, messageId, signal);
  await sleep(TOOL_DELAY_MS);
  const weather = weatherFor(city);
  yield {
    type: EventType.TOOL_CALL_RESULT,
    messageId: randomUUID(),
    toolCallId,
    content: JSON.stringify(weather),
  };
  yield { type: EventType.STEP_FINISHED, stepName };

  yield* streamText(
    `It is ${weather.temperature}°C and ${CONDITION_PHRASES[weather.condition]} in ${city} right now.`,
    signal,
  );
}

/**
 * Activity: structured progress that is not conversation text. One
 * ACTIVITY_SNAPSHOT creates the checklist, then small ACTIVITY_DELTA patches
 * update it in place, so the UI shows one widget that changes over time
 * instead of a stream of "now doing X" messages.
 */
async function* researchScenario(prompt: string, signal: AbortSignal): Events {
  const topic = /\b(?:research|investigate)\s+(.+?)[?.!]*$/.exec(prompt)?.[1] ?? 'the topic';
  const messageId = randomUUID();
  const activityType = 'checklist';

  yield* streamText('On it. I will work through these steps:', signal);

  yield {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId,
    activityType,
    content: {
      title: `Research: ${topic}`,
      steps: RESEARCH_STEPS.map(({ label }) => ({ label, status: 'pending' })),
    },
  };

  for (const [index, step] of RESEARCH_STEPS.entries()) {
    if (signal.aborted) return;
    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId,
      activityType,
      patch: [{ op: 'replace', path: `/steps/${index}/status`, value: 'running' }],
    };
    await sleep(RESEARCH_STEP_MS);
    if (signal.aborted) return;
    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId,
      activityType,
      patch: [
        { op: 'replace', path: `/steps/${index}/status`, value: 'done' },
        { op: 'add', path: `/steps/${index}/detail`, value: step.detail },
      ],
    };
  }

  yield* streamText(
    `I finished researching ${topic}. In a real agent the findings would follow here; this one only demonstrates the progress updates.`,
    signal,
  );
}

/**
 * Generative UI: the tool result is a chart spec. The frontend recognises the
 * tool name and renders the result with its own chart components.
 */
async function* chartScenario(prompt: string, signal: AbortSignal): Events {
  const type: ChartType = /\b(line|trend)\b/.test(prompt) ? 'line' : /\b(donut|pie)\b/.test(prompt) ? 'donut' : 'bar';
  const stepName = 'show_chart';

  const messageId = yield* streamText(`Here is a ${type} chart.`, signal);

  yield { type: EventType.STEP_STARTED, stepName };
  const toolCallId = yield* streamToolCall('show_chart', { type }, messageId, signal);
  await sleep(TOOL_DELAY_MS);
  const spec = chartFor(type);
  yield {
    type: EventType.TOOL_CALL_RESULT,
    messageId: randomUUID(),
    toolCallId,
    content: JSON.stringify(spec),
  };
  yield { type: EventType.STEP_FINISHED, stepName };

  yield* streamText(describeChart(spec), signal);
}

/**
 * A tool executed by the frontend: the run ends with the tool call still
 * pending, the browser runs it and starts a new run carrying the result.
 */
async function* themeScenario(prompt: string, signal: AbortSignal): Events {
  const color = /#[0-9a-f]{3,8}\b/.exec(prompt)?.[0] ?? COLORS.find((c) => prompt.includes(c)) ?? 'indigo';
  const messageId = yield* streamText(`Sure, switching the theme color to ${color}.`, signal);
  yield* streamToolCall(FRONTEND_THEME_TOOL, { color }, messageId, signal);
}

async function* reasoningScenario(signal: AbortSignal): Events {
  const messageId = randomUUID();
  yield { type: EventType.REASONING_START, messageId };
  yield { type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning' };
  for (const delta of tokenize(
    'The user wants to see my reasoning. I have no model behind me, so I will describe ' +
      'the protocol instead: reasoning is streamed as its own message, separate from the answer.',
  )) {
    if (signal.aborted) return;
    yield { type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta };
    await sleep(TOKEN_DELAY_MS);
  }
  yield { type: EventType.REASONING_MESSAGE_END, messageId };
  yield { type: EventType.REASONING_END, messageId };

  yield* streamText(
    'Reasoning arrives through REASONING_* events and becomes a message with role "reasoning". ' +
      'The UI is free to render it however it likes — here it is a collapsible block.',
    signal,
  );
}

/** Streams one assistant text message token by token and returns its id. */
async function* streamText(text: string, signal: AbortSignal): AsyncGenerator<AGUIEvent, string, void> {
  const messageId = randomUUID();
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
  for (const delta of tokenize(text)) {
    if (signal.aborted) break;
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta };
    await sleep(TOKEN_DELAY_MS);
  }
  yield { type: EventType.TEXT_MESSAGE_END, messageId };
  return messageId;
}

/** Streams a tool call with its JSON arguments in chunks and returns its id. */
async function* streamToolCall(
  toolCallName: string,
  args: Record<string, unknown>,
  parentMessageId: string,
  signal: AbortSignal,
): AsyncGenerator<AGUIEvent, string, void> {
  const toolCallId = randomUUID();
  yield { type: EventType.TOOL_CALL_START, toolCallId, toolCallName, parentMessageId };
  for (const delta of JSON.stringify(args).match(/.{1,8}/g) ?? []) {
    if (signal.aborted) break;
    yield { type: EventType.TOOL_CALL_ARGS, toolCallId, delta };
    await sleep(TOKEN_DELAY_MS);
  }
  yield { type: EventType.TOOL_CALL_END, toolCallId };
  return toolCallId;
}

function hasFrontendTool(input: RunAgentInput): boolean {
  return input.tools.some((tool) => tool.name === FRONTEND_THEME_TOOL);
}

/** Splits text into word-sized chunks, keeping whitespace so it re-joins exactly. */
function tokenize(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}

function capitalize(value: string): string {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}
