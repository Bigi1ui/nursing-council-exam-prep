import type { CSSProperties, ReactNode } from "react";

export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return <section className={`panel ${className}`} style={style}>{children}</section>;
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${value}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="m-0 text-[25px] font-bold tracking-[-.03em] text-[#182b43]">{title}</h1>
        {description && <p className="mb-0 mt-1.5 max-w-2xl text-[13px] leading-6 text-[#718197]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Tag({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "orange" | "red" | "gray" }) {
  const tones = {
    blue: "bg-[#edf3ff] text-[#3564c4]",
    green: "bg-[#e8f7f1] text-[#168468]",
    orange: "bg-[#fff4e5] text-[#b8791b]",
    red: "bg-[#fff0f0] text-[#d35c62]",
    gray: "bg-[#f0f3f6] text-[#718197]",
  };
  return <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
}