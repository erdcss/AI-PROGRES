import * as React from "react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Mobile-optimized input variant for better touch interaction */
  mobileOptimized?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, mobileOptimized = true, ...props }, ref) => {
    const isMobile = useIsMobile();
    
    // Mobile-specific input attributes based on type
    const getMobileAttributes = (inputType: string = 'text') => {
      const baseAttributes = {
        autoComplete: props.autoComplete || 'off',
        autoCapitalize: props.autoCapitalize || 'none',
        autoCorrect: props.autoCorrect || 'off',
        spellCheck: props.spellCheck || false,
      };

      switch (inputType) {
        case 'email':
          return {
            ...baseAttributes,
            inputMode: 'email' as const,
            autoCapitalize: 'none',
            autoComplete: 'email',
          };
        case 'tel':
          return {
            ...baseAttributes,
            inputMode: 'tel' as const,
            autoComplete: 'tel',
          };
        case 'url':
          return {
            ...baseAttributes,
            inputMode: 'url' as const,
            autoCapitalize: 'none',
            autoComplete: 'url',
          };
        case 'number':
          return {
            ...baseAttributes,
            inputMode: 'numeric' as const,
            pattern: '[0-9]*',
          };
        case 'search':
          return {
            ...baseAttributes,
            inputMode: 'search' as const,
            autoCapitalize: 'none',
            autoComplete: 'off',
          };
        case 'password':
          return {
            ...baseAttributes,
            autoComplete: 'current-password',
          };
        default:
          return {
            ...baseAttributes,
            inputMode: 'text' as const,
            autoCapitalize: 'sentences',
          };
      }
    };

    const mobileAttributes = mobileOptimized && isMobile ? getMobileAttributes(type) : {};

    return (
      <input
        type={type}
        className={cn(
          // Base styles
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          // Mobile-specific responsive styles
          isMobile && mobileOptimized ? [
            "h-12 text-base px-4 py-3", // Larger touch targets and text on mobile
            "rounded-lg", // More rounded on mobile for modern look
            "transition-all duration-200", // Smooth transitions
            "focus-visible:ring-3 focus-visible:ring-blue-500/30", // Enhanced focus state
            "active:scale-[0.98]", // Subtle press feedback
            // Better mobile keyboard handling
            "selection:bg-blue-500/20"
          ] : "h-10",
          className
        )}
        ref={ref}
        {...mobileAttributes}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
