import React from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { formatDate } from "@/utils/date";
import { useTranslation } from "react-i18next";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CommentsDialog({ open, onOpenChange, selected, user, onCommentChange }) {
  const { t } = useTranslation();
  const [commentText, setCommentText] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const handleDeleteComment = async (commentId) => {
    if (!selected) return;
    setDeleteTarget(commentId);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !selected) return;
    try {
      await api.delete(`/bids/${selected._id}/comments/${deleteTarget}`);
      toast.success("Comment deleted");
      onCommentChange();
    } catch {
      toast.error("Failed to delete comment");
    } finally {
      setDeleteTarget(null);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!commentText || !selected) return;
    try {
      await api.post(`/bids/${selected._id}/comments`, { text: commentText });
      setCommentText("");
      toast.success(t("bids.commentAdded"));
      onCommentChange();
    } catch {
      toast.error(t("bids.commentFailed"));
    }
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("bids.commentsTitle", { id: selected?.bidId })}</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {selected?.comments?.length > 0 ? (
            selected.comments.map((c) => {
              const canDelete = c.userId === user?._id || c.author === user?.name || user?.role === "Admin";
              return (
                <div key={c._id} className="flex gap-2 p-2 rounded-md bg-muted/30">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {c.author?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{c.author}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(new Date(c.date), "MMM dd, h:mm a")}
                        </span>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive"
                            onClick={() => handleDeleteComment(c._id)}
                            aria-label="Delete comment"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm mt-0.5 break-words">{c.text}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">{t("bids.noComments")}</p>
          )}
        </div>
        <form onSubmit={addComment} className="flex gap-2">
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={t("bids.addCommentPlaceholder")}
            aria-label="Add a comment"
          />
          <Button type="submit" size="icon" aria-label="Send comment"><Send className="h-4 w-4" /></Button>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete comment?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the comment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
