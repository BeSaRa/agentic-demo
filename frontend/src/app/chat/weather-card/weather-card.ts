import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ToolCallView } from '../../agent/chat-item';
import { ToolCall } from '../tool-call/tool-call';
import { CONDITION_LABELS, parseWeatherReport } from './weather';
import { WeatherIcon } from './weather-icon';

/** Renders the result of the `get_weather` tool. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolCall, WeatherIcon],
  selector: 'app-weather-card',
  styleUrl: './weather-card.scss',
  templateUrl: './weather-card.html',
})
export class WeatherCard {
  readonly call = input.required<ToolCallView>();

  protected readonly labels = CONDITION_LABELS;
  protected readonly loading = computed(() => this.call().result === null);
  protected readonly report = computed(() => parseWeatherReport(this.call().result ?? ''));

  /** The city from the tool arguments, available once they finished streaming. */
  protected readonly requestedCity = computed(() => {
    try {
      const city = JSON.parse(this.call().args).city;
      return typeof city === 'string' ? city : '';
    } catch {
      return '';
    }
  });
}
