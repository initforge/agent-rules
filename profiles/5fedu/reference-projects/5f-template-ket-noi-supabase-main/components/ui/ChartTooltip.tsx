import React from 'react';

/** Props tương thích Recharts Tooltip (active, payload, label) */
export interface ChartTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  fill?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({ active: isActive, payload, label }) => {
  if (!isActive || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label != null && label !== '' && (
        <p className="font-medium text-foreground mb-1">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: p.color ?? p.fill }}
          />
          {p.name}: <span className="font-semibold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default ChartTooltip;
