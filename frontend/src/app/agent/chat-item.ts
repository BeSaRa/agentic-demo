import { contentToText } from '@ag-ui/core';
import type { Interrupt, Message } from '@ag-ui/core';

/** A question the agent is waiting on before it continues. */
export interface InterruptView {
  id: string;
  message: string;
}

/** The user's decision on an approval interrupt. */
export interface InterruptAnswer {
  interruptId: string;
  approved: boolean;
}

export interface ToolCallView {
  id: string;
  name: string;
  /** Raw JSON arguments, possibly incomplete while they are still streaming. */
  args: string;
  /** `null` until the tool result arrives. */
  result: string | null;
  /** Set while the agent is paused, waiting for the user to approve this call. */
  interrupt: InterruptView | null;
}

/** Structured progress the agent reports, drawn as its own widget. */
export interface ActivityView {
  /** Chosen by the agent; the chat picks a component for the types it knows. */
  type: string;
  content: Record<string, unknown>;
}

/** What the chat renders: AG-UI messages flattened into display rows. */
export interface ChatItem {
  id: string;
  role: 'user' | 'assistant' | 'reasoning' | 'activity';
  text: string;
  toolCalls: ToolCallView[];
  /** Set on `activity` rows only. */
  activity: ActivityView | null;
}

/**
 * Maps the protocol's message list to chat rows. Tool messages are not rows of
 * their own: each one is attached to the tool call it answers, and so is an
 * open interrupt that concerns a tool call.
 */
export function toChatItems(messages: readonly Message[], interrupts: readonly Interrupt[] = []): ChatItem[] {
  const results = new Map<string, string>();
  for (const message of messages) {
    if (message.role === 'tool') {
      results.set(message.toolCallId, message.error ?? contentToText(message.content));
    }
  }

  const items: ChatItem[] = [];
  for (const message of messages) {
    if (message.role === 'user' || message.role === 'reasoning') {
      items.push({
        id: message.id,
        role: message.role,
        text: contentToText(message.content),
        toolCalls: [],
        activity: null,
      });
    } else if (message.role === 'activity') {
      items.push({
        id: message.id,
        role: 'activity',
        text: '',
        toolCalls: [],
        // The agent patches the content in place: copy it so every update is a new value.
        activity: { type: message.activityType, content: structuredClone(message.content) },
      });
    } else if (message.role === 'assistant') {
      items.push({
        id: message.id,
        role: 'assistant',
        text: message.content ?? '',
        activity: null,
        toolCalls: (message.toolCalls ?? []).map((call) => {
          const interrupt = interrupts.find((candidate) => candidate.toolCallId === call.id);
          return {
            id: call.id,
            name: call.function.name,
            args: call.function.arguments,
            result: results.get(call.id) ?? null,
            interrupt: interrupt ? { id: interrupt.id, message: interrupt.message ?? interrupt.reason } : null,
          };
        }),
      });
    }
  }
  return items;
}
