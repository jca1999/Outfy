import { Users } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/utils";
import { chatInitials } from "./chat-utils";

export function ChatAvatar({
  label,
  avatarUrl,
  group,
  className,
  testId,
}: {
  label: string;
  avatarUrl?: string | null;
  group?: boolean;
  className?: string;
  testId?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);
  if (group) {
    return (
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary",
          className,
        )}
        data-testid={testId}
        aria-hidden
      >
        <Users className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-[10px] font-bold text-primary",
        className,
      )}
      data-testid={testId}
      aria-hidden
    >
      {chatInitials(label)}
      {avatarUrl && !failed && (
        <img
          src={avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
