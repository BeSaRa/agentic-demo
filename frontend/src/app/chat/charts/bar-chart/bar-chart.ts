import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSpec, formatValue, niceTicks, seriesColor } from '../chart-spec';

const WIDTH = 560;
const HEIGHT = 240;
const MARGIN = { top: 24, right: 8, bottom: 26, left: 8 };
/** Left margin when the y-axis shows tick labels. */
const AXIS_WIDTH = 40;
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;
const BAR_RADIUS = 4;

/**
 * Column chart. A single series gets its value on every cap; several series
 * are grouped per category and read against a y-axis and a legend instead.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-bar-chart',
  styleUrl: './bar-chart.scss',
  templateUrl: './bar-chart.html',
})
export class BarChart {
  readonly spec = input.required<ChartSpec>();

  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  /** Key of the bar under the pointer or holding keyboard focus. */
  protected readonly active = signal<string | null>(null);

  protected readonly view = computed(() => {
    const spec = this.spec();
    const grouped = spec.series.length > 1;
    const left = grouped ? AXIS_WIDTH : MARGIN.left;
    const plotWidth = WIDTH - left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + plotHeight;

    const tickValues = niceTicks(Math.max(...spec.series.flatMap((series) => series.values)));
    const top = tickValues.at(-1)!;
    const band = plotWidth / spec.categories.length;
    const count = spec.series.length;
    const barWidth = Math.min(MAX_BAR_WIDTH, (band * 0.7 - BAR_GAP * (count - 1)) / count);
    const groupWidth = barWidth * count + BAR_GAP * (count - 1);

    const bars = spec.categories.flatMap((category, c) =>
      spec.series.map((series, s) => {
        const value = series.values[c];
        const height = (Math.max(value, 0) / top) * plotHeight;
        const x = left + band * c + (band - groupWidth) / 2 + s * (barWidth + BAR_GAP);
        const y = baseline - height;
        const text = formatValue(spec, value);
        return {
          key: `${c}-${s}`,
          path: columnPath(x, y, barWidth, height),
          color: seriesColor(s),
          value: text,
          name: grouped ? `${series.name} · ${category}` : category,
          cx: x + barWidth / 2,
          y,
          // The hit area is the whole column slot, not just the painted bar.
          hitX: grouped ? x - BAR_GAP / 2 : left + band * c,
          hitWidth: grouped ? barWidth + BAR_GAP : band,
        };
      }),
    );

    return {
      grouped,
      bars,
      baseline,
      left,
      right: WIDTH - MARGIN.right,
      plotTop: MARGIN.top,
      plotHeight,
      ticks: tickValues.map((value) => ({
        value,
        y: baseline - (value / top) * plotHeight,
        label: formatValue(spec, value),
      })),
      labels: spec.categories.map((text, c) => ({ text, x: left + band * (c + 0.5), y: baseline + 17 })),
      legend: spec.series.map((series, s) => ({ name: series.name, color: seriesColor(s) })),
    };
  });

  protected readonly tooltip = computed(() => {
    const bar = this.view().bars.find((candidate) => candidate.key === this.active());
    return bar && { ...bar, left: (bar.cx / WIDTH) * 100, top: (bar.y / HEIGHT) * 100 };
  });
}

/** A column with a rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(BAR_RADIUS, width / 2, height);
  const bottom = y + height;
  return (
    `M${x},${bottom}V${y + radius}Q${x},${y} ${x + radius},${y}` +
    `H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${bottom}Z`
  );
}
