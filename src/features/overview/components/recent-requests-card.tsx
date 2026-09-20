import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { RecentRequest, RecentRequestStatus } from "../types";

const statusBadge: Record<
  RecentRequestStatus,
  { variant: "success" | "warning" | "error"; label: string }
> = {
  success: { variant: "success", label: "Success" },
  rate_limited: { variant: "warning", label: "Rate limited" },
  error: { variant: "error", label: "Error" },
};

export function RecentRequestsCard({ requests }: { requests: RecentRequest[] }) {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle as="h2" id="recent-requests-heading">
            Recent Requests
          </CardTitle>
          <CardDescription>Latest requests across projects</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/requests">View all</Link>
        </Button>
      </CardHeader>
      <Table label="Recent requests">
        <TableHeader>
          <TableRow>
            <TableHead>Time (UTC)</TableHead>
            <TableHead>Request ID</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Latency</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => {
            const status = statusBadge[request.status];
            return (
              <TableRow key={request.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {request.time}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {request.id}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {request.modelId}
                </TableCell>
                <TableCell className="whitespace-nowrap">{request.project}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {request.latencyMs.toLocaleString("en-US")} ms
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {request.tokens.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {request.cost}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
