"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * `<Image>` con fallback a "Sin miniatura" si la URL rompe al cargar —
 * hace falta un client component porque `onError` de next/image solo
 * corre en el navegador. Pensado sobre todo para TikTok: `cover_image_url`
 * es una URL firmada que expira a los pocos días (ver
 * cacheRemoteThumbnail en lib/supabase/storage.ts, que la cachea en el
 * sync), pero si por lo que sea todavía queda una URL vieja sin cachear
 * en la BD, esto evita el ícono de imagen rota en vez de reventar la UI.
 */
export function ThumbnailImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-ink-400">
        Sin miniatura
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
