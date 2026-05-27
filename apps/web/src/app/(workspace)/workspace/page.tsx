export default function WorkspacePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
              Workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Authenticated access is active. The next product screens can call
              API endpoints with the session cookie instead of passing a
              temporary user header.
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Confirmed session
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Feeds", "Add sources and queue manual pulls."],
          ["Articles", "Review processing state and labels."],
          ["Graph", "Explore article and entity relationships."],
        ].map(([title, description]) => (
          <div
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            key={title}
          >
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
