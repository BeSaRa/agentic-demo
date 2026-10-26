export type ChartType = 'bar' | 'line' | 'donut';

export interface ChartSeries {
  name: string;
  values: number[];
}

/** What the `show_chart` tool returns: one value per category, per series. */
export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  categories: string[];
  series: ChartSeries[];
}

/** Number of categorical colors defined in `styles.scss` (`--series-1…4`). */
const SERIES_COLORS = 4;

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Returns the spec, or `null` when the text is not a chart the components can draw. */
export function parseChartSpec(json: string): ChartSpec | null {
  try {
    const spec = JSON.parse(json) as ChartSpec;
    const valid =
      ['bar', 'line', 'donut'].includes(spec.type) &&
      typeof spec.title === 'string' &&
      Array.isArray(spec.categories) &&
      spec.categories.length > 0 &&
      Array.isArray(spec.series) &&
      spec.series.length > 0 &&
      spec.series.every(
        (series) =>
          Array.isArray(series.values) &&
          series.values.length === spec.categories.length &&
          series.values.every((value) => typeof value === 'number'),
      );
    return valid ? spec : null;
  } catch {
    return null;
  }
}

export function formatValue(spec: ChartSpec, value: number): string {
  return `${spec.valuePrefix ?? ''}${numberFormat.format(value)}${spec.valueSuffix ?? ''}`;
}

/**
 * Color of the series (or donut segment) at `index`. Colors are assigned in a
 * fixed order and never cycled: anything past the palette is drawn in gray.
 */
export function seriesColor(index: number): string {
  return index < SERIES_COLORS ? `var(--series-${index + 1})` : 'var(--muted)';
}

/** Round axis values from 0 up to the first one that covers `max`, about four steps. */
export function niceTicks(max: number): number[] {
  if (max <= 0) {
    return [0, 1];
  }
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((nice) => nice * magnitude >= rough) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let index = 0; index * step < max + step; index++) {
    ticks.push(Number((index * step).toPrecision(12)));
  }
  return ticks;
}
