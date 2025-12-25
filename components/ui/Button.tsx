
import React, { forwardRef } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    primary: "bg-primary text-primary-fg hover:bg-primary-hover focus:ring-primary border border-transparent",
    secondary: "bg-secondary text-secondary-fg hover:bg-secondary-hover focus:ring-border border border-border",
    danger: "bg-danger text-danger-fg hover:bg-danger-hover focus:ring-danger border border-transparent",
    ghost: "bg-transparent text-muted hover:text-highlight hover:bg-surface-highlight",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    className={`flex h-10 w-full rounded-md border border-border bg-surface-light px-3 py-2 text-sm text-highlight placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${props.className || ''}`}
    // Remove inline styles as CSS variables now handle this in :root
    {...props}
  />
);

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => (
  <textarea
    ref={ref}
    className={`flex w-full rounded-md border border-border bg-surface-light px-3 py-2 text-sm text-highlight placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${props.className || ''}`}
    // Remove inline styles as CSS variables now handle this in :root
    {...props}
  />
));
TextArea.displayName = "TextArea";

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ children, className, ...props }) => (
  <label className={`text-xs font-medium text-muted mb-1 block ${className}`} {...props}>
    {children}
  </label>
);
