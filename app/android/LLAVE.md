# Llave de firma de ALERTA CERCA (para no re-verificar en cada versión)

El APK de release se firma, por defecto, con la **llave de depuración**. Esa llave cambia entre
computadoras y a veces Android obliga a **desinstalar** la versión anterior antes de instalar la
nueva. Al desinstalar se borra la sesión del teléfono, y por eso la app vuelve a pedir **verificar
el número**.

Con una **llave de release estable** (la misma en cada versión), cada actualización se instala
**encima** de la anterior, sin desinstalar: la sesión y el número verificado se conservan y **ya no
se vuelve a pedir verificar**.

## Crearla una sola vez

Necesitas `keytool` (viene con el JDK). En una terminal, **tú** eliges y escribes la contraseña
(no la guardes en el repositorio):

```bash
keytool -genkeypair -v -keystore app/android/alerta-cerca.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias alerta-cerca
```

Te pedirá una contraseña (anótala en un lugar seguro) y algunos datos (nombre, organización: pon
lo que quieras). Guarda `alerta-cerca.jks` fuera de git (ya está en `.gitignore`).

## Apuntar la app a esa llave

Crea `app/android/key.properties` (tampoco va a git) con tu contraseña:

```properties
storeFile=alerta-cerca.jks
storePassword=LA_QUE_ELEGISTE
keyAlias=alerta-cerca
keyPassword=LA_QUE_ELEGISTE
```

Desde aquí, `shorebird release android ...` firma con esa llave.

## La primera vez, una última desinstalación

Los teléfonos que hoy tienen una versión firmada con la llave de depuración necesitan **una última
desinstalación** para pasar a la nueva firma. Después de eso, todas las versiones futuras se
instalan encima y **ya no hay que verificar de nuevo**.

> Guarda muy bien `alerta-cerca.jks` y su contraseña: si se pierden, no podrás publicar
> actualizaciones que se instalen sobre las ya instaladas (habría que desinstalar otra vez).
