'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { NstLogo } from '@/components/branding/nst-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { BRAND } from '@/lib/branding';
import { APP_NAME } from '@/lib/constants';
import { loginSchema } from '@/lib/validation';
import type { z } from 'zod';

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', mfaCode: '', rememberDevice: false } });

  useEffect(() => {
    const emailInput = document.querySelector<HTMLInputElement>('input[autocomplete="email"]');
    const passwordInput = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');
    if (!emailInput || !passwordInput) return;
    const timer = window.setTimeout(() => {
      if (emailInput.value) setValue('email', emailInput.value, { shouldDirty: true });
      if (passwordInput.value) setValue('password', passwordInput.value, { shouldDirty: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [setValue]);

  async function onSubmit(values: LoginValues) {
    try {
      await login(values.email, values.password);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign in failed');
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md p-8 dark:border-white/10 dark:bg-[#0F1C2E]">
      <div className="mb-8 text-center">
        <NstLogo variant="full" className="mx-auto h-20 max-w-[260px] justify-center" />
        <h1 className="mt-5 text-2xl font-bold text-[#102033] dark:text-white">{APP_NAME}</h1>
        <p className="mt-1 text-sm font-semibold text-[#0B5E9E] dark:text-blue-400">{BRAND.companyName}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Secure vulnerability assessment made simple.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Email" error={errors.email?.message}><Controller name="email" control={control} render={({ field }) => <Input type="email" autoComplete="email" aria-label="Email" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} /></Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="relative">
            <Controller name="password" control={control} render={({ field }) => <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-label="Password" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            <button type="button" className="absolute right-2 top-2 rounded p-1 text-slate-500" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </Field>
        <Field label="MFA code when required"><Controller name="mfaCode" control={control} render={({ field }) => <Input inputMode="numeric" autoComplete="one-time-code" placeholder="Optional" aria-label="MFA code" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} />} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><Controller name="rememberDevice" control={control} render={({ field }) => <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800" checked={field.value ?? false} onChange={field.onChange} />} /> Remember this device when permitted</label>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign In'}</Button>
      </form>
      <div className="mt-6 flex justify-between text-sm"><a className="text-[#0B5E9E] dark:text-blue-400" href="/forgot-password">Forgot password?</a><a className="text-[#0B5E9E] dark:text-blue-400" href="/session-expired">Session help</a></div>
    </Card>
  );
}
