import React, { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function TagInput({ tags = [], onChange, suggestions = [], placeholder = "Add tags..." }) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s)
  );

  const addTag = (tag) => {
    const clean = tag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) {
      onChange([...tags, clean]);
    }
    setInputValue("");
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  const removeTag = (idx) => onChange(tags.filter((_, i) => i !== idx));

  const handleKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        addTag(filtered[activeIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length > 0) setActiveIndex((p) => (p + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length > 0) setActiveIndex((p) => (p - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-transparent min-h-9 items-center focus-within:ring-1 focus-within:ring-ring">
        {tags.map((tag, idx) => (
          <Badge key={idx} variant="info" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="ml-0.5 hover:bg-blue-500/20 rounded-full p-0.5"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        <input
          type="text"
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm px-1 py-0.5"
          placeholder={tags.length === 0 ? placeholder : ""}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowDropdown(true); setActiveIndex(-1); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKey}
        />
      </div>
      {showDropdown && (inputValue || filtered.length > 0) && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((s, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-accent",
                  activeIndex === i && "bg-accent"
                )}
              >
                {s}
              </button>
            ))
          ) : inputValue.trim() && !tags.includes(inputValue.trim().toLowerCase()) ? (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(inputValue); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
            >
              Create "{inputValue.trim().toLowerCase()}"
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
