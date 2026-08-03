"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { CALENDAR_MEDIA_BUCKET } from "@/lib/supabase/storage";
import { attachCalendarMedia, startPublish, pollPublishStatus, type PublishActionResult } from "./actions";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { Button } from "@/components/ui/Button";
import type { Platform } from "@/types/db";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — límite conservador de Meta para fotos
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB — Meta: Instagram/Facebook pullean directo de Supabase Storage, sin pasar por nuestro proxy
const MAX_TIKTOK_VIDEO_BYTES = 20 * 1024 * 1024; // 20MB — TikTok pullea vía /api/media (nuestro proxy), más chico a propósito para no arriesgar el timeout de la función serverless

export interface CalendarItemFull {
  id: string;
  idea: string | null;
  platform: string | null;
  account_id: string | null;
  caption: string | null;
  media_path: string | null;
  media_type: string | null;
  status: string;
  external_post_id: string | null;
  permalink: string | null;
  publish_error: string | null;
}

export interface AccountOption {
  id: string;
  platform: Platform;
  role: string;
  display_name: string | null;
  username: string | null;
}

export function CalendarItemPublishPanel({
  item,
  accounts,
  brandId,
  onClose,
}: {
  item: CalendarItemFull;
  accounts: AccountOption[];
  brandId: string;
  onClose: () => void;
}) {
  const eligibleAccounts = item.platform ? accounts.filter((a) => a.platform === item.platform) : accounts;

  const [accountId, setAccountId] = useState(item.account_id ?? eligibleAccounts[0]?.id ?? "");
  const [caption, setCaption] = useState(item.caption ?? item.idea ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [savedMediaPath, setSavedMediaPath] = useState(item.media_path);
  const [savedMediaType, setSavedMediaType] = useState(item.media_type);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [publish, setPublish] = useState<{
    status: string;
    permalink: string | null;
    error: string | null;
  }>({ status: item.status, permalink: item.permalink, error: item.publish_error });
  const [isPublishing, setIsPublishing] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
  }, []);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileError(null);
    if (!f) {
      setFile(null);
      return;
    }

    const isVideo = f.type.startsWith("video/");
    const isImage = f.type.startsWith("image/");
    if (selectedAccount?.platform === "tiktok" && !isVideo) {
      setFileError("TikTok solo acepta video en este flujo.");
      return;
    }
    if (!isVideo && !isImage) {
      setFileError("Formato no reconocido — usá una imagen o un video.");
      return;
    }
    if (isImage && f.size > MAX_IMAGE_BYTES) {
      setFileError(`La imagen pesa demasiado (máx. ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`);
      return;
    }
    const videoLimit = selectedAccount?.platform === "tiktok" ? MAX_TIKTOK_VIDEO_BYTES : MAX_VIDEO_BYTES;
    if (isVideo && f.size > videoLimit) {
      setFileError(`El video pesa demasiado (máx. ${videoLimit / 1024 / 1024}MB).`);
      return;
    }
    setFile(f);
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      let mediaPath = savedMediaPath;
      let mediaType = savedMediaType;

      if (file) {
        const supabase = createClient();
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${brandId}/${item.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(CALENDAR_MEDIA_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          setSaveError(`No se pudo subir el archivo: ${uploadError.message}`);
          return;
        }
        mediaPath = path;
        mediaType = file.type.startsWith("video/") ? "video" : "image";
      }

      if (!accountId) {
        setSaveError("Elegí una cuenta destino.");
        return;
      }
      if (!mediaPath || !mediaType) {
        setSaveError("Adjuntá un archivo.");
        return;
      }

      const result = await attachCalendarMedia(item.id, {
        accountId,
        mediaPath,
        mediaType: mediaType as "image" | "video",
        caption,
      });
      if (result.error) {
        setSaveError(result.error);
        return;
      }

      setSavedMediaPath(mediaPath);
      setSavedMediaType(mediaType);
      setFile(null);
      setPublish({ status: "planned", permalink: null, error: null });
    } finally {
      setIsSaving(false);
    }
  }

  function applyResult(result: PublishActionResult) {
    if (result.error) {
      setPublish({ status: "failed", permalink: null, error: result.error });
      setIsPublishing(false);
      return;
    }
    setPublish({ status: result.status ?? "failed", permalink: result.permalink ?? null, error: null });
    if (result.status === "publishing") {
      pollTimeoutRef.current = setTimeout(async () => {
        applyResult(await pollPublishStatus(item.id));
      }, 3000);
    } else {
      setIsPublishing(false);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    setPublish((p) => ({ ...p, error: null }));
    applyResult(await startPublish(item.id));
  }

  const canPublish = Boolean(savedMediaPath && accountId && !file);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-[--radius-card] border border-border bg-surface-0 p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Publicar pieza</h2>
          <button type="button" onClick={onClose} className="text-xs text-ink-400 hover:text-ink-900">
            Cerrar
          </button>
        </div>

        {item.idea && <p className="text-xs text-ink-400">Idea original: {item.idea}</p>}

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Cuenta destino
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={isPublishing}
            className="h-9 rounded-[0.4rem] border border-border bg-surface-1 px-2 text-sm text-ink-900 disabled:opacity-50"
          >
            <option value="">Elegí una cuenta</option>
            {(item.platform ? eligibleAccounts : accounts).map((a) => (
              <option key={a.id} value={a.id}>
                {a.platform} — {a.display_name ?? a.username ?? a.id}
              </option>
            ))}
          </select>
        </label>

        {accounts.length === 0 && (
          <p className="text-xs text-negative">Este negocio no tiene cuentas activas conectadas.</p>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Archivo {selectedAccount?.platform === "tiktok" ? "(video)" : "(imagen o video)"}
          <input
            type="file"
            accept={selectedAccount?.platform === "tiktok" ? "video/*" : "image/*,video/*"}
            onChange={handleFileChange}
            disabled={isPublishing}
            className="text-xs text-ink-600 file:mr-2 file:rounded-[0.4rem] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs disabled:opacity-50"
          />
          {file && <span className="text-[0.7rem] text-ink-400">Nuevo archivo listo para subir: {file.name}</span>}
          {!file && savedMediaPath && <span className="text-[0.7rem] text-ink-400">Ya tiene un archivo adjunto.</span>}
          {fileError && <span className="text-negative">{fileError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Caption (texto que se publica — independiente de la idea de arriba)
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            disabled={isPublishing}
            className="rounded-[0.4rem] border border-border bg-surface-1 px-2 py-1.5 text-sm text-ink-900 disabled:opacity-50"
          />
        </label>

        {saveError && <p className="text-xs text-negative">{saveError}</p>}

        <Button type="button" variant="secondary" size="sm" onClick={handleSave} disabled={isSaving || isPublishing}>
          {isSaving ? "Guardando…" : "Guardar cambios"}
        </Button>

        <div className="border-t border-border pt-3">
          <StatusPanel platform={selectedAccount?.platform} status={publish.status} permalink={publish.permalink} error={publish.error} />

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handlePublish}
            disabled={!canPublish || isPublishing}
            className="mt-2 w-full"
          >
            {isPublishing ? "Publicando…" : "Publicar ahora"}
          </Button>
          {!canPublish && !isPublishing && (
            <p className="mt-1 text-[0.7rem] text-ink-400">Guardá una cuenta y un archivo antes de publicar.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPanel({
  platform,
  status,
  permalink,
  error,
}: {
  platform: Platform | undefined;
  status: string;
  permalink: string | null;
  error: string | null;
}) {
  if (status === "published") {
    return (
      <div className="flex items-center gap-2 text-xs">
        {platform && <PlatformBadge platform={platform} />}
        <span className="font-medium text-positive">Publicado</span>
        {permalink && (
          <a href={permalink} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Ver publicación →
          </a>
        )}
      </div>
    );
  }

  if (status === "draft_sent") {
    return (
      <div className="rounded-[0.5rem] bg-accent-soft p-2 text-xs text-accent-strong">
        Enviado a tu bandeja de TikTok — abrí la app de TikTok para terminar de publicarlo. Todavía no está
        publicado por sí solo.
      </div>
    );
  }

  if (status === "publishing") {
    return <p className="text-xs text-ink-600">Procesando en {platform ?? "la plataforma"}…</p>;
  }

  if (status === "failed") {
    return <p className="text-xs text-negative">No se pudo publicar: {error}</p>;
  }

  return <p className="text-xs text-ink-400">Todavía no se publicó.</p>;
}
