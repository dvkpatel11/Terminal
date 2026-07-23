import { useEffect, useState } from "react";
import { X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertNotification {
  id: string;
  symbol: string;
  message: string;
  type: "info" | "warning" | "critical";
  timestamp: Date;
}

export default function AlertOverlay() {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);

  // Listen for WebSocket alert events
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "alert") {
          const alert: AlertNotification = {
            id: crypto.randomUUID(),
            symbol: data.symbol || "MARKET",
            message: data.message || "Alert triggered",
            type: data.severity || "info",
            timestamp: new Date(),
          };
          setAlerts(prev => [...prev, alert]);

          // Auto-dismiss after 5 seconds
          setTimeout(() => {
            setAlerts(prev => prev.filter(a => a.id !== alert.id));
          }, 5000);
        }
      } catch {
        // Ignore parse errors
      }
    };

    return () => ws.close();
  }, []);

  const dismiss = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-12 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={cn(
            "flex items-start gap-2 px-3 py-2 rounded border backdrop-blur-sm",
            "animate-in slide-in-from-right duration-300",
            alert.type === "critical" && "bg-negative-muted border-negative/30",
            alert.type === "warning" && "bg-macro-muted border-macro/30",
            alert.type === "info" && "bg-market-muted border-market/30",
          )}
        >
          <Bell className={cn(
            "w-3.5 h-3.5 mt-0.5 shrink-0",
            alert.type === "critical" && "text-negative",
            alert.type === "warning" && "text-macro",
            alert.type === "info" && "text-market",
          )} />
          <div className="flex-1 min-w-0">
            <span className="font-terminal text-data-sm font-semibold text-foreground">
              {alert.symbol}
            </span>
            <span className="font-terminal text-data-xs text-muted-foreground ml-1.5">
              {alert.message}
            </span>
          </div>
          <button
            onClick={() => dismiss(alert.id)}
            className="text-flat hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}