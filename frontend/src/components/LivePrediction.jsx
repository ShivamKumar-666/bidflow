import { useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function ShapBar({ explanation }) {
  const maxAbs = 15;
  const pct = Math.min(Math.abs(explanation.shap_value) / maxAbs * 100, 100);
  const isPositive = explanation.impact === "positive";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground capitalize">{explanation.feature.replace(/_/g, " ")}</span>
        <span className={cn("font-mono font-semibold text-xs", isPositive ? "text-emerald-600" : "text-rose-600")}>
          {isPositive ? "+" : ""}{explanation.shap_value}%
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("absolute top-0 h-full rounded-full transition-all", isPositive ? "bg-emerald-500" : "bg-rose-500")}
          style={{ width: `${pct}%`, insetInlineStart: isPositive ? "50%" : `${50 - pct}%` }}
        />
        <div className="absolute top-0 start-1/2 w-px h-full bg-border" />
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{explanation.text}</p>
    </div>
  );
}

export default function LivePrediction({ livePredict, loading }) {
  const [showAll, setShowAll] = useState(false);
  if (!loading && !livePredict) return null;
  const value = livePredict?.win_probability ?? 0;
  const tone = value >= 70 ? "emerald" : value >= 40 ? "amber" : "rose";
  const explanations = livePredict?.shap_explanations || [];
  const visibleExplanations = showAll ? explanations : explanations.slice(0, 5);
  const toneBgMap = { emerald: "bg-emerald-500/10 border-emerald-500/20", amber: "bg-amber-500/10 border-amber-500/20", rose: "bg-rose-500/10 border-rose-500/20" };
  const toneTextMap = { emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" };
  return (
    <div className={cn(
      "rounded-lg p-3 border",
      loading ? "bg-muted/30 border-border" : toneBgMap[tone]
    )}>
      <div className="flex items-center gap-2 mb-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Brain className={cn("h-4 w-4", toneTextMap[tone])} />
        )}
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {loading ? "Calculating…" : "Live AI Estimate"}
        </span>
        {!loading && (
          <span className={cn("ms-auto text-lg font-bold", toneTextMap[tone])}>
            {value}%
          </span>
        )}
      </div>
      {!loading && explanations.length > 0 && (
        <>
          <div className="space-y-2">
            {visibleExplanations.map((ex, i) => (
              <ShapBar key={i} explanation={ex} />
            ))}
          </div>
          {explanations.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-[10px] text-primary hover:underline font-medium"
              aria-expanded={showAll}
            >
              {showAll ? "Show less" : `Show ${explanations.length - 5} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
