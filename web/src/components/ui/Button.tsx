import React, { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      icon,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Clases base con ergonomía táctil y accesibilidad estricta
    const baseClasses =
      'inline-flex items-center justify-center font-semibold rounded-lg select-none cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed whitespace-nowrap shrink-0';

    const sizeClasses = {
      sm: 'text-xs px-3.5 py-1.5 gap-1.5 min-h-[32px]',
      md: 'text-sm px-4 py-2 gap-2 min-h-[40px]',
      lg: 'text-base px-5 py-2.5 gap-2.5 min-h-[48px]',
    }[size];

    const variantClasses = {
      primary:
        'bg-blue-600 hover:bg-blue-700 text-white shadow-xs border border-blue-700',
      secondary:
        'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 shadow-xs',
      danger:
        'bg-red-600 hover:bg-red-700 text-white shadow-xs border border-red-700',
      ghost:
        'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900',
      outline:
        'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs',
    }[variant];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : icon ? (
          <span className="shrink-0 flex items-center">{icon}</span>
        ) : null}
        <span className="whitespace-nowrap shrink-0">{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
