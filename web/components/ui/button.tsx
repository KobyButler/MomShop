"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "size"> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
}

const variants: Record<ButtonVariant, string> = {
    primary:
        "bg-brand-gradient text-white shadow-button " +
        "hover:shadow-glow btn-shine",
    secondary:
        "bg-brand-100 text-brand-700 hover:bg-brand-200",
    outline:
        "border border-slate-200 bg-white text-slate-700 " +
        "hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50",
    ghost:
        "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger:
        "bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md",
    success:
        "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
};

const sizes: Record<ButtonSize, string> = {
    xs: "h-7  px-2.5 text-xs  gap-1.5 rounded-lg",
    sm: "h-8  px-3   text-xs  gap-1.5 rounded-lg",
    md: "h-9  px-4   text-sm  gap-2   rounded-xl",
    lg: "h-11 px-5   text-sm  gap-2   rounded-xl",
};

export function Button({
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    className,
    children,
    disabled,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <motion.button
            type={type}
            whileTap={{ scale: 0.96 }}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            disabled={disabled || loading}
            className={cn(
                "inline-flex items-center justify-center font-semibold",
                "transition-colors duration-200 select-none cursor-pointer",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
                "focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {loading ? (
                <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : icon ? (
                <span className="shrink-0 flex items-center">{icon}</span>
            ) : null}
            {children}
        </motion.button>
    );
}
