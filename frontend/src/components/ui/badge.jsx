import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    destructive: "border-transparent bg-destructive text-destructive-foreground",
    outline: "text-foreground",
    success: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warning: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
    info: "border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400",
    review: "border-transparent bg-violet-500/15 text-violet-600 dark:text-violet-400",
  };
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
