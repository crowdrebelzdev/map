"use client";

import { BarChart, Bar, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  incidents: { label: "Meldingen", color: "var(--chart-2)" },
  broadcasts: { label: "Berichten", color: "var(--chart-3)" },
} satisfies ChartConfig;

export type ActivityStatsPoint = { day: string; incidents: number; broadcasts: number };

/** Daily incident/SOS + broadcast volume, combined into one compact chart — gives
 * organizers a trend line on top of the existing "open meldingen" snapshot tile. */
function ActivityStatsChartInner({ data }: { data: ActivityStatsPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
      <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => value} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="incidents" fill="var(--color-incidents)" radius={2} />
        <Bar dataKey="broadcasts" fill="var(--color-broadcasts)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}

export function ActivityStatsChart({ data }: { data: ActivityStatsPoint[] }) {
  const hasActivity = data.some((d) => d.incidents > 0 || d.broadcasts > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activiteit (14 dagen)</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasActivity ? (
          <p className="text-sm text-muted-foreground">Nog geen meldingen of berichten in deze periode.</p>
        ) : (
          <ActivityStatsChartInner data={data} />
        )}
      </CardContent>
    </Card>
  );
}
