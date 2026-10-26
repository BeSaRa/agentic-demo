import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSpec, formatValue, seriesColor } from '../chart-spec';

const SIZE = 180;
const OUTER_RADIUS = 86;
const INNER_RADIUS = 62;
/** Gap between segments, in px, measured at the middle of the ring. */
const SEGMENT_GAP = 2;
/** A donut only reads at a glance with a few segments: the tail becomes "Other". */
const MAX_SEGMENTS = 4;

/** Part-to-whole donut for the first series of the spec, with a full legend. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-donut-chart',
  styleUrl: './donut-chart.scss',
  templateUrl: './donut-chart.html',
})
export class DonutChart {
  readonly spec = input.required<ChartSpec>();

  protected readonly viewBox = `0 0 ${SIZE} ${SIZE}`;
  protected readonly center = SIZE / 2;
  /** Index of the segment under the pointer or holding keyboard focus. */
  protected readonly active = signal<number | null>(null);

  protected readonly segments = computed(() => {
    const spec = this.spec();
    const total = sum(spec.series[0].values);
    const gapAngle = SEGMENT_GAP / ((OUTER_RADIUS + INNER_RADIUS) / 2);

    let angle = -Math.PI / 2;
    return foldTail(spec).map(({ name, value, color }) => {
      const sweep = total ? (value / total) * Math.PI * 2 : 0;
      const start = angle;
      angle += sweep;
      return {
        name,
        color,
        value: formatValue(spec, value),
        percent: `${total ? Math.round((value / total) * 100) : 0}%`,
        path: ringSegment(start + gapAngle / 2, Math.max(angle - gapAngle / 2, start + gapAngle / 2)),
      };
    });
  });

  /** The total, or the hovered segment's value. */
  protected readonly headline = computed(() => {
    const spec = this.spec();
    const index = this.active();
    return index === null
      ? { value: formatValue(spec, sum(spec.series[0].values)), label: spec.series[0].name }
      : { value: this.segments()[index].value, label: this.segments()[index].name };
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function foldTail(spec: ChartSpec): { name: string; value: number; color: string }[] {
  const items = spec.categories.map((name, index) => ({ name, value: Math.max(spec.series[0].values[index], 0) }));
  if (items.length <= MAX_SEGMENTS) {
    return items.map((item, index) => ({ ...item, color: seriesColor(index) }));
  }
  const kept = items.slice(0, MAX_SEGMENTS - 1).map((item, index) => ({ ...item, color: seriesColor(index) }));
  const other = sum(items.slice(MAX_SEGMENTS - 1).map((item) => item.value));
  return [...kept, { name: 'Other', value: other, color: 'var(--muted)' }];
}

function ringSegment(start: number, end: number): string {
  const center = SIZE / 2;
  const point = (radius: number, angle: number) =>
    `${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return (
    `M${point(OUTER_RADIUS, start)}A${OUTER_RADIUS},${OUTER_RADIUS} 0 ${large} 1 ${point(OUTER_RADIUS, end)}` +
    `L${point(INNER_RADIUS, end)}A${INNER_RADIUS},${INNER_RADIUS} 0 ${large} 0 ${point(INNER_RADIUS, start)}Z`
  );
}
