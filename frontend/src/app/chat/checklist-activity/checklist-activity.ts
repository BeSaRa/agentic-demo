import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type StepStatus = 'pending' | 'running' | 'done' | 'stopped';

/**
 * Renders an activity of type `checklist`: `{ title, steps: [{ label, status, detail? }] }`.
 * The agent creates it once and then patches step statuses, so this one widget
 * updates in place while the work goes on.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-checklist-activity',
  styleUrl: './checklist-activity.scss',
  templateUrl: './checklist-activity.html',
})
export class ChecklistActivity {
  readonly content = input.required<Record<string, unknown>>();
  /** `false` once the run is over: a step left "running" was interrupted. */
  readonly live = input(false);

  protected readonly view = computed(() => {
    const { title, steps } = this.content();
    const list = (Array.isArray(steps) ? steps : []).map((step: Record<string, unknown>) => ({
      label: String(step?.['label'] ?? ''),
      detail: typeof step?.['detail'] === 'string' ? step['detail'] : '',
      status: this.statusOf(step?.['status']),
    }));
    const done = list.filter((step) => step.status === 'done').length;
    return {
      title: typeof title === 'string' ? title : 'Progress',
      steps: list,
      done,
      percent: list.length ? (done / list.length) * 100 : 0,
    };
  });

  private statusOf(status: unknown): StepStatus {
    if (status === 'done') {
      return 'done';
    }
    if (status === 'running') {
      return this.live() ? 'running' : 'stopped';
    }
    return 'pending';
  }
}
