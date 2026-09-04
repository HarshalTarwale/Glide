"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Check, Mail, MessageSquare, Phone, Video } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateText } from "@/components/erp/money";
import type { ActivityDTO } from "@/server/crm/activities";
import { createActivityAction, setActivityDoneAction, type ActionResult } from "@/app/app/crm/actions";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Video,
  todo: MessageSquare,
};

/**
 * Shared between the Lead and Opportunity record pages -- CRM's version of
 * the Activity rail every other module's record page already has (see
 * record-shell.tsx's AuditTrail), except an Activity here is something a
 * salesperson logs and completes, not a system-written audit entry.
 */
export function ActivityLog({
  activities,
  leadId,
  opportunityId,
  partnerId,
  relatedPath,
}: {
  activities: ActivityDTO[];
  leadId?: string;
  opportunityId?: string;
  partnerId?: string;
  relatedPath: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createActivityAction, { ok: false });

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      router.refresh();
    }
    prevOk.current = state.ok;
  }, [state.ok, router]);

  async function toggleDone(id: string, next: boolean) {
    const result = await setActivityDoneAction(id, next, relatedPath);
    if (result.ok) {
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not update the activity");
    }
  }

  const open = activities.filter((a) => !a.isDone);
  const done = activities.filter((a) => a.isDone);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2 rounded-md border border-hairline p-3">
        {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
        {opportunityId ? <input type="hidden" name="opportunityId" value={opportunityId} /> : null}
        {partnerId ? <input type="hidden" name="partnerId" value={partnerId} /> : null}

        <div className="grid grid-cols-[100px_1fr] gap-2">
          <Select name="type" defaultValue="call" className="h-8 text-xs">
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="todo">To-do</option>
          </Select>
          <Input name="subject" placeholder="Subject — e.g. Discovery call" required className="h-8 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="activityDueDate" className="text-2xs text-ink-subtle">
            Due
          </Label>
          <Input id="activityDueDate" name="dueDate" type="date" className="h-7 w-36 text-xs" />
        </div>
        <Textarea name="notes" placeholder="Notes (optional)" className="min-h-14 text-xs" />
        {state.fieldErrors?.leadId ? <p className="text-2xs text-danger">{state.fieldErrors.leadId}</p> : null}
        {state.error ? (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-2 py-1.5 text-2xs text-danger">
            <AlertCircle className="mt-px size-3 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
        <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-full">
          {pending ? "Logging..." : "Log activity"}
        </Button>
      </form>

      {activities.length === 0 ? (
        <p className="text-xs text-ink-subtle">No activities logged yet.</p>
      ) : (
        <div className="space-y-3">
          {open.length > 0 ? (
            <ul className="space-y-1.5">
              {open.map((a) => (
                <ActivityRow key={a.id} activity={a} onToggle={toggleDone} />
              ))}
            </ul>
          ) : null}
          {done.length > 0 ? (
            <div>
              <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Completed</div>
              <ul className="space-y-1.5 opacity-60">
                {done.map((a) => (
                  <ActivityRow key={a.id} activity={a} onToggle={toggleDone} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ activity, onToggle }: { activity: ActivityDTO; onToggle: (id: string, next: boolean) => void }) {
  const Icon = TYPE_ICON[activity.type] ?? MessageSquare;
  return (
    <li className="flex items-start gap-2 rounded-md border border-hairline px-2.5 py-2">
      <Checkbox checked={activity.isDone} onCheckedChange={(checked) => onToggle(activity.id, checked === true)} className="mt-0.5" />
      <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-medium ${activity.isDone ? "text-ink-subtle line-through" : "text-ink"}`}>{activity.subject}</div>
        {activity.dueDate ? (
          <div className="text-2xs text-ink-subtle">
            Due <DateText value={activity.dueDate} />
          </div>
        ) : null}
        {activity.notes ? <div className="mt-0.5 text-2xs text-ink-muted">{activity.notes}</div> : null}
      </div>
      {activity.isDone ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> : null}
    </li>
  );
}
