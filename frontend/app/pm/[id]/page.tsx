import PMDetailClient from './PMDetailClient'

// Generates a single static fallback page for the dynamic [id] route.
// Client-side navigation via Next.js <Link> will work for all IDs.
// For direct URL access, nginx must serve this file as a fallback:
//   location /pm/ { try_files $uri $uri/ /pm/_/index.html; }
export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function PMDetailPage() {
  return <PMDetailClient />
}
