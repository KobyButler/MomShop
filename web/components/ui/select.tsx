import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
}

export function Select({ label, error, className, id, children, ...props }: SelectProps) {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="field-label">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    id={selectId}
                    className={cn(
                        "w-full appearance-none rounded-xl border bg-white text-sm text-slate-900",
                        "pr-9 px-3 py-2.5 transition-all duration-200 cursor-pointer",
                        "focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
                        error
                            ? "border-red-300"
                            : "border-slate-200 hover:border-slate-300",
                        className
                    )}
                    {...props}
                >
                    {children}
                </select>
                {/* chevron */}
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </span>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}
