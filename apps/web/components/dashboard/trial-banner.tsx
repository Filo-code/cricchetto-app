import Link from "next/link";
import { getWorkshopSubscription } from "../../lib/subscription";

export async function TrialBanner({ workshopId }: { workshopId: string }) {
  const sub = await getWorkshopSubscription(workshopId);

  if (sub.adminFreeAccess) return null;
  if (sub.subscriptionStatus !== "trial_active" && sub.subscriptionStatus !== "trial_expired") return null;

  const isExpired = sub.subscriptionStatus === "trial_expired";
  const daysLeft = isExpired
    ? 0
    : Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000));

  const urgent = isExpired || daysLeft <= 3;

  return (
    <div
      className={`sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-2 backdrop-blur-sm border-b text-[11px] ${
        urgent
          ? "bg-orange-950/90 border-orange-700/50 text-orange-200"
          : "bg-amber-950/80 border-amber-700/30 text-amber-300"
      }`}
    >
      <span className="font-mono">
        {isExpired ? (
          <>
            <span className="font-semibold text-orange-400">PROVA SCADUTA</span>
            {" · "}
            <span>Abbonati per continuare ad usare Cricchetto.</span>
          </>
        ) : (
          <>
            <span className={`font-semibold ${urgent ? "text-orange-400" : "text-amber-400"}`}>
              PERIODO DI PROVA
            </span>
            {" · "}
            <span>
              {daysLeft === 0
                ? "Ultimo giorno"
                : daysLeft === 1
                ? "1 giorno rimasto"
                : `${daysLeft} giorni rimasti`}
            </span>
          </>
        )}
      </span>
      <Link
        href="/subscribe"
        className={`shrink-0 rounded border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] transition-colors ${
          urgent
            ? "border-orange-600 text-orange-300 hover:bg-orange-800 hover:text-orange-100"
            : "border-amber-600 text-amber-400 hover:bg-amber-900/50 hover:text-amber-200"
        }`}
      >
        Abbonati →
      </Link>
    </div>
  );
}
