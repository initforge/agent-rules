
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { txt } from '@/lib/text';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X, Eye, EyeOff } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store/useStore';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';
import { DIALOG_SIZE } from '@/lib/dialog-sizes';
import { cn } from '@/lib/utils';
import { loginWithUsername } from '@/lib/employee-auth/login-session';
import { FORCE_CHANGE_PATH } from '@/components/auth/ProtectedRoute';
import { normalizeLoginName } from '@/lib/validation/login-name';

const AUTH_REMEMBER_KEY = 'auth-remember';

type LoginValues = {
  username: string;
  password: string;
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { companyInfo } = useUIStore();
  const [isLoading, setIsLoading] = useState(false);

  const loginSchema = useMemo(() => z.object({
    username: z
      .string()
      .min(1, txt('page.login.usernameRequired'))
      .min(2, txt('page.login.usernameMin')),
    password: z.string().min(6, txt('page.login.passwordMin')),
  }), []);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    }
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch()
  const formUsername = watch('username');

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotAccount, setForgotAccount] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const forgotAccountInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    const v = localStorage.getItem(AUTH_REMEMBER_KEY);
    return v === null || v === 'true';
  });

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTH_REMEMBER_KEY) === null) {
      localStorage.setItem(AUTH_REMEMBER_KEY, 'true');
    }
  }, []);

  useEffect(() => {
    if (forgotOpen) setForgotAccount(formUsername || '');
  }, [forgotOpen, formUsername]);

  useEffect(() => {
    if (forgotOpen) queueMicrotask(() => forgotAccountInputRef.current?.focus());
  }, [forgotOpen]);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const account = forgotAccount.trim();
    if (!account) {
      toast.error(txt('page.login.usernameRequired'));
      return;
    }
    if (account.length < 2) {
      toast.error(txt('page.login.usernameMin'));
      return;
    }
    setForgotSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    setForgotSubmitting(false);
    setForgotOpen(false);
    toast.info(txt('page.login.recoverySent'), { description: txt('page.login.recoverySentTitle') });
  };

  const onSubmit = async (data: LoginValues) => {
    setIsLoading(true);
    localStorage.setItem(AUTH_REMEMBER_KEY, rememberMe ? 'true' : 'false');

    const result = await loginWithUsername({
      username: normalizeLoginName(data.username),
      password: data.password,
    });

    setIsLoading(false);

    if (!result.ok) {
      toast.error(result.error || txt('page.login.loginFailed'));
      return;
    }

    login(result.user);
    toast.success(txt('page.login.loginSuccess'));
    navigate(result.mustChangePassword ? FORCE_CHANGE_PATH : '/');
  };

  const handleRememberChange = (checked: boolean) => {
    setRememberMe(checked);
    localStorage.setItem(AUTH_REMEMBER_KEY, checked ? 'true' : 'false');
  };

  return (
    <div className="flex min-h-screen w-full bg-background items-center justify-center p-6 md:p-12 relative">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8"
      >
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground tracking-tight">{txt('page.login.welcome')}</h2>
          <p className="text-muted-foreground mt-2">{txt('page.login.welcomeDesc')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-4">
            <div>
              <Input
                label={txt('page.login.username')}
                type="text"
                autoComplete="username"
                placeholder={txt('page.login.usernamePlaceholder')}
                required
                {...register('username')}
                error={errors.username?.message}
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none mb-2 block">{txt('page.login.password')}<span className="text-red-500 ml-0.5">*</span></label>
                <button type="button" onClick={() => setForgotOpen(true)} className="text-xs font-medium text-primary hover:text-primary/80 hover:underline mb-2">{txt('page.login.forgotPassword')}</button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={cn(
                    'flex h-11 w-full rounded-lg border bg-background pl-3 pr-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    errors.password ? 'border-destructive focus-visible:ring-destructive' : 'border-input'
                  )}
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? txt('page.login.hidePassword') : txt('page.login.showPassword')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="text-sm font-medium text-destructive mt-1">{errors.password.message}</p>}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => handleRememberChange(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            />
            <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer select-none">{txt('page.login.rememberMe')}</label>
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-base shadow-lg shadow-primary/20"
            isLoading={isLoading}
          >
            {txt('page.login.loginButton')}
            {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
          </Button>
        </form>

        <AnimatePresence>
          {forgotOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !forgotSubmitting && setForgotOpen(false)}
                className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md"
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="forgot-password-title"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={cn('relative bg-card rounded-xl p-6 w-full shadow-2xl border border-border/40', DIALOG_SIZE.MEDIUM)}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="forgot-password-title" className="text-lg font-semibold text-foreground mb-2">{txt('page.login.forgotPasswordTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-4">{txt('page.login.forgotPasswordDesc')}</p>
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <Input
                    ref={forgotAccountInputRef}
                    label={txt('page.login.forgotAccountLabel')}
                    type="text"
                    autoComplete="username"
                    placeholder={txt('page.login.forgotAccountPlaceholder')}
                    value={forgotAccount}
                    onChange={(e) => setForgotAccount(e.target.value)}
                    required
                    className="h-11"
                  />
                  <div className="flex gap-3 justify-end pt-2">
                    <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotSubmitting} className="min-w-[100px]">
                      {txt('common.cancel')}
                    </Button>
                    <Button type="submit" isLoading={forgotSubmitting} className="min-w-[140px]">
                      {txt('page.login.sendRecovery')}
                    </Button>
                  </div>
                </form>
                <button
                  type="button"
                  onClick={() => !forgotSubmitting && setForgotOpen(false)}
                  aria-label="Đóng"
                  className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  <X size={20} />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="text-center text-sm text-muted-foreground">
          {txt('page.login.noAccount')}{' '}
          <Link to="/dang-ky" className="font-semibold text-primary hover:underline">{txt('page.login.register')}</Link>
        </div>
      </motion.div>

      <div className="absolute bottom-6 text-center text-xs text-muted-foreground w-full left-0 px-4">
        {txt('page.login.copyright')} {companyInfo.companyName || txt('page.login.companyFallback')}. {txt('page.login.legal')}
      </div>
    </div>
  );
};

export default Login;
