'use client';

import { useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from '@/hooks/use-theme';

type Density = 'compact' | 'default' | 'comfortable';
type FontSize = 'sm' | 'md' | 'lg';

const DENSITY_KEY = 'noovastack.appearance.density';
const FONT_KEY = 'noovastack.appearance.fontSize';

function saved<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useState<Density>(() => saved(DENSITY_KEY, 'default'));
  const [fontSize, setFontSize] = useState<FontSize>(() => saved(FONT_KEY, 'md'));
  const [saved2, setSaved] = useState(false);

  function applyDensity(d: Density) {
    setDensity(d);
    try { localStorage.setItem(DENSITY_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }
  function applyFontSize(f: FontSize) {
    setFontSize(f);
    try { localStorage.setItem(FONT_KEY, JSON.stringify(f)); } catch { /* ignore */ }
  }
  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const themes = [
    { id: 'light', label: 'Light', icon: Sun, desc: 'Light background, dark text' },
    { id: 'dark', label: 'Dark', icon: Moon, desc: 'Dark background, light text' },
    { id: 'system', label: 'System', icon: Monitor, desc: 'Follows your OS setting' },
  ] as const;

  const densities = [
    { id: 'compact', label: 'Compact', desc: 'Tighter spacing — more content visible' },
    { id: 'default', label: 'Default', desc: 'Balanced spacing for daily use' },
    { id: 'comfortable', label: 'Comfortable', desc: 'Roomier spacing — easier to scan' },
  ] as const;

  const fontSizes = [
    { id: 'sm', label: 'Small', sample: 'text-xs' },
    { id: 'md', label: 'Medium', sample: 'text-sm' },
    { id: 'lg', label: 'Large', sample: 'text-base' },
  ] as const;

  return (
    <>
      <PageHeader title="Appearance" description="Customise how NoovaStack looks and feels." />
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Theme</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {themes.map((t) => {
                const Icon = t.icon;
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id as Theme)}
                    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors ${active ? 'border-[#155EEF] bg-[#EAF2FF] dark:border-[#49A6DF] dark:bg-[#143A5A]' : 'border-[#DCE3EA] hover:border-[#aac1e4] dark:border-[#2A394D]'}`}
                  >
                    {active && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#155EEF] dark:bg-[#49A6DF]"><Check className="h-3 w-3 text-white" /></span>}
                    <Icon className={`h-6 w-6 ${active ? 'text-[#155EEF] dark:text-[#49A6DF]' : 'text-[#667085] dark:text-[#94A3B8]'}`} />
                    <span className={`text-sm font-semibold ${active ? 'text-[#155EEF] dark:text-[#49A6DF]' : 'text-[#102033] dark:text-[#F1F5F9]'}`}>{t.label}</span>
                    <span className="text-xs text-[#667085] dark:text-[#94A3B8]">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Interface Density</h2></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {densities.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => applyDensity(d.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${density === d.id ? 'border-[#155EEF] bg-[#EAF2FF] dark:border-[#49A6DF] dark:bg-[#143A5A]' : 'border-[#DCE3EA] hover:border-[#aac1e4] dark:border-[#2A394D]'}`}
                >
                  <div>
                    <p className={`text-sm font-semibold ${density === d.id ? 'text-[#155EEF] dark:text-[#49A6DF]' : 'text-[#102033] dark:text-[#F1F5F9]'}`}>{d.label}</p>
                    <p className="text-xs text-[#667085] dark:text-[#94A3B8]">{d.desc}</p>
                  </div>
                  {density === d.id && <Check className="h-4 w-4 text-[#155EEF] dark:text-[#49A6DF]" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Font Size</h2></CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {fontSizes.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => applyFontSize(f.id)}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors ${fontSize === f.id ? 'border-[#155EEF] bg-[#EAF2FF] dark:border-[#49A6DF] dark:bg-[#143A5A]' : 'border-[#DCE3EA] hover:border-[#aac1e4] dark:border-[#2A394D]'}`}
                >
                  <span className={`font-semibold ${f.sample} ${fontSize === f.id ? 'text-[#155EEF] dark:text-[#49A6DF]' : 'text-[#102033] dark:text-[#F1F5F9]'}`}>Aa</span>
                  <span className="text-xs text-[#667085] dark:text-[#94A3B8]">{f.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button onClick={save}>
          {saved2 ? <><Check className="h-4 w-4" /> Saved</> : 'Save Preferences'}
        </Button>
      </div>
    </>
  );
}
