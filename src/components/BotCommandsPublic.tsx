import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/backend';
import { Bot } from 'lucide-react';

type Cmd = { trigger: string; description: string };

export default function BotCommandsPublic() {
  const [cmds, setCmds] = useState<Cmd[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('bot_commands')
        .select('trigger,description')
        .eq('enabled', true)
        .order('sort_order', { ascending: true });
      setCmds((data ?? []) as Cmd[]);
    })();
  }, []);
  if (!cmds.length) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold">Daftar Perintah Bot WhatsApp</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Kirim salah satu perintah ini ke nomor WhatsApp bot kami.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {cmds.map((c) => (
            <li key={c.trigger} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="font-mono text-sm text-primary">{c.trigger}</div>
              {c.description && (
                <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
