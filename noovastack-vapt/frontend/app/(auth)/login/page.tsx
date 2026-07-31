'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: 'admin@noovastack.local', password: 'AdminSecure2024!', rememberDevice: false } });

  async function onSubmit(values: LoginValues) {
    try {
      await login(values.email, values.password);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign in failed');
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md p-8">
      <div className="mb-8 text-center">
        <NstLogo variant="full" className="mx-auto h-20 max-w-[260px] justify-center" />
        <h1 className="mt-5 text-2xl font-bold text-[#102033]">{APP_NAME}</h1>
        <p className="mt-1 text-sm font-semibold text-[#0B5E9E]">{BRAND.companyName}</p>
        <p className="mt-2 text-sm text-slate-600">Secure vulnerability assessment made simple.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" aria-label="Email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="relative">
            <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-label="Password" {...register('password')} />
            <button type="button" className="absolute right-2 top-2 rounded p-1 text-slate-500" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </Field>
        <Field label="MFA code when required"><Input inputMode="numeric" autoComplete="one-time-code" placeholder="Optional" aria-label="MFA code" {...register('mfaCode')} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="rounded border-slate-300" {...register('rememberDevice')} /> Remember this device when permitted</label>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign In'}</Button>
      </form>
      <div className="mt-6 flex justify-between text-sm"><a className="text-[#0B5E9E]" href="/forgot-password">Forgot password?</a><a className="text-[#0B5E9E]" href="/session-expired">Session help</a></div>
    </Card>
  );
}
