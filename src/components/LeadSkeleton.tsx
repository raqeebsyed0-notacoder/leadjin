export const LeadSkeleton = () => (
  <div className="grid grid-cols-[50px_1fr_70px] md:grid-cols-[100px_1fr_1fr_120px] border-b border-app-border glass items-center animate-pulse">
    <div className="p-3 md:p-6 flex justify-center">
      <div className="w-8 h-8 md:w-12 md:h-12 bg-app-accent/10 rounded-full" />
    </div>
    <div className="p-3 md:p-6 space-y-2">
      <div className="h-4 bg-app-accent/10 rounded w-3/4" />
      <div className="h-3 bg-app-accent/5 rounded w-1/2" />
    </div>
    <div className="hidden md:block p-6">
      <div className="h-4 bg-app-accent/10 rounded w-1/2" />
    </div>
    <div className="p-3 md:p-6 flex justify-center">
      <div className="w-8 h-8 bg-app-accent/10 rounded-full" />
    </div>
  </div>
);
