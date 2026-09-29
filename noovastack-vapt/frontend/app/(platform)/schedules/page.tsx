"use client";

import { CalendarClock, Plus } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import {
  useCreateSchedule,
  useScheduleActions,
  useSchedules,
} from "@/hooks/use-schedules";
import { useProjects } from "@/hooks/use-projects";
import { formatDate, titleCase } from "@/lib/utils";
import type { ScanSchedule } from "@/types";
import { useState } from "react";

function parseTestingWindow(value: string): { start: string; end: string } | null {
  const match = value.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  return match ? { start: match[1], end: match[2] } : null;
}

export default function SchedulesPage() {
  const schedules = useSchedules();
  const projects = useProjects();
  const create = useCreateSchedule();
  const actions = useScheduleActions();
  const [form, setForm] = useState({
    name: "",
    project_id: "",
    recurrence_rule: "weekly",
    scan_category: "website",
    scan_depth: "standard",
    next_run_at: "",
    cron_expression: "",
    testing_window: "",
  });

  const buildPayload = () => {
    const { next_run_at, cron_expression, testing_window, ...rest } = form;
    const payload: Record<string, unknown> = {
      ...rest,
      assessment_mode: "black_box",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    if (next_run_at) {
      payload.next_run_at = new Date(next_run_at).toISOString();
    }
    if (form.recurrence_rule === "custom" && cron_expression) {
      payload.cron_expression = cron_expression;
    }
    const window = parseTestingWindow(testing_window);
    if (window) {
      payload.testing_window = window;
    }
    return payload;
  };

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Calendar, upcoming scans, recurring scans, and run history with blocked-run explanations."
      />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-6">
          <h2 className="font-semibold">Create Schedule</h2>
          <div className="mt-4 space-y-4">
            <Field label="Schedule name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Project">
              <Select
                value={form.project_id}
                onChange={(e) =>
                  setForm({ ...form, project_id: e.target.value })
                }
              >
                <option value="">Choose project</option>
                {projects.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Recurrence">
              <Select
                value={form.recurrence_rule}
                onChange={(e) =>
                  setForm({ ...form, recurrence_rule: e.target.value })
                }
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom (cron)</option>
              </Select>
            </Field>
            {form.recurrence_rule === "custom" && (
              <Field label="Cron expression">
                <Input
                  placeholder="0 2 * * 1"
                  value={form.cron_expression}
                  onChange={(e) =>
                    setForm({ ...form, cron_expression: e.target.value })
                  }
                />
              </Field>
            )}
            <Field label="Start time">
              <Input
                type="datetime-local"
                value={form.next_run_at}
                onChange={(e) =>
                  setForm({ ...form, next_run_at: e.target.value })
                }
              />
            </Field>
            <Field label="Testing window">
              <Input
                placeholder="22:00-04:00 UTC"
                value={form.testing_window}
                onChange={(e) =>
                  setForm({ ...form, testing_window: e.target.value })
                }
              />
            </Field>
            <Button
              onClick={() => create.mutate(buildPayload())}
              disabled={
                !form.name ||
                !form.project_id ||
                !form.next_run_at ||
                (form.recurrence_rule === "custom" && !form.cron_expression)
              }
            >
              <Plus className="h-4 w-4" /> Save Schedule
            </Button>
          </div>
        </Card>
        <div>
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            {["Month View", "Week View", "List View"].map((view) => (
              <Card
                key={view}
                className="p-4 text-sm font-semibold text-[#0B1F3A]"
              >
                {view}
              </Card>
            ))}
          </div>
          <DataTable<ScanSchedule>
            data={schedules.data ?? []}
            empty={
              <EmptyState
                icon={CalendarClock}
                title="No schedules yet"
                description="Create weekly, daily, monthly, deployment-triggered, or custom scan schedules with testing windows."
              />
            }
            columns={[
              {
                key: "name",
                header: "Schedule",
                render: (schedule) => schedule.name,
              },
              {
                key: "project",
                header: "Project",
                render: (schedule) => schedule.project_id,
              },
              {
                key: "next",
                header: "Next Run",
                render: (schedule) => formatDate(schedule.next_run_at),
              },
              {
                key: "frequency",
                header: "Frequency",
                render: (schedule) => titleCase(schedule.recurrence_rule),
              },
              {
                key: "profile",
                header: "Scan Profile",
                render: (schedule) =>
                  `${titleCase(schedule.scan_category)} / ${titleCase(schedule.scan_depth)}`,
              },
              {
                key: "status",
                header: "Status",
                render: (schedule) => <StatusBadge value={schedule.status} />,
              },
              {
                key: "actions",
                header: "Actions",
                render: (schedule) =>
                  schedule.status === "active" ? (
                    <Button
                      variant="secondary"
                      onClick={() => actions.pause.mutate(schedule.id)}
                      disabled={actions.pause.isPending}
                    >
                      Pause
                    </Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => actions.requestApproval.mutate(schedule.id)}
                        disabled={actions.requestApproval.isPending}
                      >
                        Request approval
                      </Button>
                      <Button
                        onClick={() => actions.enable.mutate(schedule.id)}
                        disabled={actions.enable.isPending}
                      >
                        Enable
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </>
  );
}
