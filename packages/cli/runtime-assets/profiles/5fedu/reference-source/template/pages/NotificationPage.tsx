import React from 'react';
import { txt } from '@/lib/text';
import { Bell } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useNotifications } from '@/hooks/use-notifications';
import NotificationItem from '@/components/notification/NotificationItem';
import Section from '@/components/shared/Section';

const NotificationPage: React.FC = () => {
  const { notifications, markAsRead, remove } = useNotifications();

  return (
    <div className="min-h-full bg-card rounded-xl border border-border shadow-sm p-4 md:p-5">
      <div className="space-y-4">
        <Section
        title={txt('notification.title')}
        icon={<Bell size={16} className="text-primary" />}
      >
        {notifications.length > 0 ? (
          <ul className="rounded-lg border border-border overflow-hidden divide-y divide-border">
            <AnimatePresence mode="popLayout">
              {notifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onMarkRead={markAsRead}
                  onRemove={remove}
                />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {txt('notification.empty')}
          </p>
        )}
      </Section>
      </div>
    </div>
  );
};

export default NotificationPage;
