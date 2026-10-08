// Autorización de las funciones internas (notificar, mantenimiento).
//
// Las llama la base de datos con pg_net enviando el encabezado `x-alerta-secreto`, que se
// compara con el secreto SECRETO_FUNCIONES. Por compatibilidad con la propuesta original
// también se acepta `Authorization: Bearer <service_role key>`.

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
export function igualesSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diferencia = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    diferencia |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diferencia === 0;
}

export function autorizado(
  req: Request,
  entorno: { secreto?: string; llaveServicio?: string } = {
    secreto: Deno.env.get('SECRETO_FUNCIONES'),
    llaveServicio: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  },
): boolean {
  const recibido = req.headers.get('x-alerta-secreto');
  if (entorno.secreto && recibido && igualesSeguro(recibido, entorno.secreto)) return true;
  const bearer = req.headers.get('authorization');
  if (entorno.llaveServicio && bearer && igualesSeguro(bearer, `Bearer ${entorno.llaveServicio}`)) return true;
  return false;
}
