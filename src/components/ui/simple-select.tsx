"use client"

import { cn } from "@/lib/utils"

interface SimpleSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  children: React.ReactNode
  disabled?: boolean
}

interface SimpleSelectItemProps {
  value: string
  children: React.ReactNode
  disabled?: boolean
}

export function SimpleSelect({ 
  value, 
  onValueChange, 
  placeholder = "선택하세요", 
  className,
  children,
  disabled = false 
}: SimpleSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {placeholder && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  )
}

export function SimpleSelectItem({ value, children, disabled = false }: SimpleSelectItemProps) {
  return (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  )
}

