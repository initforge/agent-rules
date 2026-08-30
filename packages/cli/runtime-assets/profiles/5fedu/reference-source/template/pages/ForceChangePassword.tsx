import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { txt } from '@/lib/text';
import { useAuthStore } from '@/store/useStore';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  resolveUserLoginName,
  setNewPasswordWithoutCurrent,
} from '@/lib/employee-auth/change-password';
import { getErrorMessage } from '@/lib/utils';

type ForceChangeValues = {
  password: string;
  confirmPassword: string;
};

export default function ForceChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);

  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(6, txt('page.forceChangePassword.minLength')),
          confirmPassword: z.string().min(1),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: txt('page.forceChangePassword.mismatch'),
          path: ['confirmPassword'],
        }),
    [],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForceChangeValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ForceChangeValues) => {
    try {
      const loginName = user ? resolveUserLoginName(user) : '';
      const result = await setNewPasswordWithoutCurrent(data.password, loginName || undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (user) {
        patchUser({ must_change_password: false });
      }

      toast.success(txt('page.forceChangePassword.success'));
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <KeyRound size={22} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{txt('page.forceChangePassword.title')}</h1>
          <p className="text-sm text-muted-foreground">{txt('page.forceChangePassword.desc')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label={txt('page.forceChangePassword.newPassword')}
            type="password"
            autoComplete="new-password"
            required
            {...register('password')}
            error={errors.password?.message}
          />
          <Input
            label={txt('page.forceChangePassword.confirmPassword')}
            type="password"
            autoComplete="new-password"
            required
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
          <Button type="submit" className="w-full h-11" isLoading={isSubmitting}>
            {txt('page.forceChangePassword.submit')}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
