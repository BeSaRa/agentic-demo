import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ChatAgent } from '../agent/chat-agent';
import { Composer } from './composer/composer';
import { Inspector } from './inspector/inspector';
import { MessageList } from './message-list/message-list';
import { Suggestions } from './suggestions/suggestions';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Composer, Inspector, MessageList, Suggestions],
  selector: 'app-chat',
  styleUrl: './chat.scss',
  templateUrl: './chat.html',
})
export class Chat {
  protected readonly agent = inject(ChatAgent);
  protected readonly inspectorOpen = signal(true);

  protected toggleInspector(): void {
    this.inspectorOpen.update((open) => !open);
  }
}
