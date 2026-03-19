import { Skeleton } from '@/components/ui/skeleton';

export default function ReplayCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card/80 backdrop-blur-sm">
      <Skeleton className="aspect-video w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-9 w-full mt-2" />
      </div>
    </div>
  );
}
