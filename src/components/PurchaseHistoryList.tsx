import { useState } from 'react';
import { ChevronDown, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AccessInfoCard from '@/components/AccessInfoCard';


export interface PurchaseHistoryEntry {
  key: string;
  title: string;
  dateLabel?: string;
  badge?: string;
  token: string;
  showId?: string;
  replayId?: string;
}

export default function PurchaseHistoryList({
  items,
  emptyText = 'Belum ada pembelian.',
}: {
  items: PurchaseHistoryEntry[];
  emptyText?: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-2">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const isOpen = openKey === it.key;
        return (
          <div key={it.key} className="rounded-lg border border-border bg-card/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : it.key)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/40 transition-colors"
            >
              <Ticket className="w-4 h-4 text-primary shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm leading-tight truncate">{it.title}</span>
                {it.dateLabel && <span className="block text-[10px] text-muted-foreground">{it.dateLabel}</span>}
              </span>
              {it.badge && <Badge variant="outline" className="text-[10px] shrink-0">{it.badge}</Badge>}
              <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-2">
                <AccessInfoCard token={it.token} showId={it.showId} replayId={it.replayId} compact />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
