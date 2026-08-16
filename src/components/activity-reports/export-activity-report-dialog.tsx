"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { generateActivityReportPdf } from "@/lib/activity-report-pdf";
import { MONTH_NAMES } from "@/lib/activity-report-pdf-template";
import {
  fetchActivityReportExportData,
  fetchActivityReportExportDefaults,
} from "@/server/activity-reports/actions";
import type { ActivityReportExportDefaults } from "@/server/activity-reports/types";

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => current - index);
}

type ExportActivityReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ExportActivityReportDialog({ open, onOpenChange }: ExportActivityReportDialogProps) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["activity-report-export-defaults"],
    queryFn: fetchActivityReportExportDefaults,
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export report</DialogTitle>
          <DialogDescription>Generate a Monthly Activity Report as a PDF.</DialogDescription>
        </DialogHeader>

        {!open ? null : isPending ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : isError || !data ? (
          <p className="text-destructive text-sm">Could not load export options. Please try again.</p>
        ) : !data.ok ? (
          <p className="text-destructive text-sm">{data.error}</p>
        ) : (
          <ExportActivityReportForm defaults={data.data} onOpenChange={onOpenChange} />
        )}

        {!open || isPending || (data?.ok ?? false) ? null : (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportActivityReportForm({
  defaults,
  onOpenChange,
}: {
  defaults: ActivityReportExportDefaults;
  onOpenChange: (open: boolean) => void;
}) {
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [clientName, setClientName] = React.useState(defaults.defaultClientName);
  const [projectName, setProjectName] = React.useState(defaults.defaultProjectName);
  const [generating, setGenerating] = React.useState(false);

  const clientNameOptions = React.useMemo(() => {
    const names = defaults.clientOptions.map((option) => option.name);
    if (defaults.defaultClientName && !names.includes(defaults.defaultClientName)) {
      names.unshift(defaults.defaultClientName);
    }
    return names;
  }, [defaults]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await fetchActivityReportExportData({ month, year });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await generateActivityReportPdf({
        employeeName: defaults.employeeName,
        clientName,
        projectName,
        month,
        year,
        reports: result.data.reports,
      });
      toast.success("Report generated.");
      onOpenChange(false);
    } catch (error) {
      console.error("[activity-reports] export failed", error);
      toast.error("Could not generate the report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="export-month">Month</Label>
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))} disabled={generating}>
              <SelectTrigger id="export-month" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((label, index) => (
                  <SelectItem key={label} value={String(index + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-year">Year</Label>
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))} disabled={generating}>
              <SelectTrigger id="export-year" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions().map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="export-client">Client name</Label>
          <Select value={clientName} onValueChange={setClientName} disabled={generating}>
            <SelectTrigger id="export-client" className="w-full">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clientNameOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="export-project">Project name</Label>
          <Input
            id="export-project"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            disabled={generating}
            placeholder="Project name"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
          Cancel
        </Button>
        <Button onClick={() => void handleGenerate()} disabled={generating}>
          {generating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Generate
        </Button>
      </DialogFooter>
    </>
  );
}
