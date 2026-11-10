import { Button } from "@/components/Elements";
import { useSync } from "@/context/SyncContext";
import { useAuth } from "@/hooks/useAuth";
import {
  formatBytes,
  readDeviceUsage,
  requestPersistence,
} from "@/services/storageUsage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function Meter({ used, total, label }: { used: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {formatBytes(used)} of {formatBytes(total)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 rounded-full bg-muted overflow-hidden"
      >
        <div
          className={`h-full ${percent >= 90 ? "bg-destructive" : "bg-highlight"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function StorageSettings() {
  const { status } = useAuth();
  const { usage } = useSync();
  const queryClient = useQueryClient();
  const device = useQuery({ queryKey: ["device-usage"], queryFn: readDeviceUsage });

  const persist = async () => {
    const granted = await requestPersistence();
    await queryClient.invalidateQueries({ queryKey: ["device-usage"] });
    if (granted) toast.success("This browser will keep your music");
    else toast.error("The browser did not allow it. Installing the app usually helps.");
  };

  const info = device.data;

  return (
    <section
      aria-labelledby="storage-title"
      className="border border-card rounded-lg p-3 flex flex-col gap-3"
    >
      <h2 id="storage-title" className="font-medium">
        Storage
      </h2>

      {info?.usedBytes !== undefined && info.quotaBytes ? (
        <Meter used={info.usedBytes} total={info.quotaBytes} label="This device" />
      ) : (
        <p className="text-sm text-muted-foreground">
          This browser does not report how much space is used.
        </p>
      )}

      {info?.persisted ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" /> The browser will not clear
          your music when space runs low.
        </p>
      ) : (
        info?.canPersist && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Browsers may clear saved music when space runs low.
            </p>
            <Button.Secondary onClick={() => void persist()} className="self-start text-base">
              <ShieldCheck size={18} /> Keep my music safe
            </Button.Secondary>
          </div>
        )
      )}

      {status === "signed-in" &&
        (usage ? (
          usage.repos.map((repo) => (
            <Meter
              key={repo.name}
              used={repo.usedBytes}
              total={usage.maxRepoBytes}
              label={`GitHub: ${repo.name}${repo.full ? " (full)" : ""}`}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Sync once to see how much of your GitHub storage is used.
          </p>
        ))}
    </section>
  );
}
