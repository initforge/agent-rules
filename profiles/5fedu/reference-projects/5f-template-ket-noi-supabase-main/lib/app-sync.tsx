import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { useUIStore } from '@/store/useStore';
import { PRIMARY_COLOR_MAP } from './theme-utils';
import {
  GOOGLE_FONT_CSS2_MAP,
  buildSansStackCss,
  type AppFontFamily,
} from './theme/fonts';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

export function loadFont(fontFamily: string): void {
  const fontParam = GOOGLE_FONT_CSS2_MAP[fontFamily as AppFontFamily];
  if (fontParam === undefined || fontParam === '') return;
  const id = `gfont-${fontFamily.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontParam}&display=swap`;
  document.head.appendChild(link);
}

export const ThemeSynchronizer: React.FC = () => {
  const primaryColor = useUIStore((s) => s.primaryColor);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const fontSize = useUIStore((s) => s.fontSize);
  const colorScheme = useUIStore((s) => s.colorScheme);

  useEffect(() => {
    const root = document.documentElement;
    const hslValue = PRIMARY_COLOR_MAP[primaryColor];
    root.style.setProperty('--primary', hslValue);
    root.style.setProperty('--ring', hslValue);
    root.style.setProperty('--secondary-foreground', hslValue);
    root.style.setProperty('--accent-foreground', hslValue);
    root.style.setProperty('--color-primary', `hsl(${hslValue})`);
    root.style.setProperty('--color-ring', `hsl(${hslValue} / 0.5)`);

    loadFont(fontFamily);
    root.style.setProperty('--font-sans', buildSansStackCss(fontFamily));
    root.dataset.textSize = fontSize;
  }, [primaryColor, fontFamily, fontSize]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    const getResolvedTheme = (): 'dark' | 'light' => {
      if (colorScheme === 'dark') return 'dark';
      if (colorScheme === 'light') return 'light';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    let transitionTimer: ReturnType<typeof setTimeout> | undefined;
    if (!isFirstRender.current) {
      root.setAttribute('data-theme-transition', '');
      transitionTimer = setTimeout(() => root.removeAttribute('data-theme-transition'), 350);
    }
    isFirstRender.current = false;

    const apply = () => {
      const resolved = getResolvedTheme();
      if (resolved === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };
    apply();
    if (colorScheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => {
        mq.removeEventListener('change', apply);
        if (transitionTimer) clearTimeout(transitionTimer);
      };
    }
    return () => {
      if (transitionTimer) clearTimeout(transitionTimer);
    };
  }, [colorScheme]);
  return null;
};

export const MetadataSynchronizer: React.FC = () => {
  const companyInfo = useUIStore((s) => s.companyInfo);
  useEffect(() => {
    const titlePart = companyInfo.appDescription
      ? `${companyInfo.appName} - ${companyInfo.appDescription}`
      : companyInfo.appName;
    document.title = titlePart;
    if (companyInfo.appLogo) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = companyInfo.appLogo;
    }
  }, [companyInfo]);
  return null;
};

/** Đồng bộ dayjs và lang=document — ứng dụng chỉ dùng tiếng Việt */
export const LanguageSynchronizer: React.FC = () => {
  useEffect(() => {
    dayjs.locale('vi');
    document.documentElement.lang = 'vi';
  }, []);
  return null;
};

export function useResolvedTheme(): 'dark' | 'light' {
  const colorScheme = useUIStore((s) => s.colorScheme);

  const systemPrefersDark = useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  );

  if (colorScheme === 'dark') return 'dark';
  if (colorScheme === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}
