import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center animate-in">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-fg-subtle"><Compass className="size-7" /></div>
      <p className="text-5xl font-semibold tracking-tight tnum">404</p>
      <h1 className="text-lg font-semibold">{t('nf_title')}</h1>
      <p className="max-w-sm text-sm text-fg-subtle">{t('nf_text')}</p>
      <Button asChild><Link to="/">{t('nf_back')}</Link></Button>
    </div>
  )
}
