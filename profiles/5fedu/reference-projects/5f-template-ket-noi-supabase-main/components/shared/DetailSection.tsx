import React from 'react';
import Section from './Section';

interface DetailSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'muted';
  id?: string;
  headerRight?: React.ReactNode;
}

/** Section trong màn detail – dùng chung Section (cùng style với FormSection) */
const DetailSection: React.FC<DetailSectionProps> = (props) => {
  return <Section {...props} />;
};

export default DetailSection;
