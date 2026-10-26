export type WeatherCondition = 'sunny' | 'partly-cloudy' | 'cloudy' | 'rain' | 'storm' | 'snow';

/** What the `get_weather` tool returns. */
export interface WeatherReport {
  city: string;
  condition: WeatherCondition;
  temperature: number;
  feelsLike: number;
  high: number;
  low: number;
  humidity: number;
  windKph: number;
  forecast: { day: string; condition: WeatherCondition; high: number; low: number }[];
}

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  sunny: 'Sunny',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  rain: 'Rain',
  storm: 'Thunderstorm',
  snow: 'Snow',
};

/** Returns the report, or `null` when the text is not one the card can draw. */
export function parseWeatherReport(json: string): WeatherReport | null {
  try {
    const report = JSON.parse(json) as WeatherReport;
    const valid =
      typeof report.city === 'string' &&
      report.condition in CONDITION_LABELS &&
      typeof report.temperature === 'number' &&
      Array.isArray(report.forecast) &&
      report.forecast.every((day) => day.condition in CONDITION_LABELS);
    return valid ? report : null;
  } catch {
    return null;
  }
}
