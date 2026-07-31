import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Social Pulse",
  description: "Política de privacidad de Social Pulse.",
};

export default function PrivacyPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Política de Privacidad</h1>
        <p className="mt-1 text-xs text-ink-400">Última actualización: 31 de julio de 2026</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Resumen</h2>
        <p>
          Social Pulse es una herramienta interna para gestionar las redes sociales de Copiadora
          El Estudiante Jr y Farmasi. Esta política explica qué datos procesa la app, de dónde
          vienen y cómo se protegen.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Qué datos recolectamos</h2>
        <ul className="flex flex-col gap-2 pl-4">
          <li className="list-disc">
            <span className="font-medium text-ink-900">Tokens de acceso</span> de las cuentas de
            Instagram, Facebook y (próximamente) TikTok conectadas, emitidos por cada plataforma
            tras la autorización explícita del administrador de esas cuentas. Se guardan
            cifrados (AES-256-GCM), nunca en texto plano.
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Contenido publicado</span>: posts, reels e
            historias de las cuentas conectadas (imagen/miniatura, texto, fecha, enlace).
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Métricas de ese contenido</span>: alcance,
            impresiones/vistas, likes, comentarios, compartidos, guardados y métricas
            específicas por tipo de publicación.
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Comentarios individuales</span>: texto del
            comentario, nombre público del autor y fecha, de las publicaciones de las cuentas
            conectadas — incluye comentarios de terceros que interactúan públicamente con esas
            cuentas, no solo de los dueños del negocio.
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Datos de audiencia agregados</span>:
            cantidad de seguidores y demografía general (edad/género agregados), tal como los
            expone cada plataforma — no datos de perfil individuales de los seguidores.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">De dónde vienen estos datos</h2>
        <p>
          Todo se obtiene exclusivamente a través de las APIs oficiales de cada plataforma (Meta
          Graph API para Instagram/Facebook, TikTok for Developers API cuando se conecte), nunca
          por scraping ni por terceros no autorizados.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Para qué se usan</h2>
        <ul className="flex flex-col gap-2 pl-4">
          <li className="list-disc">Mostrar comparativas y evolución de métricas en el panel interno.</li>
          <li className="list-disc">
            Generar recomendaciones e ideas de contenido (usando la API de Claude/Anthropic como
            proveedor de generación de texto, alimentada con las métricas ya descritas).
          </li>
          <li className="list-disc">
            Permitir ver y responder comentarios directamente desde la app, publicando la
            respuesta de vuelta en Instagram/Facebook a través de sus APIs.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Con quién se comparte</h2>
        <p>
          No vendemos ni compartimos estos datos con terceros para publicidad ni con fines
          distintos a operar esta herramienta. Los datos pasan por estos proveedores, necesarios
          para el funcionamiento de la app:
        </p>
        <ul className="flex flex-col gap-2 pl-4">
          <li className="list-disc">
            <span className="font-medium text-ink-900">Supabase</span> — base de datos y
            autenticación.
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Anthropic (Claude)</span> — generación de
            ideas de contenido a partir de las métricas.
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Vercel</span> — hosting de la aplicación.
          </li>
          <li className="list-disc">
            <span className="font-medium text-ink-900">Meta / TikTok</span> — como origen de los
            datos, bajo sus propias políticas de privacidad.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Seguridad</h2>
        <p>
          Los tokens de acceso se cifran antes de guardarse. El acceso al panel requiere
          autenticación y está limitado a las personas autorizadas por los dueños de Copiadora
          El Estudiante Jr y Farmasi.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Retención y baja</h2>
        <p>
          Los datos de una cuenta se sincronizan mientras esa cuenta siga conectada. Desconectar
          una cuenta desde el panel detiene la sincronización; los datos históricos ya guardados
          pueden eliminarse a pedido (ver contacto abajo).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">
          Si sos una persona que comentó en una publicación de estas cuentas
        </h2>
        <p>
          Si comentaste públicamente en una publicación de Copiadora El Estudiante Jr o Farmasi
          en Instagram o Facebook, ese comentario (texto y nombre público) puede quedar guardado
          en esta herramienta como parte de la gestión interna de esas cuentas. Para pedir que se
          elimine, escribí al contacto de abajo.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Cambios a esta política</h2>
        <p>
          Puede actualizarse a medida que se agreguen plataformas o funcionalidad. La fecha
          arriba refleja la versión vigente.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-900">Contacto</h2>
        <p>
          Preguntas o pedidos sobre tus datos:{" "}
          <a href="mailto:copiadoraelestudiantejr@gmail.com" className="text-accent hover:underline">
            copiadoraelestudiantejr@gmail.com
          </a>
        </p>
      </section>
    </>
  );
}
