"use client";

import { useState } from "react";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrgFormDialog } from "./org-form";
import { useUserStore } from "@/store/user-store";
import { ORG_KIND_LABELS, type Organization } from "@/types/user";

export function OrgList() {
  const account = useUserStore((s) => s.account);
  const addOrganization = useUserStore((s) => s.addOrganization);
  const updateOrganization = useUserStore((s) => s.updateOrganization);
  const removeOrganization = useUserStore((s) => s.removeOrganization);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  if (!account) return null;

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (org: Organization) => {
    setEditing(org);
    setDialogOpen(true);
  };
  const handleSubmit = (data: Omit<Organization, "id">) => {
    if (editing) updateOrganization(editing.id, data);
    else addOrganization(data);
  };
  const handleDelete = (id: string, name: string) => {
    if (confirm(`"${name}" 기관을 삭제하시겠습니까?`)) removeOrganization(id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">소속 기관</h3>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" />
          기관 추가
        </Button>
      </div>

      {account.organizations.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-400">
          등록된 기관이 없습니다.
          <br />
          &ldquo;기관 추가&rdquo; 버튼으로 소속 기업·연구실·소상공인 사업장 등을 등록하세요.
        </Card>
      ) : (
        <div className="space-y-2">
          {account.organizations.map((org) => (
            <Card key={org.id} className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{org.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {ORG_KIND_LABELS[org.kind]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {org.region}
                  {org.industry && ` · ${org.industry}`}
                  {org.researchField && ` · ${org.researchField}`}
                  {org.businessAge != null && ` · 업력 ${org.businessAge}년`}
                  {org.employeeCount != null && ` · ${org.employeeCount}명`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(org)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => handleDelete(org.id, org.name)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <OrgFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
