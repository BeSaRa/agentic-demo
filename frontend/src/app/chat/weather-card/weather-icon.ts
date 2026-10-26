import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { WeatherCondition } from './weather';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-weather-icon',
  styleUrl: './weather-icon.scss',
  templateUrl: './weather-icon.html',
})
export class WeatherIcon {
  readonly condition = input.required<WeatherCondition>();
}
