import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { State } from '@ag-ui/core';
import { AgentEventEntry } from '../../agent/chat-agent';

/** How long the Copy button shows its result. */
const FEEDBACK_MS = 1500;

/** Debug panel: the agent's shared state and the raw AG-UI event stream. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  selector: 'app-inspector',
  styleUrl: './inspector.scss',
  templateUrl: './inspector.html',
})
export class Inspector {
  readonly state = input.required<State>();
  readonly events = input.required<readonly AgentEventEntry[]>();

  /** `seq` of the events whose full payload is shown. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());
  /** Result of the last Copy click, shown on that row's button. */
  protected readonly feedback = signal<{ seq: number; label: string } | null>(null);

  /** Newest first, with the payload reduced to one line. */
  protected readonly rows = computed(() =>
    this.events()
      .map(({ seq, type, event }) => ({ seq, type, event, group: type.split('_')[0], detail: describe(event) }))
      .reverse(),
  );

  protected readonly allExpanded = computed(
    () => this.rows().length > 0 && this.rows().every((row) => this.expanded().has(row.seq)),
  );

  protected toggle(seq: number): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (!next.delete(seq)) {
        next.add(seq);
      }
      return next;
    });
  }

  protected toggleAll(): void {
    this.expanded.set(this.allExpanded() ? new Set() : new Set(this.rows().map((row) => row.seq)));
  }

  protected async copy(row: { seq: number; event: object }, json: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row.event, null, 2));
      this.feedback.set({ seq: row.seq, label: 'Copied' });
    } catch {
      // No clipboard access (permission denied, insecure origin): select the text instead.
      getSelection()?.selectAllChildren(json);
      this.feedback.set({ seq: row.seq, label: 'Selected' });
    }
    setTimeout(() => this.feedback.update((shown) => (shown?.seq === row.seq ? null : shown)), FEEDBACK_MS);
  }
}

function describe(event: object): string {
  const { type, rawEvent, timestamp, ...payload } = event as Record<string, unknown>;
  return Object.keys(payload).length ? JSON.stringify(payload) : '';
}
