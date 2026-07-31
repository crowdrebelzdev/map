"use client";

import { AreaChart, Area, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  count: { label: "Zoekopdrachten", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Client chart for daily search volume (`getSearchActivityByDay`) — now that public
 * visitor searches are logged too (see `logPublicSearch`), this is real usage, not just
 * staff activity. Rendered by the server component below so the data fetch stays there. */
function SearchActivityChartInner({ data }: { data: { day: string; count: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => value} />} />
        <Area dataKey="count" type="monotone" fill="var(--color-count)" fillOpacity={0.2} stroke="var(--color-count)" />
      </AreaChart>
    </ChartContainer>
  );
}

export function SearchActivityChart({ data }: { data: { day: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Zoekactiviteit (14 dagen)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen zoekactiviteit in deze periode.</p>
        ) : (
          <SearchActivityChartInner data={data} />
        )}
      </CardContent>
    </Card>
  );
}
