import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftIcon?: React.ReactNode;
}

export function Input({ label, error, hint, leftIcon, className, id, ...props }: InputProps) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="field-label">
                    {label}
                    {props.required && <span className="text-brand-500 ml-0.5">*</span>}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        {leftIcon}
                    </span>
                )}
                <input
                    id={inputId}
                    className={cn(
                        "w-full rounded-xl border bg-white text-sm text-slate-900",
                        "placeholder:text-slate-400 transition-all duration-200",
                        "focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
                        error
                            ? "border-red-300 focus:ring-red-300/40 focus:border-red-400"
                            : "border-slate-200 hover:border-slate-300",
                        leftIcon ? "pl-9 pr-3 py-2.5" : "px-3 py-2.5",
                        className
                    )}
                    {...props}
                />
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
    );
}
