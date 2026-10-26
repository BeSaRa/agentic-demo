import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { ChartSpec, formatValue, niceTicks, seriesColor } from '../chart-spec';

const WIDTH = 560;
const HEIGHT = 240;
const MARGIN = { top: 12, right: 56, bottom: 26, left: 40 };
const MAX_X_LABELS = 6;
/** End labels closer than this would overlap, so they are dropped. */
const MIN_LABEL_GAP = 14;

/** Multi-series line chart with a crosshair that reads every series at once. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-line-chart',
  styleUrl: './line-chart.scss',
  templateUrl: './line-chart.html',
})
export class LineChart {
  readonly spec = input.required<ChartSpec>();

  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  /** Index of the category under the crosshair. */
  protected readonly active = signal<number | null>(null);

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly view = computed(() => {
    const spec = this.spec();
    const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + plotHeight;
    const tickValues = niceTicks(Math.max(...spec.series.flatMap((series) => series.values)));
    const top = tickValues.at(-1)!;
    const lastIndex = spec.categories.length - 1;

    const xAt = (index: number) => MARGIN.left + (lastIndex ? (index / lastIndex) * plotWidth : plotWidth / 2);
    const yAt = (value: number) => baseline - (value / top) * plotHeight;

    const lines = spec.series.map((series, s) => {
      const points = series.values.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
      return {
        name: series.name,
        color: seriesColor(s),
        points,
        path: points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(''),
        end: points[lastIndex],
        endLabel: formatValue(spec, series.values[lastIndex]),
      };
    });

    const endYs = lines.map((line) => line.end.y).sort((a, b) => a - b);
    const labelStep = Math.ceil(spec.categories.length / MAX_X_LABELS);

    return {
      lines,
      baseline,
      left: MARGIN.left,
      right: WIDTH - MARGIN.right,
      plotTop: MARGIN.top,
      showEndLabels: endYs.every((y, index) => index === 0 || y - endYs[index - 1] >= MIN_LABEL_GAP),
      ticks: tickValues.map((value) => ({ value, y: yAt(value), label: formatValue(spec, value) })),
      // Count back from the last point so the most recent date is always labeled.
      labels: spec.categories
        .map((text, index) => ({ text, x: xAt(index), index }))
        .filter(({ index }) => (lastIndex - index) % labelStep === 0),
    };
  });

  /** Everything the crosshair shows for the active category. */
  protected readonly readout = computed(() => {
    const index = this.active();
    if (index === null) {
      return null;
    }
    const spec = this.spec();
    const lines = this.view().lines;
    const x = lines[0].points[index].x;
    return {
      x,
      left: (x / WIDTH) * 100,
      // Keep the tooltip inside the chart: flip it once past the middle.
      flipped: x > WIDTH / 2,
      category: spec.categories[index],
      rows: lines.map((line, s) => ({
        name: line.name,
        color: line.color,
        y: line.points[index].y,
        value: formatValue(spec, spec.series[s].values[index]),
      })),
    };
  });

  /** The crosshair snaps to the category nearest to the pointer. */
  protected onPointerMove(event: PointerEvent): void {
    const bounds = this.svg().nativeElement.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const { left, right } = this.view();
    const lastIndex = this.spec().categories.length - 1;
    const index = Math.round(((x - left) / (right - left)) * lastIndex);
    this.active.set(Math.min(lastIndex, Math.max(0, index)));
  }

  /** Arrow keys move the crosshair, so the readout does not depend on a pointer. */
  protected onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const lastIndex = this.spec().categories.length - 1;
    this.active.update((index) => Math.min(lastIndex, Math.max(0, (index ?? lastIndex) + step)));
  }

  protected onFocus(): void {
    this.active.update((index) => index ?? this.spec().categories.length - 1);
  }
}
