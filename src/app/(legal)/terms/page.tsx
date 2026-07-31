import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos de Servicio — Social Pulse",
  description: "Términos de servicio de Social Pulse.",
};

export default function TermsPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Términos de Servicio</h1>
        <p className="mt-1 text-xs text-ink-400">Última actualización: 31 de julio de 2026</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Qué es esta aplicación</h2>
        <p>
          Social Pulse es una herramienta de uso interno para gestionar y analizar las redes
          sociales de Copiadora El Estudiante Jr y Farmasi (Juan Noriega). No es un producto
          público: no ofrece registro abierto ni cuentas para terceros. El acceso está
          restringido a las personas autorizadas por los dueños de estos dos negocios.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Qué hace la aplicación</h2>
        <p>
          Social Pulse se conecta a las cuentas oficiales de Instagram, Facebook (y próximamente
          TikTok) de estos negocios a través de las APIs oficiales de cada plataforma (Meta
          Graph API, TikTok for Developers), con autorización explícita de los administradores
          de esas cuentas. Con esa conexión, la app sincroniza contenido publicado y sus
          métricas, muestra comparativas y recomendaciones de contenido, y permite ver y
          responder comentarios directamente desde el panel.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Uso previsto</h2>
        <p>
          El uso de esta app está limitado a la gestión de las cuentas de redes sociales de
          Copiadora El Estudiante Jr y Farmasi. No está pensada para conectar cuentas de
          terceros ajenos a estos negocios, ni para ningún uso fuera de ese alcance.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Cumplimiento con las plataformas conectadas</h2>
        <p>
          El uso de las APIs de Meta y TikTok a través de esta app está sujeto además a las
          políticas de desarrollador y condiciones de uso de cada plataforma. Cualquier
          limitación impuesta por Meta o TikTok sobre el acceso a datos aplica igualmente al
          uso de esta herramienta.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Cambios a estos términos</h2>
        <p>
          Estos términos pueden actualizarse a medida que la app agregue funcionalidad o se
          conecten nuevas plataformas. La fecha de &quot;última actualización&quot; arriba
          refleja la versión vigente.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Contacto</h2>
        <p>
          Preguntas sobre estos términos:{" "}
          <a href="mailto:copiadoraelestudiantejr@gmail.com" className="text-accent hover:underline">
            copiadoraelestudiantejr@gmail.com
          </a>
        </p>
      </section>
    </>
  );
}
