import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ToolCallView } from '../../agent/chat-item';
import { BarChart } from '../charts/bar-chart/bar-chart';
import { formatValue, parseChartSpec } from '../charts/chart-spec';
import { DonutChart } from '../charts/donut-chart/donut-chart';
import { LineChart } from '../charts/line-chart/line-chart';
import { ToolCall } from '../tool-call/tool-call';

/** Renders the result of the `show_chart` tool as a chart, with a table view of the same data. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChart, DonutChart, LineChart, ToolCall],
  selector: 'app-chart-card',
  styleUrl: './chart-card.scss',
  templateUrl: './chart-card.html',
})
export class ChartCard {
  readonly call = input.required<ToolCallView>();

  protected readonly showTable = signal(false);
  protected readonly loading = computed(() => this.call().result === null);
  protected readonly spec = computed(() => parseChartSpec(this.call().result ?? ''));

  protected readonly rows = computed(() => {
    const spec = this.spec();
    return (spec?.categories ?? []).map((category, index) => ({
      category,
      values: spec!.series.map((series) => formatValue(spec!, series.values[index])),
    }));
  });

  protected toggleTable(): void {
    this.showTable.update((shown) => !shown);
  }
}
