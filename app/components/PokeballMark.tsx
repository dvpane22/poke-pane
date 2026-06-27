import { CSSProperties } from "react";

export function PokeballMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`pokeball-mark${className ? ` ${className}` : ""}`}
      style={{ "--pokeball-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}
