import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpAgent, randomUUID } from '@ag-ui/client';
import type { BaseEvent, Interrupt, Message, ResumeEntry, State } from '@ag-ui/core';
import { AGENT_URL } from './agent-url';
import { toChatItems } from './chat-item';
import { FrontendTool, FrontendTools } from './frontend-tools';

export interface AgentEventEntry {
  seq: number;
  type: string;
  event: BaseEvent;
}

const MAX_LOGGED_EVENTS = 300;

/**
 * Bridges the AG-UI `HttpAgent` to Angular signals. The agent owns the
 * conversation (messages + shared state); this service mirrors it into signals
 * and runs the frontend tools the agent asks for.
 */
@Injectable({ providedIn: 'root' })
export class ChatAgent {
  private readonly tools = inject(FrontendTools);
  private readonly agent = new HttpAgent({ url: inject(AGENT_URL) });

  private readonly _messages = signal<readonly Message[]>([]);
  private readonly _state = signal<State>({});
  private readonly _events = signal<readonly AgentEventEntry[]>([]);
  private readonly _running = signal(false);
  private readonly _step = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);
  /** Interrupts of the last run that still wait for an answer. */
  private readonly _interrupts = signal<readonly Interrupt[]>([]);

  readonly items = computed(() => toChatItems(this._messages(), this._interrupts()));
  readonly state = this._state.asReadonly();
  readonly events = this._events.asReadonly();
  readonly running = this._running.asReadonly();
  /** Name of the step the agent is currently in, if it reported one. */
  readonly step = this._step.asReadonly();
  readonly error = this._error.asReadonly();

  private pendingToolCallIds: string[] = [];
  private aborted = false;
  private eventSeq = 0;

  constructor() {
    this.agent.subscribe({
      // The agent mutates its messages in place, so hand the signal a new array.
      onMessagesChanged: ({ messages }) => {
        this._messages.set([...messages]);
      },
      onStateChanged: ({ state }) => this._state.set(structuredClone(state)),
      onEvent: ({ event }) => this.logEvent(event),
      onStepStartedEvent: ({ event }) => this._step.set(event.stepName),
      onStepFinishedEvent: () => this._step.set(null),
      onRunFinishedEvent: (params) => {
        this.pendingToolCallIds = params.outcome === 'success' ? params.pendingToolCallIds : [];
      },
      onRunErrorEvent: ({ event }) => this.fail(event.message),
      onRunFailed: ({ error }) => this.fail(error.message),
    });
  }

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this._running()) {
      return;
    }
    // A thread cannot continue past an open interrupt. Sending something else
    // abandons it: a run with no answers cancels every open interrupt.
    if (this.agent.pendingInterrupts.length) {
      await this.run();
      if (this.agent.pendingInterrupts.length) {
        return;
      }
    }
    this.addMessage({ id: randomUUID(), role: 'user', content });
    await this.run();
  }

  /** Answers an approval interrupt. The agent continues in a new run. */
  async answer(interruptId: string, approved: boolean): Promise<void> {
    console.log(this.agent.pendingInterrupts);
    if (!this._running()) {
      await this.run([{ interruptId, status: 'resolved', payload: { approved } }]);
    }
  }

  /** Aborts the in-flight run. Whatever was streamed so far stays in the chat. */
  stop(): void {
    if (this._running()) {
      this.aborted = true;
      this.agent.abortRun();
    }
  }

  /** Drops the conversation and starts a new thread. */
  reset(): void {
    this.stop();
    this.agent.setMessages([]);
    this.agent.setState({});
    this.agent.pendingInterrupts = [];
    this.agent.threadId = randomUUID();
    this._messages.set([]);
    this._state.set({});
    this._events.set([]);
    this._error.set(null);
    this._interrupts.set([]);
  }

  /**
   * Runs the agent. When the previous run ended with interrupts, this run
   * resumes it: `answers` are sent for the interrupts they address, and every
   * other open interrupt is cancelled.
   */
  private async run(answers: ResumeEntry[] = []): Promise<void> {
    let resume: ResumeEntry[] | undefined = this.agent.pendingInterrupts.map(
      ({ id }) => answers.find((answer) => answer.interruptId === id) ?? { interruptId: id, status: 'cancelled' },
    );
    this._interrupts.set([]);
    this._running.set(true);
    this._error.set(null);
    this.aborted = false;
    try {
      // A run can end with tool calls left for the frontend: execute them and
      // run again so the agent can continue with their results.
      do {
        this.pendingToolCallIds = [];
        await this.agent.runAgent({ tools: this.tools.definitions, ...(resume?.length && { resume }) });
        resume = undefined;
      } while (!this.aborted && (await this.executePendingToolCalls()));
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      // The agent keeps its interrupts until a run succeeds, so a failed resume can be retried.
      this._interrupts.set([...this.agent.pendingInterrupts]);
      this._running.set(false);
      this._step.set(null);
    }
  }

  private async executePendingToolCalls(): Promise<boolean> {
    const pending = new Set(this.pendingToolCallIds);
    const calls = this.agent.messages
      .flatMap((message) => (message.role === 'assistant' ? (message.toolCalls ?? []) : []))
      .filter((call) => pending.has(call.id));

    let executed = false;
    for (const call of calls) {
      const tool = this.tools.find(call.function.name);
      if (!tool) {
        continue;
      }
      const content = await executeTool(tool, call.function.arguments);
      this.addMessage({ id: randomUUID(), role: 'tool', toolCallId: call.id, content });
      executed = true;
    }
    return executed;
  }

  private addMessage(message: Message): void {
    this.agent.addMessage(message);
    this._messages.set([...this.agent.messages]);
  }

  private fail(message: string): void {
    // Aborting surfaces as a run error; stopping on purpose is not a failure.
    if (!this.aborted) {
      this._error.set(message);
    }
  }

  private logEvent(event: BaseEvent): void {
    const entry: AgentEventEntry = { seq: ++this.eventSeq, type: event.type, event };
    this._events.update((events) => [...events, entry].slice(-MAX_LOGGED_EVENTS));
  }
}

async function executeTool(tool: FrontendTool, rawArgs: string): Promise<string> {
  try {
    return await tool.execute(rawArgs ? JSON.parse(rawArgs) : {});
  } catch (error) {
    return `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
