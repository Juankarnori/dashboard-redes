"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { CALENDAR_MEDIA_BUCKET } from "@/lib/supabase/storage";
import { createFanOutPost, startPublish, pollPublishStatus, getPostGroupItems } from "./actions";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types/db";
import type { AccountOption } from "./CalendarItemPublishPanel";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_TIKTOK_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_CAROUSEL_ITEMS = 10; // el más estricto de las 3 redes (Instagram) — límite único para no complicar la UI

interface GroupItemState {
  id: string;
  platform: Platform;
  accountLabel: string;
  status: string;
  permalink: string | null;
  error: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "En cola…",
  publishing: "Publicando…",
  published: "Publicado",
  draft_sent: "En bandeja de TikTok",
  failed: "Falló",
};

export function MultiPublishForm({
  brandId,
  accounts,
  campaigns,
}: {
  brandId: string;
  accounts: AccountOption[];
  campaigns: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [groupItems, setGroupItems] = useState<GroupItemState[] | null>(null);

  const accountsByPlatform = new Map<Platform, AccountOption[]>();
  for (const a of accounts) {
    accountsByPlatform.set(a.platform, [...(accountsByPlatform.get(a.platform) ?? []), a]);
  }

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFileError(null);
    if (list.length === 0) {
      setFiles([]);
      return;
    }

    const videos = list.filter((f) => f.type.startsWith("video/"));
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (videos.length + images.length !== list.length) {
      setFileError("Formato no reconocido — usá imágenes o un video.");
      return;
    }
    if (videos.length > 0 && (videos.length > 1 || images.length > 0)) {
      setFileError("Un video va solo — elegí un único video, o varias imágenes para carrusel.");
      return;
    }
    if (images.length > MAX_CAROUSEL_ITEMS) {
      setFileError(`Máximo ${MAX_CAROUSEL_ITEMS} imágenes por carrusel.`);
      return;
    }

    const selectedPlatforms = accounts.filter((a) => selectedAccountIds.has(a.id)).map((a) => a.platform);
    const includesTikTok = selectedPlatforms.includes("tiktok");

    if (videos.length === 1) {
      const limit = includesTikTok ? MAX_TIKTOK_VIDEO_BYTES : MAX_VIDEO_BYTES;
      if (videos[0].size > limit) {
        setFileError(`El video pesa demasiado (máx. ${Math.round(limit / 1024 / 1024)}MB${includesTikTok ? " — hay una cuenta de TikTok seleccionada" : ""}).`);
        return;
      }
    }
    for (const img of images) {
      if (img.size > MAX_IMAGE_BYTES) {
        setFileError(`"${img.name}" pesa demasiado (máx. ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`);
        return;
      }
    }

    setFiles(list);
  }

  function updateItem(id: string, patch: Partial<GroupItemState>) {
    setGroupItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, ...patch } : it)) : prev));
  }

  async function runPublish(itemId: string) {
    updateItem(itemId, { status: "publishing" });
    let result = await startPublish(itemId);
    // Mismo patrón de poll corto que el panel de un solo item — necesario
    // para el container async de video de Instagram.
    while (!result.error && result.status === "publishing") {
      await new Promise((r) => setTimeout(r, 3000));
      result = await pollPublishStatus(itemId);
    }
    if (result.error) {
      updateItem(itemId, { status: "failed", error: result.error });
    } else {
      updateItem(itemId, { status: result.status ?? "failed", permalink: result.permalink ?? null });
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    if (files.length === 0) return setSubmitError("Adjuntá un video o al menos una imagen.");
    if (selectedAccountIds.size === 0) return setSubmitError("Elegí al menos una cuenta destino.");
    if (!scheduledFor) return setSubmitError("Elegí una fecha.");
    if (!caption.trim()) return setSubmitError("Escribí el texto que se va a publicar.");

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const isVideo = files[0].type.startsWith("video/");
      const groupPrefix = `${brandId}/fanout-${Date.now()}`;
      const mediaPaths: string[] = [];

      for (const [i, file] of files.entries()) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${groupPrefix}/${i}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(CALENDAR_MEDIA_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          setSubmitError(`No se pudo subir "${file.name}": ${uploadError.message}`);
          return;
        }
        mediaPaths.push(path);
      }

      const result = await createFanOutPost({
        brandId,
        idea,
        caption,
        scheduledFor,
        campaignId: campaignId || null,
        accountIds: Array.from(selectedAccountIds),
        mediaPaths,
        mediaType: isVideo ? "video" : "image",
      });

      if (result.error || !result.postGroupId) {
        setSubmitError(result.error ?? "No se pudo crear el post.");
        return;
      }

      const items = await getPostGroupItems(result.postGroupId);
      const initial: GroupItemState[] = items.map((it) => ({
        id: it.id,
        platform: it.platform,
        accountLabel: it.accountLabel,
        status: "planned",
        permalink: null,
        error: null,
      }));
      setGroupItems(initial);

      // Fallo por-fila, no por-grupo: cada cuenta corre su propio
      // startPublish/poll en paralelo, sin esperarse entre sí.
      initial.forEach((it) => void runPublish(it.id));
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setOpen(false);
    setIdea("");
    setCaption("");
    setScheduledFor("");
    setCampaignId("");
    setSelectedAccountIds(new Set());
    setFiles([]);
    setFileError(null);
    setSubmitError(null);
    setGroupItems(null);
  }

  return (
    <>
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
        Publicar a varias redes
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={reset}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-[--radius-card] border border-border bg-surface-0 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">Publicar a varias redes</h2>
              <button type="button" onClick={reset} className="text-xs text-ink-400 hover:text-ink-900">
                Cerrar
              </button>
            </div>

            {groupItems ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-ink-600">
                  Publicando a {groupItems.length} cuenta{groupItems.length === 1 ? "" : "s"} — cada una
                  sigue su propio proceso; si una falla, las demás no se ven afectadas.
                </p>
                {groupItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded-[0.5rem] border border-border bg-surface-1 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={it.platform} />
                      <span className="text-xs text-ink-600">{it.accountLabel}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          it.status === "published" && "text-positive",
                          it.status === "failed" && "text-negative",
                          (it.status === "publishing" || it.status === "planned") && "text-ink-600",
                          it.status === "draft_sent" && "text-accent-strong"
                        )}
                      >
                        {STATUS_LABELS[it.status] ?? it.status}
                      </span>
                      {it.permalink && (
                        <a
                          href={it.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[0.7rem] text-accent hover:underline"
                        >
                          Ver →
                        </a>
                      )}
                      {it.error && <p className="max-w-[16rem] text-[0.7rem] text-negative">{it.error}</p>}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={reset} className="mt-2">
                  Listo
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Idea / nota interna (opcional)"
                  rows={2}
                  className="rounded-[0.4rem] border border-border bg-surface-1 px-2 py-1.5 text-sm text-ink-900"
                />
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Texto que se va a publicar (mismo caption para todas las redes elegidas)"
                  required
                  rows={3}
                  className="rounded-[0.4rem] border border-border bg-surface-1 px-2 py-1.5 text-sm text-ink-900"
                />

                <div className="flex gap-2">
                  <input
                    type="date"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    required
                    aria-label="Fecha"
                    className="h-9 flex-1 rounded-[0.4rem] border border-border bg-surface-1 px-2 text-sm text-ink-900"
                  />
                  {campaigns.length > 0 && (
                    <select
                      value={campaignId}
                      onChange={(e) => setCampaignId(e.target.value)}
                      aria-label="Campaña"
                      className="h-9 rounded-[0.4rem] border border-border bg-surface-1 px-2 text-sm text-ink-900"
                    >
                      <option value="">Sin campaña</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
                  Archivo — un video, o varias imágenes para carrusel (máx. {MAX_CAROUSEL_ITEMS})
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileChange}
                    className="text-xs text-ink-600 file:mr-2 file:rounded-[0.4rem] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
                  />
                  {files.length > 0 && (
                    <span className="text-[0.7rem] text-ink-400">
                      {files.length === 1 ? files[0].name : `${files.length} imágenes listas para el carrusel`}
                    </span>
                  )}
                  {fileError && <span className="text-negative">{fileError}</span>}
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-ink-600">Cuentas destino</span>
                  {accounts.length === 0 ? (
                    <p className="text-xs text-negative">Este negocio no tiene cuentas activas conectadas.</p>
                  ) : (
                    Array.from(accountsByPlatform.entries()).map(([platform, group]) => (
                      <div key={platform} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <PlatformBadge platform={platform} />
                        </div>
                        <div className="flex flex-wrap gap-2 pl-1">
                          {group.map((a) => (
                            <label
                              key={a.id}
                              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-1 text-xs text-ink-600"
                            >
                              <input
                                type="checkbox"
                                checked={selectedAccountIds.has(a.id)}
                                onChange={() => toggleAccount(a.id)}
                                className="h-3.5 w-3.5 accent-accent"
                              />
                              {a.display_name ?? a.username ?? a.id}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {submitError && <p className="text-xs text-negative">{submitError}</p>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={reset}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? "Subiendo…" : "Publicar a todas"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
