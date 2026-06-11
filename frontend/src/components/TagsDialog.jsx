import React from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { TagInput } from "@/components/TagInput";
import { defaultIndustryTags } from "@/hooks/useBids";

export default function TagsDialog({ open, onOpenChange, selected, uniqueTags, onTagsUpdated }) {
  const { t } = useTranslation();
  const [editTags, setEditTags] = React.useState([]);

  React.useEffect(() => {
    if (selected) {
      setEditTags(selected.tags || []);
    }
  }, [selected]);

  const handleUpdateTags = async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api.put(`/bids/${selected._id}`, { tags: editTags });
      toast.success("Tags updated");
      onOpenChange(false);
      onTagsUpdated();
    } catch {
      toast.error("Failed to update tags");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.editTagsTitle", { id: selected?.bidId })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleUpdateTags} className="space-y-4">
          <TagInput
            tags={editTags}
            onChange={setEditTags}
            suggestions={[...new Set([...(defaultIndustryTags[selected?.industry] || []), ...uniqueTags])].filter((t) => !editTags.includes(t))}
            placeholder={t("common.tagPlaceholder")}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
