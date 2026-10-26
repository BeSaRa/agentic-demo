import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ToolCallView } from '../../agent/chat-item';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tool-call',
  styleUrl: './tool-call.scss',
  templateUrl: './tool-call.html',
})
export class ToolCall {
  readonly call = input.required<ToolCallView>();

  protected readonly done = computed(() => this.call().result !== null);
  protected readonly args = computed(() => prettyJson(this.call().args));
  protected readonly result = computed(() => prettyJson(this.call().result ?? ''));
}

/** Indents JSON for display; text that is not (yet) valid JSON is shown as is. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
