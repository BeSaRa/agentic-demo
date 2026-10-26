import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-composer',
  styleUrl: './composer.scss',
  templateUrl: './composer.html',
})
export class Composer {
  readonly running = input(false);
  readonly send = output<string>();
  readonly stop = output<void>();

  protected readonly draft = signal('');
  protected readonly canSend = computed(() => !this.running() && this.draft().trim().length > 0);

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');

  protected onInput(): void {
    this.draft.set(this.textarea().nativeElement.value);
  }

  /** Enter sends, Shift+Enter inserts a new line. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(): void {
    if (!this.canSend()) {
      return;
    }
    this.send.emit(this.draft().trim());
    this.draft.set('');
    this.textarea().nativeElement.focus();
  }
}
