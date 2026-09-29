import { redirect } from 'next/navigation';

export default function LegacyGenerateReportRedirect() {
  redirect('/reports');
}
