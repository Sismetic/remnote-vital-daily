# Priority Tags · Prácticas diarias

Practica por separado hasta 35 tarjetas `vital` y hasta 35 tarjetas `important` cada día, mezcladas entre todos tus libros. El plugin selecciona las tarjetas originales de RemNote y abre su componente nativo de práctica. No copia preguntas ni respuestas; conserva el historial y la repetición espaciada de RemNote.

## Uso

La barra lateral muestra **Práctica Diaria de Vital** y **Práctica Diaria de Importante**. Los mismos nombres aparecen en la paleta de comandos. Cada práctica tiene su propia selección, progreso sincronizado y cupo diario de 35 tarjetas distintas. Completar una no reduce el cupo de la otra.

Ambas prácticas dan prioridad a los repasos vencidos y completan el espacio restante con tarjetas nuevas. Reparten la selección por turnos entre los documentos de origen, excluyen tarjetas deshabilitadas y no adelantan repasos futuros. Si una tarjeta vuelve a aparecer porque la olvidaste, no consume un segundo lugar.

La selección y los lugares consumidos se guardan en el almacenamiento sincronizado de RemNote. Después de sincronizar ambos dispositivos, puedes empezar en la computadora y continuar en el celular sin recibir un lote nuevo. Mostrar una respuesta no consume un lugar; solamente cuenta una repetición registrada por RemNote.

Los libros nuevos y las tarjetas recién etiquetadas entran automáticamente. Si hay más de 35 repasos pendientes en una prioridad, el excedente conserva su fecha y continúa pendiente en RemNote. La pantalla general de Flashcards mantiene su propio contador y no representa los cupos de esta extensión.

## Etiquetado automático

El plugin reconoce los prefijos `[VITAL]`, `[IMPORTANT]` y `[DETAIL]` al inicio de una tarjeta y aplica `vital`, `important` o `detail`. Conserva los demás tags. Los prefijos tienen precedencia sobre tags de prioridad contradictorios; las tarjetas sin esos prefijos no se modifican.

Revisa las tarjetas existentes al arrancar, responde a cambios del editor y comprueba las importaciones cada cinco minutos. El comando **Priority Tags: tag all existing cards** permanece disponible para diagnóstico.

## Computadora y móvil

La versión 1.2.2 ofrece las dos prácticas en computadora y móvil. En el teléfono, abre la pestaña **Flashcards** para ver los botones **Practicar VITAL** y **Practicar IMPORTANTE**. Cada popup usa el ancho del teléfono, controles táctiles de al menos 44 px y una zona desplazable para preguntas y respuestas largas. En escritorio conserva un tamaño de 1000 × 720.

En móvil, el plugin sólo lee los tags existentes y abre las colas de práctica. No ejecuta el etiquetado automático, no crea tags y no modifica las tarjetas. En computadora conserva el etiquetado automático ya existente.

Para distribuir el plugin, se entrega el ZIP a RemNote como extensión no listada. La instalación por enlace oficial requiere su aprobación. El enlace previsto es https://www.remnote.com/plugins/proteus-priority-tags; no debe tratarse como una instalación disponible hasta que RemNote la apruebe. Una instalación de desarrollo desde `localhost` solo funciona en la computadora que sirve el código y no habilita el celular.

Los dos dispositivos deben terminar de sincronizar antes de cambiar entre ellos. El almacenamiento de RemNote no ofrece un bloqueo atómico: practicar simultáneamente en dos dispositivos antes de sincronizar puede superar el cupo compartido. Ambos dispositivos deben usar la misma zona horaria para compartir el mismo día.

RemNote no ejecuta plugins sin conexión. Sus tarjetas nativas sí pueden repasarse offline, pero esta extensión no puede preparar o abrir sus selecciones personalizadas sin Internet. No crea mazos alternativos ni documentos de estudio adicionales.

## Privacidad y permisos

El código no llama a servicios externos, modelos de IA ni APIs de pago. Lee las tarjetas y su historial dentro de RemNote, ajusta los tags de prioridad y guarda IDs de selección y progreso mediante la sincronización normal de la cuenta. No solicita permiso para borrar Rems. El repositorio público y el ZIP contienen solo código, documentación y pruebas con datos ficticios: ningún libro, tarjeta, respuesta ni exportación personal.

## Compilación

Requiere Node.js 18 o superior y `zip`. Las versiones de SDK, React, TypeScript y esbuild están fijadas; `package-lock.json` fija las dependencias transitivas.

```sh
npm ci --ignore-scripts
npm run check-types
npm test
npm run package
```

La compilación genera los bundles de `index`, `vital_daily_popup` e `important_daily_popup`, en formatos sandbox y nativo. Añade una huella del contenido a las URLs para evitar cargar una versión anterior desde la caché. El empaquetador usa una lista cerrada de once archivos y rechaza un manifest sin el repositorio de código público.

Las pruebas cubren los cupos independientes de VITAL e IMPORTANT, mezcla de libros, cambio de día, reapertura, libros nuevos, tags retirados, tarjetas deshabilitadas, reintentos, migración del estado VITAL existente, continuidad entre dispositivos y errores de sincronización. No califican tarjetas reales ni cambian su historial.

## Documentación de RemNote

- [Almacenamiento sincronizado](https://plugins.remnote.com/advanced/storage)
- [Extensiones no listadas](https://plugins.remnote.com/advanced/unlisted_plugins)
- [Entrega y revisión de extensiones](https://plugins.remnote.com/advanced/submitting_plugins)
- [Limitaciones offline](https://help.remnote.com/en/articles/6752029-offline-mode)

El proyecto conserva la licencia MIT de la plantilla original de RemNote.
