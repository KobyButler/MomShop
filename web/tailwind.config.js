/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./lib/**/*.{ts,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", "system-ui", "-apple-system", "sans-serif"]
            },
            colors: {
                brand: {
                    50:  "#f5f3ff",
                    100: "#ede9fe",
                    200: "#ddd6fe",
                    300: "#c4b5fd",
                    400: "#a78bfa",
                    500: "#8b5cf6",
                    600: "#7c3aed",
                    700: "#6d28d9",
                    800: "#5b21b6",
                    900: "#4c1d95",
                    950: "#2e1065",
                },
                // Sidebar dark palette
                ink: {
                    50:  "#f0f0ff",
                    100: "#e4e4f0",
                    200: "#c8c8d8",
                    300: "#9999b8",
                    400: "#6e6e90",
                    500: "#4e4e6a",
                    600: "#353550",
                    700: "#22223a",
                    800: "#141426",
                    900: "#0c0c1c",
                    950: "#07070f",
                },
            },
            backgroundImage: {
                "brand-gradient": "linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)",
                "brand-gradient-soft": "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                "brand-gradient-vivid": "linear-gradient(135deg, #a78bfa 0%, #7c3aed 50%, #4f46e5 100%)",
                "shine": "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)",
            },
            boxShadow: {
                "card":       "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                "card-hover": "0 8px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
                "modal":      "0 25px 60px rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.15)",
                "glow":       "0 0 20px rgba(124,58,237,0.35)",
                "glow-lg":    "0 0 40px rgba(124,58,237,0.4)",
                "glow-sm":    "0 0 10px rgba(124,58,237,0.25)",
                "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.08)",
                "button":     "0 2px 8px rgba(124,58,237,0.35), 0 1px 2px rgba(0,0,0,0.1)",
            },
            borderRadius: {
                "2xl": "1rem",
                "3xl": "1.25rem",
                "4xl": "1.5rem",
            },
            keyframes: {
                shimmer: {
                    "0%":   { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                "float": {
                    "0%, 100%": { transform: "translateY(0px)" },
                    "50%":      { transform: "translateY(-6px)" },
                },
                "glow-pulse": {
                    "0%, 100%": { boxShadow: "0 0 20px rgba(124,58,237,0.3)" },
                    "50%":      { boxShadow: "0 0 40px rgba(124,58,237,0.6)" },
                },
                "slide-in-right": {
                    "0%":   { transform: "translateX(100%)", opacity: "0" },
                    "100%": { transform: "translateX(0)",    opacity: "1" },
                },
                "slide-out-right": {
                    "0%":   { transform: "translateX(0)",    opacity: "1" },
                    "100%": { transform: "translateX(100%)", opacity: "0" },
                },
                "scale-in": {
                    "0%":   { transform: "scale(0.94) translateY(4px)", opacity: "0" },
                    "100%": { transform: "scale(1)    translateY(0)",    opacity: "1" },
                },
                "fade-up": {
                    "0%":   { transform: "translateY(12px)", opacity: "0" },
                    "100%": { transform: "translateY(0)",    opacity: "1" },
                },
                "count-up": {
                    "0%":   { opacity: "0", transform: "translateY(8px)" },
                    "100%": { opacity: "1", transform: "translateY(0)"   },
                },
                "spin-slow": {
                    "0%":   { transform: "rotate(0deg)"   },
                    "100%": { transform: "rotate(360deg)" },
                },
            },
            animation: {
                "shimmer":        "shimmer 2s linear infinite",
                "float":          "float 3s ease-in-out infinite",
                "glow-pulse":     "glow-pulse 2s ease-in-out infinite",
                "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.32,0.72,0,1)",
                "slide-out-right":"slide-out-right 0.25s ease-in",
                "scale-in":       "scale-in 0.2s cubic-bezier(0.32,0.72,0,1)",
                "fade-up":        "fade-up 0.4s cubic-bezier(0.32,0.72,0,1)",
                "count-up":       "count-up 0.5s cubic-bezier(0.32,0.72,0,1)",
                "spin-slow":      "spin-slow 3s linear infinite",
            },
            transitionTimingFunction: {
                "spring": "cubic-bezier(0.32, 0.72, 0, 1)",
            },
        }
    },
    plugins: [require("tailwindcss-animate")]
};
