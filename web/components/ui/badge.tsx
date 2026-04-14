import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
    | "default" | "success" | "warning" | "danger" | "info"
    | "purple" | "pink" | "orange" | "teal" | "neutral";

const styles: Record<BadgeVariant, string> = {
    default: "bg-slate-100  text-slate-600  ring-slate-200/60",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
    warning: "bg-amber-50   text-amber-700   ring-amber-200/60",
    danger:  "bg-red-50     text-red-700     ring-red-200/60",
    info:    "bg-sky-50     text-sky-700     ring-sky-200/60",
    purple:  "bg-violet-50  text-violet-700  ring-violet-200/60",
    pink:    "bg-pink-50    text-pink-700    ring-pink-200/60",
    orange:  "bg-orange-50  text-orange-700  ring-orange-200/60",
    teal:    "bg-teal-50    text-teal-700    ring-teal-200/60",
    neutral: "bg-slate-100  text-slate-500  ring-slate-200/60",
};

const dots: Record<BadgeVariant, string> = {
    default: "bg-slate-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger:  "bg-red-500",
    info:    "bg-sky-500",
    purple:  "bg-violet-500",
    pink:    "bg-pink-500",
    orange:  "bg-orange-500",
    teal:    "bg-teal-500",
    neutral: "bg-slate-400",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    dot?: boolean;
    size?: "sm" | "md";
}

export function Badge({ variant = "default", dot = false, size = "md", className, children, ...props }: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full ring-1 font-semibold",
                size === "sm" ? "px-2 py-px text-[11px]" : "px-2.5 py-0.5 text-xs",
                styles[variant],
                className
            )}
            {...props}
        >
            {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dots[variant])} />}
            {children}
        </span>
    );
}

export function statusVariant(status: string): BadgeVariant {
    const s = status?.toUpperCase();
    if (s === "FULFILLED" || s === "PAID" || s === "ACTIVE")    return "success";
    if (s === "UNFULFILLED" || s === "PENDING")                  return "warning";
    if (s === "CANCELLED" || s === "FAILED" || s === "INACTIVE") return "danger";
    if (s === "DRAFT")                                           return "default";
    if (s === "PROCESSING" || s === "SUBMITTED")                 return "info";
    if (s === "RECOVERED")                                       return "teal";
    if (s === "ABANDONED")                                       return "orange";
    return "default";
}
