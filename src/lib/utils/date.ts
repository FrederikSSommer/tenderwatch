import { format, formatDistanceToNow, differenceInDays } from 'date-fns'

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'd MMM yyyy')
}

export function formatDeadline(deadline: string | Date | null): string {
  if (!deadline) return 'No deadline'
  const d = new Date(deadline)
  const days = differenceInDays(d, new Date())
  if (days < 0) return 'Expired'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return `${days} days left`
  return format(d, 'd MMM yyyy')
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}
