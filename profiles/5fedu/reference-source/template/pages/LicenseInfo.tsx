import React from 'react';
import { txt } from '@/lib/text';
import { useNavigate } from 'react-router-dom';
import {
  Copyright,
  Building2,
  ShieldCheck,
  Globe,
  Users,
  MessageCircle,
  ExternalLink,
  Phone,
} from 'lucide-react';
import DashboardToolbar from '@/components/shared/DashboardToolbar';
import Section from '@/components/shared/Section';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/** Dữ liệu bản quyền – CÔNG TY TNHH 5F EDU VIỆT NAM */
const LICENSE_DATA = {
  companyName: 'CÔNG TY TNHH 5F EDU VIỆT NAM',
  representative: 'LÊ MINH CÔNG',
  taxCode: '2902251862',
  address: 'Số 10, Ngõ 146, Đường Hòa Thái, Khối Phong Đăng, Phường Trường Vinh, Thành Phố Vinh, Tỉnh Nghệ An, Việt Nam',
  version: 'v2.4.0 (Stable)',
  licenseDate: '01/01/2024',
  communityLinks: [
    { key: 'website', href: 'https://5fedu.com', labelKey: 'page.license.website', icon: Globe },
    { key: 'fanpage', href: 'https://www.facebook.com/5fedu/', labelKey: 'page.license.fanpage', icon: ExternalLink },
    { key: 'communityGroup', href: 'https://www.facebook.com/groups/nghienappsheet', labelKey: 'page.license.communityGroup', icon: Users },
    { key: 'zaloGroup', href: 'https://www.zalo.me/g/hsatjm781', labelKey: 'page.license.zaloGroup', icon: MessageCircle },
    { key: 'tiktok', href: 'https://www.tiktok.com/@cong5f', labelKey: 'page.license.tiktok', icon: ExternalLink },
  ],
};

const TECHNICAL_CONTACT = {
  name: 'Lê Minh Công',
  position: 'Giám đốc',
  phone: '0961040521',
  email: 'admin@5fedu.com',
};

const BUSINESS_CONTACT = {
  name: 'Nguyễn Hương Anh',
  position: 'Quản lý Kinh doanh',
  phone: '096 1059994',
  email: 'sale.5fedu@gmail.com',
};

const LicenseInfo: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-0">
      <DashboardToolbar
        onBack={() => navigate('/')}
        leadingContent={
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Copyright className="h-4 w-4" />
            </div>
            <h1 className="text-sm font-semibold text-foreground truncate">
              {txt('page.license.title')}
            </h1>
          </div>
        }
      />
      <div className="space-y-6 pb-10 pt-3 md:pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Đơn vị xây dựng & Phát triển */}
          <Section
            title={txt('page.license.unitTitle')}
            icon={<Building2 className="h-4 w-4 text-primary" />}
          >
            <div className="space-y-4">
              <div className="flex flex-col border-b border-border/60 pb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {txt('page.license.companyName')}
                </span>
                <span className="text-foreground font-semibold text-lg">
                  {LICENSE_DATA.companyName}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {txt('page.license.representative')}
                  </span>
                  <span className="text-foreground font-medium">
                    {LICENSE_DATA.representative}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {txt('page.license.taxCode')}
                  </span>
                  <span className="text-foreground font-medium">
                    {LICENSE_DATA.taxCode}
                  </span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {txt('page.license.address')}
                </span>
                <span className="text-muted-foreground">{LICENSE_DATA.address}</span>
              </div>
            </div>
          </Section>

          {/* Quyền hạn & Bảo mật */}
          <Section
            title={txt('page.license.rightsTitle')}
            icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />}
          >
            <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>{txt('page.license.rightsIntro')}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {txt('page.license.version')}: <strong className="text-foreground">{LICENSE_DATA.version}</strong>
                </li>
                <li>
                  {txt('page.license.licenseDate')}: {LICENSE_DATA.licenseDate}
                </li>
                <li>
                  {txt('page.license.status')}: {txt('page.license.statusRegistered')}
                </li>
              </ul>
              <p className="text-xs text-muted-foreground pt-2 border-t border-border/60 mt-3">
                {txt('page.license.footer')}
              </p>
            </div>
          </Section>

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Section title={txt('page.license.communityLinks')}>
            <div className="grid grid-cols-1 gap-2">
              {LICENSE_DATA.communityLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                      'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{txt(item.labelKey)}</span>
                  </a>
                );
              })}
            </div>
          </Section>

          {/* Liên hệ Kỹ thuật – cùng pattern thẻ gradient */}
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-lg">
            <h3 className="font-bold mb-1">{txt('page.license.technicalContact')}</h3>
            <p className="text-sm text-primary-foreground/90 mb-0.5">{TECHNICAL_CONTACT.name}</p>
            <p className="text-xs text-primary-foreground/80 mb-1">{TECHNICAL_CONTACT.position}</p>
            <p className="text-sm text-primary-foreground/95 mb-0.5">{txt('page.license.contactPhone')}: {TECHNICAL_CONTACT.phone}</p>
            <p className="text-sm text-primary-foreground/95 mb-3">{txt('page.license.contactEmail')}: {TECHNICAL_CONTACT.email}</p>
            <a href={`mailto:${TECHNICAL_CONTACT.email}`} className="block mb-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-background text-primary hover:bg-background/90 font-semibold text-sm"
              >
                {txt('page.license.contactEmail')}
              </Button>
            </a>
            <a href={`tel:${TECHNICAL_CONTACT.phone.replace(/\s/g, '')}`}>
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-background/80 text-primary hover:bg-background/90 font-semibold text-sm border border-background/30"
              >
                <Phone className="h-4 w-4 mr-1.5 inline" />
                {txt('page.license.contactPhone')}
              </Button>
            </a>
          </div>

          {/* Liên hệ Kinh doanh – cùng pattern */}
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-lg">
            <h3 className="font-bold mb-1">{txt('page.license.businessContact')}</h3>
            <p className="text-sm text-primary-foreground/90 mb-0.5">{BUSINESS_CONTACT.name}</p>
            <p className="text-xs text-primary-foreground/80 mb-1">{BUSINESS_CONTACT.position}</p>
            <p className="text-sm text-primary-foreground/95 mb-0.5">{txt('page.license.contactPhone')}: {BUSINESS_CONTACT.phone}</p>
            <p className="text-sm text-primary-foreground/95 mb-3">{txt('page.license.contactEmail')}: {BUSINESS_CONTACT.email}</p>
            <a href={`mailto:${BUSINESS_CONTACT.email}`} className="block mb-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-background text-primary hover:bg-background/90 font-semibold text-sm"
              >
                {txt('page.license.contactEmail')}
              </Button>
            </a>
            <a href={`tel:${BUSINESS_CONTACT.phone.replace(/\s/g, '')}`}>
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-background/80 text-primary hover:bg-background/90 font-semibold text-sm border border-background/30"
              >
                <Phone className="h-4 w-4 mr-1.5 inline" />
                {txt('page.license.contactPhone')}
              </Button>
            </a>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default LicenseInfo;
