// componente client que

'use client'
import { useState } from 'react'
import Image from 'next/image'

export function CandidatePhoto<ReadOnly>({
  name,
  url,
}: ReadOnly & { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
  return (
    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-green-200 bg-green-50">
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold text-[#075536]"
        role="img"
        aria-hidden={!!url && !failed}
        aria-label={`Foto indisponível: ${name}`}
        title="Foto indisponível"
      >
        {initials || '?'}
      </span>
      {url && !failed && (
        <Image
          src={url}
          alt={`Foto de ${name}`}
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="relative h-full w-full bg-green-50 object-cover object-top"
        />
      )}
    </div>
  )
}
