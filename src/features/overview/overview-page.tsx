import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

import { UsageTrendChart } from "./overview-chart";
import { ApiStatusCard } from "./components/api-status-card";
import { ModelUsageCard } from "./components/model-usage-card";
import { RecentRequestsCard } from "./components/recent-requests-card";
import { getDashboard } from "./service";

export async function OverviewPage() {
  const data = await getDashboard();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Monitor API usage, spend, and reliability across your workspace."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{data.range}</span>
            <Badge variant="neutral">Demo data</Badge>
          </div>
        }
      />

      <section aria-labelledby="overview-metrics-heading" className="space-y-3">
        <h2
          id="overview-metrics-heading"
          className="text-sm font-semibold text-foreground"
        >
          This month
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.metrics.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              trend={metric.trend}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby="usage-trend-heading" className="lg:col-span-2">
          <UsageTrendChart series={data.usageSeries} />
        </section>
        <section aria-labelledby="model-usage-heading">
          <ModelUsageCard models={data.modelUsage} />
        </section>
        <section aria-labelledby="recent-requests-heading" className="lg:col-span-2">
          <RecentRequestsCard requests={data.recentRequests} />
        </section>
        <section aria-labelledby="api-status-heading">
          <ApiStatusCard regions={data.apiStatus} />
        </section>
      </div>
    </div>
  );
}
