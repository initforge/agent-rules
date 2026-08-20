import React, { useState, useMemo } from 'react';
import { txt } from '@/lib/text';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useUIStore } from '@/store/useStore';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';
import { loginNameToSupabaseEmail } from '@/lib/auth-email';

type RegisterValues = {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
};

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { companyInfo } = useUIStore();
  const [isLoading, setIsLoading] = useState(false);

  const registerSchema = useMemo(
    () =>
      z
        .object({
          fullName: z.string().min(2, txt('page.register.fullNameMin')),
          username: z
            .string()
            .min(1, txt('page.login.usernameRequired'))
            .min(2, txt('page.login.usernameMin')),
          password: z.string().min(6, txt('page.login.passwordMin')),
          confirmPassword: z.string().min(1, txt('page.register.passwordMismatch')),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: txt('page.register.passwordMismatch'),
          path: ['confirmPassword'],
        }),
    []
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterValues) => {
    setIsLoading(true);
    try {
      const email = loginNameToSupabaseEmail(data.username);
      // Supabase: await getAuthService().signUp({ email, password: data.password, fullName: data.fullName.trim() });
      await new Promise((r) => setTimeout(r, 1500));
      toast.success(txt('page.register.success'));
      navigate('/dang-nhap');
      void email;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background items-center justify-center p-6 md:p-12 relative">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8"
      >
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground tracking-tight">{txt('page.register.title')}</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{txt('page.register.desc')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label={txt('page.register.fullName')}
            type="text"
            autoComplete="name"
            placeholder={txt('page.register.fullNamePlaceholder')}
            required
            {...register('fullName')}
            error={errors.fullName?.message}
            className="h-11"
          />
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
          <Input
            label={txt('page.register.password')}
            type="password"
            autoComplete="new-password"
            placeholder={txt('page.register.passwordPlaceholder')}
            required
            {...register('password')}
            error={errors.password?.message}
            className="h-11"
          />
          <Input
            label={txt('page.register.confirmPassword')}
            type="password"
            autoComplete="new-password"
            placeholder={txt('page.register.confirmPasswordPlaceholder')}
            required
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
            className="h-11"
          />

          <Button
            type="submit"
            className="w-full h-11 text-base shadow-lg shadow-primary/20"
            isLoading={isLoading}
          >
            {txt('page.register.submit')}
            {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          {txt('page.register.hasAccount')}{' '}
          <Link to="/dang-nhap" className="font-semibold text-primary hover:underline">
            {txt('page.register.loginLink')}
          </Link>
        </div>
      </motion.div>

      <div className="absolute bottom-6 text-center text-xs text-muted-foreground w-full left-0 px-4">
        {txt('page.login.copyright')} {companyInfo.companyName || txt('page.login.companyFallback')}. {txt('page.login.legal')}
      </div>
    </div>
  );
};

export default Register;
