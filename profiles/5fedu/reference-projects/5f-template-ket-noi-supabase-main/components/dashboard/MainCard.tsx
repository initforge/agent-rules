import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

interface MainCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  onClick: () => void;
}

/**
 * Thẻ chức năng Trang chủ: nền trắng/card, chỉ ô icon có màu gradient.
 * Mô tả luôn hiển thị, giao diện sạch.
 */
const MainCard: React.FC<MainCardProps> = ({ title, description, icon: Icon, gradient, onClick }) => (
  <motion.div
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="group relative rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer flex flex-col items-center text-center"
  >
    {/* Mũi tên góc phải - hiện khi hover */}
    <div className="absolute top-3 right-3 rounded-full bg-muted p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>

    {/* Ô icon: chỉ phần này có gradient */}
    <div
      className={`mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${gradient} shadow-sm group-hover:scale-105 transition-transform duration-200`}
    >
      <Icon className="w-7 h-7 text-white" strokeWidth={1.8} />
    </div>

    {/* Tiêu đề */}
    <h2 className="text-base md:text-lg font-semibold text-foreground leading-tight mb-1.5 line-clamp-1">
      {title}
    </h2>

    {/* Mô tả: luôn hiển thị */}
    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[2.5rem]">
      {description}
    </p>
  </motion.div>
);

export default MainCard;
