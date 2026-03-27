'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export function ModelSelector() {
  const model = useSessionStore((s) => s.model);
  const setModel = useSessionStore((s) => s.setModel);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getModels()
      .then((res) => setModels(res.models))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading models...</div>;
  }

  if (models.length === 0) {
    return (
      <Input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="Model ID"
        className="h-8 text-xs"
      />
    );
  }

  return (
    <Select value={model} onValueChange={(value) => { if (value !== null) setModel(value); }}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id} className="text-xs">
            {m.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
