import Image from "next/image";

export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/Navy Cross, Checkmark, and Open Book Icon.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}