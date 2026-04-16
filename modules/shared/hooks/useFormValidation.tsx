/**
 * GLASSTECH ERP — Form Validation Hook (EH-Phase 3)
 *
 * Replaces browser alert() with:
 * - Inline field-level error messages
 * - Toast notifications
 * - Required field highlighting
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export type ValidationRules<T> = Partial<{
  [K in keyof T]: {
    required?:  boolean;
    requiredMsg?: string;
    minLength?: number;
    maxLength?: number;
    min?:       number;
    max?:       number;
    pattern?:   RegExp;
    patternMsg?: string;
    custom?:    (value: T[K], form: T) => string | null;
  };
}>;

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function useFormValidation<T extends Record<string, any>>(
  rules: ValidationRules<T>
) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<T>>({});

  const validate = useCallback((form: T): boolean => {
    const errors: FieldErrors<T> = {};

    for (const field in rules) {
      const rule = rules[field];
      if (!rule) continue;
      const value = form[field];

      // Required
      if (rule.required) {
        const isEmpty = value === null || value === undefined ||
          (typeof value === 'string' && !value.trim()) ||
          (Array.isArray(value) && value.length === 0) ||
          value === 0;
        if (isEmpty) {
          errors[field as keyof T] = rule.requiredMsg || `${String(field)} is required`;
          continue;
        }
      }

      // Min length
      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors[field as keyof T] = `Minimum ${rule.minLength} characters required`;
        continue;
      }

      // Max length
      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors[field as keyof T] = `Maximum ${rule.maxLength} characters allowed`;
        continue;
      }

      // Min value
      if (rule.min !== undefined && Number(value) < rule.min) {
        errors[field as keyof T] = `Minimum value is ${rule.min}`;
        continue;
      }

      // Max value
      if (rule.max !== undefined && Number(value) > rule.max) {
        errors[field as keyof T] = `Maximum value is ${rule.max}`;
        continue;
      }

      // Pattern
      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors[field as keyof T] = rule.patternMsg || 'Invalid format';
        continue;
      }

      // Custom validator
      if (rule.custom) {
        const customError = rule.custom(value, form);
        if (customError) {
          errors[field as keyof T] = customError;
          continue;
        }
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      // Show first error as toast
      const firstError = Object.values(errors)[0] as string;
      toast.error(firstError, { duration: 3000 });
      return false;
    }
    return true;
  }, [rules]);

  const clearError = useCallback((field: keyof T) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setFieldErrors({}), []);

  const setError = useCallback((field: keyof T, message: string) => {
    setFieldErrors(prev => ({ ...prev, [field]: message }));
    toast.error(message, { duration: 3000 });
  }, []);

  return { fieldErrors, validate, clearError, clearAll, setError };
}

// ── FieldError component ──────────────────────────────────────────────
import React from 'react';
import { AlertCircle } from 'lucide-react';

export const FieldError: React.FC<{ error?: string }> = ({ error }) => {
  if (!error) return null;
  return (
    <div className="flex items-center space-x-1.5 mt-1">
      <AlertCircle size={11} className="text-rose-500 shrink-0"/>
      <p className="text-[10px] font-bold text-rose-600">{error}</p>
    </div>
  );
};

// ── Input className helper ────────────────────────────────────────────
export const inputClass = (base: string, error?: string): string => {
  return error
    ? `${base} border-rose-400 bg-rose-50 focus:border-rose-500 focus:ring-rose-200`
    : base;
};

// ── Global alert() replacement ────────────────────────────────────────
// Drop-in replacement: replaceAlert('message') instead of alert('message')
export const replaceAlert = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
  switch (type) {
    case 'success': toast.success(message, { duration: 3000 }); break;
    case 'info':    toast.info(message,    { duration: 3000 }); break;
    default:        toast.error(message,   { duration: 4000 }); break;
  }
};

// ── Common validation rules ───────────────────────────────────────────
export const commonRules = {
  required:        { required: true },
  requiredText:    { required: true, minLength: 1 },
  positiveNumber:  { required: true, min: 0.01 },
  nonNegative:     { min: 0 },
  email:           { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: 'Invalid email format' },
  cnic:            { pattern: /^\d{5}-\d{7}-\d$/, patternMsg: 'Format: 12345-1234567-1' },
  phone:           { pattern: /^[\d\s\-\+]{10,15}$/, patternMsg: 'Invalid phone number' },
};
