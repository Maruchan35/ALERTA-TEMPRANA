# Panel web de administración: guía para conectarlo

Para quien hace el **panel web** (validadores, Protección Civil, CCE). El backend ya está desplegado en Supabase:
no hace falta crear tablas ni correr migraciones. Solo hay que **conectarse**.

> El repositorio es público: **nunca** subas a git la URL con llaves, contraseñas ni la `service_role`/`secret` key.
> La web solo usa la **publishable key** (es pública por diseño; las reglas RLS del servidor deciden qué se puede hacer).

## 1. Traer la versión más reciente

```bash
git clone https://github.com/Maruchan35/ALERTA-TEMPRANA.git   # la primera vez
cd ALERTA-TEMPRANA
git pull                                                        # cada vez que el equipo suba cambios
```

Para trabajar sin pisar a nadie: `git checkout -b panel-web`, haz tus cambios, `git push -u origin panel-web` y abre un
*Pull Request*. GitHub Actions corre todas las pruebas antes de unirlo a `main`.

## 2. Los dos datos de conexión

En [supabase.com](https://supabase.com/dashboard) → proyecto **ALERTA-TEMPRANA** → **Project Settings → API Keys**:

- **Project URL**: `https://<REF>.supabase.co`
- **Publishable key**: empieza con `sb_publishable_…`

## 3. Cuenta para entrar

Solo entran cuentas con rol `validador`, `institucion` o `admin`:

1. **Authentication → Users → Add user → Create new user**: correo, contraseña y **Auto Confirm User** marcado (si no,
   la cuenta no puede entrar hasta confirmar su correo).
2. **SQL Editor**:

   ```sql
   update perfiles set rol = 'admin', nombre = 'Tu nombre', institucion = 'Protección Civil (demo)'
   where id = (select id from auth.users where email = 'correo@ejemplo.com');
   ```

   Roles: `validador` (verifica, descarta, resuelve, ajusta radio), `institucion` (además, sus alertas salen
   VERIFICADAS al emitirlas) y `admin` (igual que institución). Plantilla:
   [`supabase/demo/cuentas_validadores.sql`](../supabase/demo/cuentas_validadores.sql).

## 4A. Usar el panel que ya está hecho (Flutter Web)

[`panel/`](../panel) ya tiene métricas, mapa, cola *Por validar / Activas / Cerradas*, detalle con bitácora y las
acciones **Verificar, Ajustar radio, Resolver, Descartar** y **Emitir alerta oficial**. Requiere Flutter 3.47+.

```bash
cd panel
cp config.ejemplo.json config.json      # pon ahí SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (config.json no se sube a git)
flutter pub get
flutter run -d chrome --dart-define-from-file=config.json
```

Para publicarlo en internet: `flutter build web --release --dart-define-from-file=config.json` y sube la carpeta
`panel/build/web` a cualquier hosting estático. Con el proyecto de Firebase del equipo (`alerta-cerca-18e22`):

```bash
npm install -g firebase-tools   # una sola vez
firebase login
firebase init hosting        # carpeta pública: panel/build/web · single-page app: sí · GitHub: no
firebase deploy --only hosting
```

Queda en `https://alerta-cerca-18e22.web.app`. El panel también sirve en el celular desde el navegador.

## 4B. Hacer tu propio panel (HTML/JS, React, Vue…)

Todo pasa por la librería oficial `@supabase/supabase-js` v2. El panel **nunca** escribe directo en las tablas: lee
vistas y llama funciones del servidor, que validan el rol y dejan registro en la bitácora.

```html
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const supabase = createClient('https://<REF>.supabase.co', 'sb_publishable_...');

  // 1. Entrar y comprobar el rol
  const { data: sesion, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: perfil } = await supabase.from('perfiles')
    .select('rol, nombre, institucion').eq('id', sesion.user.id).single();
  if (!['validador', 'institucion', 'admin'].includes(perfil?.rol)) {
    await supabase.auth.signOut();
    throw new Error('Esta cuenta no tiene permisos de validador');
  }

  // 2. Leer: alertas (todas, con datos solo para validadores), métricas y bitácora
  const { data: alertas } = await supabase.from('alertas_panel')
    .select('*').order('creada_en', { ascending: false }).limit(300);
  const { data: metricas } = await supabase.from('metricas').select('*').single();
  const { data: historial } = await supabase.from('bitacora')
    .select('*').eq('alerta_id', alertaId).order('creada_en');

  // 3. Actuar (verificar · descartar · resolver · ajustar_radio)
  await supabase.rpc('validar_alerta', { p_alerta: alertaId, p_accion: 'verificar' });
  await supabase.rpc('validar_alerta', { p_alerta: alertaId, p_accion: 'descartar', p_motivo: 'No se pudo confirmar' });
  await supabase.rpc('validar_alerta', { p_alerta: alertaId, p_accion: 'resolver', p_motivo: 'Menor localizado' });
  await supabase.rpc('validar_alerta', { p_alerta: alertaId, p_accion: 'ajustar_radio', p_radio_m: 5000 });

  // 4. Emitir una alerta oficial (con rol institucion/admin sale VERIFICADA)
  await supabase.rpc('crear_reporte', {
    p_categoria: 'incendio', p_titulo: 'Incendio en bodega', p_descripcion: 'Eviten la zona',
    p_referencia: 'Frente al mercado', p_lat: 17.9581, p_lon: -102.1942,
  });

  // 5. Tiempo real: recargar cuando cambie cualquier alerta (respeta RLS)
  supabase.channel('panel').on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' },
    () => recargar()).subscribe();

  // 6. Foto (bucket privado): URL firmada por 10 minutos. NUNCA getPublicUrl: el bucket es privado
  //    y esa URL siempre falla. Para varias a la vez: createSignedUrls([rutas], 600).
  if (alerta.foto_path) {
    const { data: foto, error: e } = await supabase.storage.from('fotos').createSignedUrl(alerta.foto_path, 600);
    if (e) console.error('Foto:', e.message);   // casi siempre: la cuenta no tiene rol de validador
    else document.querySelector('#foto').src = foto.signedUrl;
  }
</script>
```

### Fotos

El bucket se llama **`fotos`** (no `alertas`, `evidencias` ni otro) y es **privado a propósito**: guarda fotos de menores
y de personas desaparecidas que solo deben verse mientras la alerta está activa y confirmada, y dejar de verse al
resolverse. **No lo hagan público**: cualquiera con el enlace vería todas las fotos para siempre, incluidas las de
reportes falsos o descartados.

`foto_path` ya trae la ruta dentro del bucket (`<id del usuario>/<milisegundos>.jpg`; la app sube la foto con
`storage.from('fotos').upload` antes de crear el reporte). Para mostrarla hay que **iniciar sesión con una cuenta de
validador, institución o administrador** y pedir una URL firmada:

```js
// Reemplazo directo de resolvePhotoUrl para ALERTA CERCA
const cacheFotos = new Map(); // foto_path → { url, vence }

export async function resolvePhotoUrl(supabase, fotoPath) {
  if (!fotoPath) return null;
  if (/^https?:\/\//.test(fotoPath)) return fotoPath;              // ya es una URL
  const ruta = fotoPath.replace(/^\/?(fotos\/)?/, '');               // por si viene con el bucket adelante
  const guardada = cacheFotos.get(ruta);
  if (guardada && guardada.vence > Date.now()) return guardada.url;
  const { data, error } = await supabase.storage.from('fotos').createSignedUrl(ruta, 3600);
  if (error) {
    console.error('Foto', ruta, error.message); // "Object not found" = la cuenta no es validadora o la ruta no existe
    return null;
  }
  cacheFotos.set(ruta, { url: data.signedUrl, vence: Date.now() + 3500 * 1000 });
  return data.signedUrl;
}
```

Cada URL dura 1 hora (aquí se guarda en memoria para no pedirla de nuevo). Para una lista, `createSignedUrls(rutas,
3600)` las pide todas de una vez. Un validador, institución o administrador ve todas; otras cuentas, solo las de
alertas confirmadas. Si no aparecen:

| Síntoma | Causa |
|---|---|
| `getPublicUrl` (o armar `.../object/public/...`) da 400/404 | El bucket es privado: usa `createSignedUrl`. |
| `createSignedUrl` responde 400 sin haber iniciado sesión | Las fotos solo se firman para cuentas con sesión: entra primero con `signInWithPassword`. |
| `createSignedUrl` responde *Object not found* | La cuenta no tiene rol de validador/institución/admin (paso 3), o la ruta no es la de `foto_path`. |
| La URL firmada abre en el navegador pero la página no la muestra | Pasaron más de 10 minutos: pide otra. |

En el panel incluido (Flutter Web) la foto se carga igual y, si algo falla, ahora muestra el motivo en vez de un hueco
en blanco; un clic la abre en grande.

### Qué trae cada fuente

| Fuente | Campos principales |
|---|---|
| Vista `alertas_panel` | `id, categoria, nombre, nombre_corto, nivel (1–4), estado, titulo, descripcion, referencia, foto_path, folio_911, consentimiento, lat, lon, radio_actual_m, radio_manual_m, creada_en, publicada_en, verificada_en, cerrada_en, expira_en, motivo_cierre, autor_reputacion, autor_rol, autor_institucion, validador_nombre, validador_institucion, n_confirmo, n_ya_no_esta, n_parece_falsa, n_entregas, n_telegram` |
| Vista `metricas` | `activas, por_validar, segundos_validacion` (promedio de 7 días), `entregas_hoy`, `dispositivos_activos` (teléfonos registrados para recibir push; solo validadores) |
| Tabla `bitacora` | `accion` (`reportar, emitir_oficial, verificar, descartar, resolver, ajustar_radio, corroborar_auto, publicar_auto, publicar_colmena, revision_por_votos, expirar`), `usuario_id` (null = automática), `detalle` (JSON), `creada_en` |
| Tabla `categorias` | `clave, nombre, nombre_corto, nivel, requiere_validacion, solo_institucion, vigencia, instrucciones` |
| Tabla `escalones_radio` | `categoria, minuto, radio_m`: cómo crece el radio de cada categoría |
| Vista `emergencias_panel` (SOS) | `id, estado` (`activa`, `en_seguimiento`, `cerrada`), `tipo` (`sos, asalto, secuestro, me_siguen, otra`), `origen` (`boton, movimiento, atajo`), `lat, lon, precision_m, velocidad_ms, bateria, ultima_senal_en, sin_senal_avisada_en, creada_en, atendida_en, policia_avisada_en, folio_911, nota, cerrada_en, cierre` (`a_salvo, localizada, falsa_alarma`), `cerrada_por_la_persona, telefono` (solo validadores), `atendida_por_nombre, atendida_por_institucion, n_puntos, n_evidencias` |
| Tabla `emergencia_puntos` | `id, emergencia_id, lat, lon, precision_m, velocidad_ms, registrada_en`: el recorrido (un punto cada ~5 s) |
| Tabla `emergencia_evidencias` | `emergencia_id, tipo, ruta` (bucket privado `evidencias`: URL firmada), `duracion_s, creada_en` |

### Estados y colores sugeridos

| `estado` | Significado | Color |
|---|---|---|
| `pendiente` | En revisión (personas, o autor con reputación baja) | morado |
| `no_confirmada` | Reporte ciudadano, máximo 1 km | ámbar |
| `corroborada` | 3+ vecinos la confirmaron (3 km; con 6+, 10 km) | azul |
| `verificada` | Validada por una institución: todos los escalones | verde |
| `resuelta` · `descartada` · `expirada` | Cerrada | gris |

**Emergencias SOS** ([011](../supabase/migrations/011_emergencias.sql)): una persona en peligro pidió ayuda desde la
app. Leer `emergencias_panel` (abiertas primero), escuchar Realtime en `emergencias`, `emergencia_puntos` (filtro
`emergencia_id=eq.<id>` para dibujar el recorrido en vivo) y `emergencia_evidencias`; actuar SOLO con
`rpc('atender_emergencia', { p_emergencia, p_accion: 'tomar' | 'policia' | 'nota' | 'localizada' | 'falsa_alarma', p_nota, p_folio })`.
Colores: rojo `activa` (nadie la ha tomado), naranja `en_seguimiento`, morado si `ultima_senal_en` tiene más de 2 min
(el teléfono no responde), gris `cerrada`. Ya está hecho en el portal React (`web/src/services/emergencyService.ts`,
`hooks/useEmergencies.ts`, `components/admin/EmergencyPanel.tsx`) y en el panel Flutter (pestaña *SOS*).

**Colmena**: el panel ya no es un cuello de botella. Un reporte `pendiente` que nunca se publicó sale solo como
`no_confirmada` si nadie lo revisa en 5 minutos, o al instante si otra persona reporta lo mismo cerca. El validador
puede verificarlo, descartarlo o resolverlo antes o después. Umbrales en la tabla `config` (solo SQL Editor).

## Problemas frecuentes

| Mensaje | Solución |
|---|---|
| `Email logins are disabled` | El proveedor Email está apagado. Ya quedó encendido (`supabase/config.toml` → `[auth.email] enable_signup = true`). |
| `Email not confirmed` | Authentication → Users → la cuenta → *Confirm email*, o el `update` de `cuentas_validadores.sql`. |
| `Invalid login credentials` | Correo o contraseña incorrectos. |
| Entra pero no ve nada / “no tiene permisos de validador” | Falta el `update perfiles set rol = ...` del paso 3. |
| `permission denied for function …` | Esa función es interna del servidor (no la llama la web). Usa solo las de esta guía. |
