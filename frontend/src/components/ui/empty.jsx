import * as React from "react";
import { cn } from "@/lib/utils";

const Empty = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground", className)}
    {...props}
  />
));
Empty.displayName = "Empty";

const EmptyIcon = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-12 w-12 items-center justify-center rounded-full bg-muted", className)} {...props} />
));
EmptyIcon.displayName = "EmptyIcon";

const EmptyTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-sm font-semibold text-foreground", className)} {...props} />
));
EmptyTitle.displayName = "EmptyTitle";

const EmptyDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-xs text-muted-foreground max-w-sm", className)} {...props} />
));
EmptyDescription.displayName = "EmptyDescription";

export { Empty, EmptyIcon, EmptyTitle, EmptyDescription };
