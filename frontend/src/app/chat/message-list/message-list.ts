import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ChatItem, InterruptAnswer } from '../../agent/chat-item';
import { ChatMessage } from '../chat-message/chat-message';

/** Distance from the bottom (px) within which new content keeps the list pinned. */
const PIN_THRESHOLD = 80;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatMessage],
  selector: 'app-message-list',
  styleUrl: './message-list.scss',
  templateUrl: './message-list.html',
})
export class MessageList {
  readonly items = input.required<ChatItem[]>();
  readonly running = input(false);
  readonly answer = output<InterruptAnswer>();

  /** The run started but the agent has not produced anything yet. */
  protected readonly waiting = computed(() => this.running() && this.items().at(-1)?.role === 'user');

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private pinned = true;

  constructor() {
    // Follow the stream, unless the user scrolled up to read earlier messages.
    afterRenderEffect(() => {
      this.items();
      this.waiting();
      if (this.pinned) {
        const element = this.scroller().nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    });
  }

  protected onScroll(): void {
    const { scrollHeight, scrollTop, clientHeight } = this.scroller().nativeElement;
    this.pinned = scrollHeight - scrollTop - clientHeight < PIN_THRESHOLD;
  }
}
