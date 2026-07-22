import { cn } from "@/lib/utils";

interface Props {
  image?: string;
  source: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-20 h-14",
};

const textSizeClasses = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-sm",
};

export default function NewsThumb({ image, source, size = "md", className }: Props) {
  const isValidImage = image && !image.startsWith("data:") && !image.includes("placeholder");

  if (!isValidImage) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-surface-2 border border-border/50 rounded shrink-0",
          sizeClasses[size],
          className
        )}
      >
        <span className={cn("font-terminal font-bold text-cyan", textSizeClasses[size])}>
          {source[0]?.toUpperCase() ?? "?"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={image}
      alt=""
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
      className={cn("object-cover rounded shrink-0", sizeClasses[size], className)}
    />
  );
}
