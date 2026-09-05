"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createEmployeeAction, type ActionResult } from "../../actions";

export function NewEmployeeForm({
  departments,
  employees,
}: {
  departments: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createEmployeeAction, { ok: false });
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <>
      <PageHeader title="New employee" crumbs={[{ label: "HR" }, { label: "Employees", href: "/app/hr/employees" }, { label: "New employee" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        <FormSection title="Employee details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" required>
                Name
              </Label>
              <Input id="name" name="name" placeholder="Asha Rao" required />
              {err("name") ? <p className="text-2xs text-danger">{err("name")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code">Employee code</Label>
              <Input id="code" name="code" placeholder="EMP-001" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
              {err("email") ? <p className="text-2xs text-danger">{err("email")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="jobTitle">Job title</Label>
              <Input id="jobTitle" name="jobTitle" placeholder="Software Engineer" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employmentType">Employment type</Label>
              <Select id="employmentType" name="employmentType" defaultValue="full_time">
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="departmentId">Department</Label>
              <Select id="departmentId" name="departmentId" defaultValue="">
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reportsToId">Reports to</Label>
              <Select id="reportsToId" name="reportsToId" defaultValue="">
                <option value="">No manager</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dateOfJoining" required>
                Date of joining
              </Label>
              <Input id="dateOfJoining" name="dateOfJoining" type="date" required />
              {err("dateOfJoining") ? <p className="text-2xs text-danger">{err("dateOfJoining")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="baseSalary">Base salary</Label>
              <Input id="baseSalary" name="baseSalary" type="number" min="0" step="0.01" className="tnum" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Anything worth remembering about this employee..." />
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Creating..." : "Create employee"}
          </Button>
        </div>
      </form>
    </>
  );
}
