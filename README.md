# Priority Tags · Vital diario

Practica hasta 50 tarjetas distintas al día con el tag `vital`, mezcladas entre todos tus libros. Son las tarjetas originales de RemNote: el plugin selecciona sus IDs y abre el componente nativo de práctica. No copia preguntas ni respuestas y conserva el historial y la repetición espaciada de RemNote.

## Uso

Abre **Practicar Vital · 50** en la barra lateral de RemNote. También puedes buscar **Practicar Vital · Hoy** en la paleta de comandos. No necesitas elegir libros ni preparar una sesión cada día. La pantalla de inicio de Flashcards mantiene el contador de la cola general de RemNote; no representa el cupo de esta extensión.

La selección y los lugares consumidos se guardan en el almacenamiento sincronizado de RemNote. Después de sincronizar ambos dispositivos, puedes empezar en la computadora y continuar en el celular sin recibir otras 50 tarjetas. Las repeticiones reales cuentan; mostrar una respuesta no consume un lugar. Si olvidas una tarjeta, puede volver a aparecer sin gastar otro lugar.

La práctica da prioridad a los repasos vencidos y completa el espacio restante con tarjetas nuevas. Reparte la selección por turnos entre los documentos de origen. Excluye tarjetas deshabilitadas y repasos futuros. Los libros nuevos y las tarjetas recién etiquetadas entran en el conjunto disponible automáticamente. Si hay más de 50 repasos pendientes, el excedente sigue pendiente: el plugin no cambia sus fechas ni lo marca como estudiado.

## Etiquetado automático

El plugin reconoce los prefijos `[VITAL]`, `[IMPORTANT]` y `[DETAIL]` al inicio de una tarjeta y aplica `vital`, `important` o `detail`. Conserva los demás tags. Los prefijos tienen precedencia sobre los tags de prioridad contradictorios; las tarjetas sin esos prefijos no se modifican.

Revisa tarjetas existentes al arrancar, responde a cambios del editor y comprueba las importaciones cada cinco minutos. La revisión retroactiva no requiere ejecutar un comando manual. El comando **Priority Tags: tag all existing cards** permanece disponible para diagnóstico.

## Computadora y móvil

La versión 1.1.0 permite la carga en móvil. El popup usa el ancho del teléfono, controles táctiles de al menos 44 px y una zona desplazable para preguntas y respuestas largas. En escritorio conserva el popup de 1000 × 720. La selección compartida se comprueba con una simulación de dos dispositivos y las dimensiones con casos de teléfono y tablet; no se ha realizado una prueba en un teléfono físico.

Para distribuir el plugin, se entrega el ZIP a RemNote como extensión no listada. La instalación por enlace oficial requiere su aprobación. El enlace previsto es https://www.remnote.com/plugins/proteus-priority-tags; no debe tratarse como una instalación disponible hasta que RemNote la apruebe. Una instalación de desarrollo desde `localhost` solo funciona en la computadora que sirve el código y no habilita el celular.

Los dos dispositivos deben terminar de sincronizar antes de cambiar entre ellos. El almacenamiento de RemNote no ofrece un bloqueo atómico entre dispositivos: practicar simultáneamente antes de sincronizar puede superar el cupo compartido. La fecha se calcula con el calendario local del dispositivo; ambos deben usar la misma zona horaria para compartir el mismo día.

RemNote no ejecuta plugins sin conexión. Sus tarjetas nativas sí pueden repasarse offline, pero esta extensión no puede preparar o abrir su selección personalizada sin Internet. No crea un mazo alternativo ni un documento de estudio adicional.

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

La compilación genera los bundles de `index` y `vital_daily_popup`, en formatos sandbox y nativo. Añade una huella del contenido a las URLs para evitar cargar una versión anterior desde la caché. El empaquetador usa una lista cerrada de nueve archivos y rechaza un manifest sin el repositorio de código público.

Las pruebas cubren cupo diario, mezcla de libros, cambio de día, reapertura, libros nuevos, tags retirados, tarjetas deshabilitadas, reintentos, migración del estado local, continuidad entre dispositivos y errores de sincronización. No califican tarjetas reales ni cambian su historial.

## Documentación de RemNote

- [Almacenamiento sincronizado](https://plugins.remnote.com/advanced/storage)
- [Extensiones no listadas](https://plugins.remnote.com/advanced/unlisted_plugins)
- [Entrega y revisión de extensiones](https://plugins.remnote.com/advanced/submitting_plugins)
- [Limitaciones offline](https://help.remnote.com/en/articles/6752029-offline-mode)

El proyecto conserva la licencia MIT de la plantilla original de RemNote.
