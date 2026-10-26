/** Fake data returned by the scripted agent's backend tools. */

export type WeatherCondition = 'sunny' | 'partly-cloudy' | 'cloudy' | 'rain' | 'storm' | 'snow';

export interface WeatherReport {
  city: string;
  unit: 'celsius';
  condition: WeatherCondition;
  temperature: number;
  feelsLike: number;
  high: number;
  low: number;
  humidity: number;
  windKph: number;
  forecast: { day: string; condition: WeatherCondition; high: number; low: number }[];
}

export type ChartType = 'bar' | 'line' | 'donut';

export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle: string;
  valuePrefix?: string;
  valueSuffix?: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

const CONDITIONS: WeatherCondition[] = ['sunny', 'partly-cloudy', 'cloudy', 'rain', 'storm', 'snow'];

/** Typical temperature per condition, so the numbers match the icon. */
const BASE_TEMPERATURE: Record<WeatherCondition, number> = {
  sunny: 29,
  'partly-cloudy': 23,
  cloudy: 18,
  rain: 14,
  storm: 20,
  snow: -2,
};

const KNOWN_CITIES: Record<string, WeatherCondition> = {
  cairo: 'sunny',
  dubai: 'sunny',
  london: 'rain',
  paris: 'partly-cloudy',
  berlin: 'cloudy',
  miami: 'storm',
  oslo: 'snow',
};

/** The same city always gets the same weather. */
export function weatherFor(city: string): WeatherReport {
  const seed = hash(city.toLowerCase());
  const condition = KNOWN_CITIES[city.toLowerCase()] ?? CONDITIONS[seed % CONDITIONS.length];
  const temperature = BASE_TEMPERATURE[condition] + (seed % 5);
  const today = new Date();

  return {
    city,
    unit: 'celsius',
    condition,
    temperature,
    feelsLike: temperature + ((seed >>> 3) % 5) - 2,
    high: temperature + 3,
    low: temperature - 6,
    humidity: 35 + ((seed >>> 5) % 50),
    windKph: 6 + ((seed >>> 7) % 25),
    forecast: Array.from({ length: 5 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index + 1);
      const daySeed = seed + index * 7;
      // Mostly the current condition, with the odd change.
      const dayCondition = daySeed % 3 === 0 ? CONDITIONS[daySeed % CONDITIONS.length] : condition;
      const high = temperature + 1 + (daySeed % 5);
      return {
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        condition: dayCondition,
        high,
        low: high - 6 - (daySeed % 3),
      };
    }),
  };
}

export function chartFor(type: ChartType): ChartSpec {
  switch (type) {
    case 'line':
      return {
        type,
        title: 'Weekly active users',
        subtitle: 'Last 12 weeks, thousands',
        valueSuffix: 'K',
        categories: lastWeeks(12),
        series: [
          { name: 'Web', values: [18.2, 18.9, 19.4, 19.1, 20.6, 21.8, 22.3, 22.1, 23.7, 24.9, 25.6, 26.4] },
          { name: 'Mobile', values: [9.1, 9.8, 10.9, 11.6, 12.2, 13.9, 14.8, 16.1, 17.4, 18.2, 19.9, 21.7] },
        ],
      };
    case 'donut':
      return {
        type,
        title: 'Traffic sources',
        subtitle: 'Sessions, last 30 days',
        categories: ['Organic search', 'Direct', 'Social', 'Referral'],
        series: [{ name: 'Sessions', values: [5200, 3100, 1900, 1200] }],
      };
    case 'bar':
      return {
        type,
        title: 'Revenue by product',
        subtitle: 'Q3 2026, thousand USD',
        valuePrefix: '$',
        valueSuffix: 'K',
        categories: ['Starter', 'Team', 'Business', 'Enterprise', 'Add-ons', 'Services'],
        series: [{ name: 'Revenue', values: [42, 68, 95, 124, 37, 58] }],
      };
  }
}

/** One-sentence takeaway the agent says after showing the chart. */
export function describeChart(spec: ChartSpec): string {
  const format = (value: number) => `${spec.valuePrefix ?? ''}${value.toLocaleString('en-US')}${spec.valueSuffix ?? ''}`;

  if (spec.type === 'line') {
    const parts = spec.series.map((s) => `${s.name} went from ${format(s.values[0])} to ${format(s.values.at(-1)!)}`);
    return `${spec.title}: ${parts.join(', and ')}.`;
  }
  const values = spec.series[0].values;
  const top = values.indexOf(Math.max(...values));
  if (spec.type === 'donut') {
    const share = Math.round((values[top] / values.reduce((sum, value) => sum + value, 0)) * 100);
    return `${spec.categories[top]} is the largest source with ${share}% of ${spec.series[0].name.toLowerCase()}.`;
  }
  return `${spec.categories[top]} leads with ${format(values[top])}.`;
}

/** Labels like "Jul 20" for the Mondays of the last `count` weeks. */
function lastWeeks(count: number): string[] {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() - (count - 1 - index) * 7);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}
