import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChatItem, InterruptAnswer } from '../../agent/chat-item';
import { ApprovalCard } from '../approval-card/approval-card';
import { ChartCard } from '../chart-card/chart-card';
import { ChecklistActivity } from '../checklist-activity/checklist-activity';
import { ToolCall } from '../tool-call/tool-call';
import { WeatherCard } from '../weather-card/weather-card';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"message message--" + item().role' },
  imports: [ApprovalCard, ChartCard, ChecklistActivity, JsonPipe, ToolCall, WeatherCard],
  selector: 'app-chat-message',
  styleUrl: './chat-message.scss',
  templateUrl: './chat-message.html',
})
export class ChatMessage {
  readonly item = input.required<ChatItem>();
  /** The agent is still producing this row, so its progress indicators may animate. */
  readonly live = input(false);
  /** The user approved or rejected a tool call the agent is paused on. */
  readonly answer = output<InterruptAnswer>();
}
