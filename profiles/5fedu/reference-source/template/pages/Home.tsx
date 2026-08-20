import React from 'react';
import { txt } from '@/lib/text';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import MainCard from '@/components/dashboard/MainCard';
import { useAuthStore } from '@/store/useStore';
import { useFilteredSidebarMenu } from '@/hooks/use-filtered-sidebar-menu';
import 'dayjs/locale/vi';

function getGreetingKey(hour: number): string {
  if (hour >= 5 && hour < 12) return 'page.home.greetingMorning';
  if (hour >= 12 && hour < 18) return 'page.home.greetingAfternoon';
  return 'page.home.greetingEvening';
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greetingKey = getGreetingKey(hour);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  };

  const sidebarMenu = useFilteredSidebarMenu();

  const modules = sidebarMenu.filter((m) => m.path !== '/').map((m) => ({
    title: txt(m.nameKey),
    description: m.descriptionKey ? txt(m.descriptionKey) : '',
    icon: m.icon,
    path: m.path,
    gradient: m.gradient,
  }));

  return (
    <div className="pb-10 pt-2 shrink-0">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
          {txt(greetingKey)},{' '}
          <span className="text-primary">{user?.full_name || txt('page.home.adminFallback')}</span> 👋
        </h1>
      </div>

      <div className="h-px bg-border w-full mb-6" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 h-full items-start content-start"
      >
        {modules.map((mod) => (
          <motion.div key={mod.path} variants={item}>
            <MainCard
              title={mod.title}
              description={mod.description}
              icon={mod.icon}
              gradient={mod.gradient}
              onClick={() => navigate(mod.path)}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Home;
