"use client";

import { AreaChart, Area, CartesianGrid, XAxis } from "recharts";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/** Client chart for daily search volume (`getSearchActivityByDay`) — now that public
 * visitor searches are logged too (see `logPublicSearch`), this is real usage, not just
 * staff activity. Rendered by the server component below so the data fetch stays there. */
function SearchActivityChartInner({ data }: { data: { day: string; count: number }[] }) {
  const t = useTranslations("searchActivityChart");
  const chartConfig = {
    count: { label: t("legendLabel"), color: "var(--chart-1)" },
  } satisfies ChartConfig;

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
  const t = useTranslations("searchActivityChart");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <SearchActivityChartInner data={data} />
        )}
      </CardContent>
    </Card>
  );
}
