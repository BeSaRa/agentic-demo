import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { InterruptAnswer, ToolCallView } from '../../agent/chat-item';

type ApprovalStatus = 'working' | 'pending' | 'sent' | 'rejected' | 'cancelled';

const HEADLINES: Record<ApprovalStatus, { title: string; text: string }> = {
  working: { title: 'Working…', text: '' },
  pending: { title: 'Approval needed', text: '' },
  sent: { title: 'Approved', text: 'The action was carried out.' },
  rejected: { title: 'Rejected', text: 'You said no. Nothing was done.' },
  cancelled: { title: 'Dismissed', text: 'You moved on without answering. Nothing was done.' },
};

/**
 * A tool call the agent may only run after the user approved it. While the
 * agent is paused on its interrupt the card shows Approve / Reject; afterwards
 * it stays in the chat as a record of the decision.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-approval-card',
  styleUrl: './approval-card.scss',
  templateUrl: './approval-card.html',
})
export class ApprovalCard {
  readonly call = input.required<ToolCallView>();
  readonly answer = output<InterruptAnswer>();

  protected readonly status = computed<ApprovalStatus>(() => {
    const { result, interrupt } = this.call();
    if (result !== null) {
      const status = parseObject(result)?.['status'];
      return status === 'sent' || status === 'rejected' ? status : 'cancelled';
    }
    return interrupt ? 'pending' : 'working';
  });

  protected readonly headline = computed(() => {
    const headline = HEADLINES[this.status()];
    return { title: headline.title, text: this.call().interrupt?.message ?? headline.text };
  });

  /** The tool arguments as label/value pairs: what the user is asked to approve. */
  protected readonly details = computed(() =>
    Object.entries(parseObject(this.call().args) ?? {}).map(([key, value]) => ({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value: String(value),
    })),
  );

  protected decide(approved: boolean): void {
    const interrupt = this.call().interrupt;
    if (interrupt) {
      this.answer.emit({ interruptId: interrupt.id, approved });
    }
  }
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
