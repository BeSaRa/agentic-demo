import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

interface Suggestion {
  label: string;
  /** The message sent to the agent when the chip is clicked. */
  prompt: string;
}

/** One-click prompts, each showing a different component or protocol feature. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-suggestions',
  styleUrl: './suggestions.scss',
  templateUrl: './suggestions.html',
})
export class Suggestions {
  readonly disabled = input(false);
  readonly pick = output<string>();

  protected readonly suggestions: Suggestion[] = [
    { label: 'Weather in Cairo', prompt: 'What is the weather in Cairo?' },
    { label: 'Weather in London', prompt: 'What is the weather in London?' },
    { label: 'Bar chart', prompt: 'Show me a bar chart of revenue by product' },
    { label: 'Line chart', prompt: 'Show me a line chart of weekly active users' },
    { label: 'Donut chart', prompt: 'Show me a donut chart of traffic sources' },
    { label: 'Activity', prompt: 'Research the best laptops for developers' },
    { label: 'Approval', prompt: 'Send the newsletter to all customers' },
    { label: 'Theme color', prompt: 'Change the theme color to teal' },
    { label: 'Reasoning', prompt: 'Explain how you think' },
    { label: 'Error', prompt: 'Trigger an error' },
  ];
}
