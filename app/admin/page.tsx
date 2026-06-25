export const dynamic = "force-dynamic";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          Admin dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tu budú KPI karty, grafy, zoznam agentov a live leady. Zatiaľ
          placeholder, postavíme v Kroku 7.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Nové dnes", value: "—" },
          { label: "Spracované", value: "—" },
          { label: "V SLA", value: "—" },
          { label: "Mimo SLA", value: "—" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border bg-background p-5"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-background p-6">
        <h2 className="text-base font-bold">Posledné leady</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Žiadne leady zatiaľ. Webhook endpoint pridáme v Kroku 7.
        </p>
      </div>
    </div>
  );
}
