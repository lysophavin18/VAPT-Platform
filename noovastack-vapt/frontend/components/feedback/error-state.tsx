import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">We could not load this information.</p>
          <p className="mt-1">{message}</p>
          {onRetry ? <Button className="mt-3" variant="outline" onClick={onRetry}>Retry</Button> : null}
        </div>
      </div>
    </div>
  );
}
