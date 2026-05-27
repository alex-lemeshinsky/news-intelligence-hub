import type { InputHTMLAttributes } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FormField({ label, id, ...props }: FormFieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <input
        id={id}
        className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        {...props}
      />
    </label>
  );
}
